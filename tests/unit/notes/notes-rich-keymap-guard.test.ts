import { describe, expect, it } from "vitest";
import { EditorState, TextSelection, NodeSelection } from "prosemirror-state";
import { createNotesRichKeymap } from "@/features/notes/editor/notes-rich-keymap";
import { notesRichEditorSchema as schema, parseNotesRichMarkdown } from "@/features/notes/editor/notes-rich-markdown";

const bindings = createNotesRichKeymap(schema);
describe("rich formatting code-fence guard", () => {
  it.each(["Mod-1", "Mod-0", "Mod-Alt-q", "Mod-Alt-c", "Mod-Alt-u", "Mod-Alt-o", "Mod-Shift-8", "Mod-Shift-9", "Mod-k"])("consumes %s inside code without changing content or metadata", (key) => {
    const doc = parseNotesRichMarkdown("```ts metadata\nconst answer = 42;\n```");
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, 4) });
    let changed = false;
    expect(bindings[key](state, () => { changed = true; })).toBe(true);
    expect(changed).toBe(false);
  });
  it("guards a selected code block node and a selection crossing into code", () => {
    const doc = parseNotesRichMarkdown("ordinary\n\n```js\ncode\n```");
    const start = doc.child(0).nodeSize;
    for (const selection of [NodeSelection.create(doc, start), TextSelection.create(doc, 2, start + 2)]) {
      const state = EditorState.create({ schema, doc, selection });
      let changed = false;
      expect(bindings["Mod-1"](state, () => { changed = true; })).toBe(true);
      expect(changed).toBe(false);
    }
  });
  it("still formats ordinary paragraphs", () => {
    const doc = parseNotesRichMarkdown("ordinary");
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, 2) });
    let next = state;
    expect(bindings["Mod-2"](state, tr => { next = state.apply(tr); })).toBe(true);
    expect(next.doc.firstChild?.type.name).toBe("heading");
    expect(next.doc.firstChild?.attrs.level).toBe(2);
  });
  it("lets ordinary code editing keys fall through to the base editing keymap", () => {
    const doc = parseNotesRichMarkdown("```js\nconst answer = 42;\n```");
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, 4) });
    expect(bindings.Enter(state)).toBe(false);
    expect(bindings.Tab(state)).toBe(false);
  });
});
