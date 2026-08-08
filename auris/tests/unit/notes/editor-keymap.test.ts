import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, type KeyBinding } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { notesEditorKeymap } from "@/features/notes/editor/editor-keymap";

function selectCursor(position: number) {
  return EditorSelection.create([EditorSelection.cursor(position)]);
}

function selectRange(from: number, to: number) {
  return EditorSelection.create([EditorSelection.range(from, to)]);
}

function createView(doc: string, selection: EditorSelection) {
  const host = document.createElement("div");
  document.body.append(host);

  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc,
      selection,
    }),
  });

  return {
    destroy() {
      view.destroy();
      host.remove();
    },
    view,
  };
}

function runShortcut(view: EditorView, key: string) {
  const binding = notesEditorKeymap.find(
    (entry): entry is KeyBinding & { run: NonNullable<KeyBinding["run"]> } =>
      entry.key === key && typeof entry.run === "function",
  );

  if (!binding) {
    throw new Error(`Expected notes editor shortcut ${key}`);
  }

  expect(binding.run(view)).toBe(true);
}

describe("notes editor keymap", () => {
  it("toggles inline Markdown markers without losing the selected text", () => {
    const source = "plain bold text";
    const start = source.indexOf("bold");
    const end = start + "bold".length;
    const { destroy, view } = createView(
      source,
      selectRange(start, end),
    );

    try {
      runShortcut(view, "Mod-b");

      expect(view.state.doc.toString()).toBe("plain **bold** text");
      expect(view.state.sliceDoc(
        view.state.selection.main.from,
        view.state.selection.main.to,
      )).toBe("bold");

      runShortcut(view, "Mod-b");

      expect(view.state.doc.toString()).toBe(source);
      expect(view.state.sliceDoc(
        view.state.selection.main.from,
        view.state.selection.main.to,
      )).toBe("bold");
    } finally {
      destroy();
    }
  });

  it("wraps selected text as a Markdown link and advances through link fields with Tab", () => {
    const source = "open example";
    const start = source.indexOf("example");
    const end = start + "example".length;
    const { destroy, view } = createView(
      source,
      selectRange(start, end),
    );

    try {
      runShortcut(view, "Mod-k");

      expect(view.state.doc.toString()).toBe("open [example](url)");
      expect(view.state.sliceDoc(
        view.state.selection.main.from,
        view.state.selection.main.to,
      )).toBe("url");

      const labelPosition = view.state.doc.toString().indexOf("example") + 2;

      view.dispatch({
        selection: selectCursor(labelPosition),
      });
      runShortcut(view, "Tab");

      expect(view.state.selection.main.head).toBe(
        view.state.doc.toString().indexOf("url"),
      );

      runShortcut(view, "Tab");

      expect(view.state.selection.main.head).toBe(
        view.state.doc.toString().length,
      );
    } finally {
      destroy();
    }
  });

  it("adds vmark-style block shortcuts for lists, quotes, code blocks, and dividers", () => {
    const { destroy, view } = createView(
      "first\nsecond",
      selectRange(0, "first\nsecond".length),
    );

    try {
      runShortcut(view, "Mod-Alt-u");
      expect(view.state.doc.toString()).toBe("- first\n- second");

      runShortcut(view, "Mod-Alt-u");
      expect(view.state.doc.toString()).toBe("first\nsecond");

      runShortcut(view, "Mod-Alt-q");
      expect(view.state.doc.toString()).toBe("> first\n> second");
    } finally {
      destroy();
    }

    const code = createView("snippet", selectRange(0, "snippet".length));

    try {
      runShortcut(code.view, "Mod-Alt-c");
      expect(code.view.state.doc.toString()).toBe("```\nsnippet\n```");
    } finally {
      code.destroy();
    }

    const divider = createView("before", selectCursor("before".length));

    try {
      runShortcut(divider.view, "Mod-Alt--");
      expect(divider.view.state.doc.toString()).toBe("before\n---\n");
    } finally {
      divider.destroy();
    }
  });

  it("supports heading levels one through six with Mod-number shortcuts", () => {
    const { destroy, view } = createView("heading", selectCursor(0));

    try {
      runShortcut(view, "Mod-4");
      expect(view.state.doc.toString()).toBe("#### heading");

      runShortcut(view, "Mod-4");
      expect(view.state.doc.toString()).toBe("heading");

      runShortcut(view, "Mod-6");
      expect(view.state.doc.toString()).toBe("###### heading");
    } finally {
      destroy();
    }
  });
});
