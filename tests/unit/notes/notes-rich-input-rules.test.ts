import { describe, expect, it } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import type { Selection, Transaction } from "prosemirror-state";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import { notesRichEditorSchema } from "@/features/notes/editor/notes-rich-markdown";
import { createNotesRichInputRules } from "@/features/notes/editor/notes-rich-input-rules";
import { createNotesRichKeymap } from "@/features/notes/editor/notes-rich-keymap";

function paragraphDoc(text: string): ProseMirrorNode {
  return notesRichEditorSchema.node("doc", null, [
    notesRichEditorSchema.node(
      "paragraph",
      null,
      text ? notesRichEditorSchema.text(text) : undefined,
    ),
  ]);
}

/**
 * Simulate the user typing `typedChar` at the end of a paragraph that already
 * contains `existingText`, driving the input-rules plugin the same way
 * ProseMirror does (handleTextInput fires before the char is inserted).
 */
function typeAtEnd(existingText: string, typedChar: string) {
  const plugin = createNotesRichInputRules(notesRichEditorSchema);
  const doc = paragraphDoc(existingText);
  let state = EditorState.create({
    doc,
    plugins: [plugin],
    schema: notesRichEditorSchema,
    selection: TextSelection.atEnd(doc),
  });
  const view = {
    get state() {
      return state;
    },
    dispatch(tr: Transaction) {
      state = state.apply(tr);
    },
  };
  const from = state.selection.from;
  const handled = plugin.props.handleTextInput?.call(
    plugin,
    view as never,
    from,
    from,
    typedChar,
    () => state.tr.insertText(typedChar, from, from),
  );

  return { handled, doc: state.doc };
}

function firstTextNode(doc: ProseMirrorNode) {
  let found: ProseMirrorNode | null = null;
  doc.descendants((node) => {
    if (!found && node.isText) {
      found = node;
    }
  });
  return found as ProseMirrorNode | null;
}

describe("notes rich input rules", () => {
  it("turns `# ` into an H1 heading", () => {
    const { handled, doc } = typeAtEnd("#", " ");
    expect(handled).toBe(true);
    expect(doc.firstChild?.type.name).toBe("heading");
    expect(doc.firstChild?.attrs.level).toBe(1);
  });

  it("turns `### ` into an H3 heading", () => {
    const { doc } = typeAtEnd("###", " ");
    expect(doc.firstChild?.type.name).toBe("heading");
    expect(doc.firstChild?.attrs.level).toBe(3);
  });

  it("turns `- ` into a bullet list", () => {
    const { doc } = typeAtEnd("-", " ");
    expect(doc.firstChild?.type.name).toBe("bullet_list");
  });

  it("turns `1. ` into an ordered list", () => {
    const { doc } = typeAtEnd("1.", " ");
    expect(doc.firstChild?.type.name).toBe("ordered_list");
  });

  it("turns `> ` into a blockquote", () => {
    const { doc } = typeAtEnd(">", " ");
    expect(doc.firstChild?.type.name).toBe("blockquote");
  });

  it("applies strong when closing **bold**", () => {
    const { handled, doc } = typeAtEnd("**bold*", "*");
    expect(handled).toBe(true);
    const text = firstTextNode(doc);
    expect(text?.text).toBe("bold");
    expect(text?.marks.some((mark) => mark.type.name === "strong")).toBe(true);
  });

  it("applies em when closing *italic* (CJK context)", () => {
    const { doc } = typeAtEnd("你好*世界", "*");
    const marked = firstTextNode(doc);
    // The leading "你好" stays plain; the emphasised run is "世界".
    let emphasised: ProseMirrorNode | null = null;
    doc.descendants((node) => {
      if (node.isText && node.marks.some((m) => m.type.name === "em")) {
        emphasised = node;
      }
    });
    expect(marked).not.toBeNull();
    expect((emphasised as ProseMirrorNode | null)?.text).toBe("世界");
  });

  it("applies inline code when closing `code`", () => {
    const { doc } = typeAtEnd("`code", "`");
    const text = firstTextNode(doc);
    expect(text?.text).toBe("code");
    expect(text?.marks.some((mark) => mark.type.name === "code")).toBe(true);
  });

  it("applies strikethrough when closing ~~text~~", () => {
    const { handled, doc } = typeAtEnd("~~strike~", "~");
    expect(handled).toBe(true);
    const text = firstTextNode(doc);
    expect(text?.text).toBe("strike");
    expect(text?.marks.some((mark) => mark.type.name === "strikethrough")).toBe(true);
  });
});

describe("notes rich keymap", () => {
  const keys = createNotesRichKeymap(notesRichEditorSchema);

  function runCommand(key: string, doc: ProseMirrorNode, selection: Selection) {
    let next: EditorState | null = null;
    const state = EditorState.create({
      doc,
      schema: notesRichEditorSchema,
      selection,
    });
    keys[key]?.(state, (tr: Transaction) => {
      next = state.apply(tr);
    });
    return next as EditorState | null;
  }

  it("Mod-1 toggles the current block to a heading", () => {
    const doc = paragraphDoc("hello");
    const next = runCommand("Mod-1", doc, TextSelection.atEnd(doc));
    expect(next?.doc.firstChild?.type.name).toBe("heading");
  });

  it("Mod-1 on an existing H1 toggles back to a paragraph", () => {
    const doc = notesRichEditorSchema.node("doc", null, [
      notesRichEditorSchema.node(
        "heading",
        { level: 1 },
        notesRichEditorSchema.text("hello"),
      ),
    ]);
    const next = runCommand("Mod-1", doc, TextSelection.atEnd(doc));
    expect(next?.doc.firstChild?.type.name).toBe("paragraph");
  });

  it("Mod-b wraps the selection in strong", () => {
    const doc = paragraphDoc("hello");
    const selection = TextSelection.create(doc, 1, 6);
    const next = runCommand("Mod-b", doc, selection);
    let hasStrong = false;
    next?.doc.descendants((node) => {
      if (node.isText && node.marks.some((m) => m.type.name === "strong")) {
        hasStrong = true;
      }
    });
    expect(hasStrong).toBe(true);
  });

  it("Mod-Shift-x wraps the selection in strikethrough", () => {
    const doc = paragraphDoc("hello");
    const selection = TextSelection.create(doc, 1, 6);
    const next = runCommand("Mod-Shift-x", doc, selection);
    let hasStrike = false;
    next?.doc.descendants((node) => {
      if (node.isText && node.marks.some((m) => m.type.name === "strikethrough")) {
        hasStrike = true;
      }
    });
    expect(hasStrike).toBe(true);
  });

  it("Enter cleanly handles cross-block selection without throwing (F5)", () => {
    const doc = notesRichEditorSchema.node("doc", null, [
      notesRichEditorSchema.node("paragraph", null, [notesRichEditorSchema.text("block one")]),
      notesRichEditorSchema.node("paragraph", null, [notesRichEditorSchema.text("block two")]),
    ]);
    // Selection spanning from middle of block 1 to middle of block 2
    const selection = TextSelection.create(doc, 5, 16);
    const next = runCommand("Enter", doc, selection);
    expect(next).not.toBeNull();
    // After split, there should be 2 paragraph blocks with selection deleted
    expect(next?.doc.childCount).toBe(2);
  });
});
