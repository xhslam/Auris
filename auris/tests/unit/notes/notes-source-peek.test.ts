import { TextSelection, EditorState, type Transaction } from "prosemirror-state";
import { describe, expect, it } from "vitest";
import {
  applyNotesSourcePeekMarkdown,
  canUseNotesSourcePeek,
  getNotesSourcePeekRange,
  serializeNotesSourcePeekRange,
} from "@/features/notes/editor/notes-source-peek";
import { parseNotesRichMarkdown } from "@/features/notes/editor/notes-rich-markdown";

function createState(markdown: string, position = 1) {
  const doc = parseNotesRichMarkdown(markdown);

  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, position),
  });
}

describe("notes source peek", () => {
  it("serializes the current prose block as editable Markdown", () => {
    const state = createState("First paragraph\n\nSecond paragraph");
    const range = getNotesSourcePeekRange(state);

    expect(serializeNotesSourcePeekRange(state, range)).toBe("First paragraph");
  });

  it("expands a table selection to the complete table", () => {
    const state = createState(
      ["| A | B |", "| --- | --- |", "| one | two |", "", "After"].join("\n"),
      4,
    );
    const range = getNotesSourcePeekRange(state);

    expect(serializeNotesSourcePeekRange(state, range)).toBe(
      ["| A | B |", "| --- | --- |", "| one | two |"].join("\n"),
    );
  });

  it("commits edited Markdown through a ProseMirror transaction", () => {
    const state = createState("Before");
    const range = getNotesSourcePeekRange(state);
    let nextState = state;
    const view = {
      dispatch(transaction: Transaction) {
        nextState = nextState.apply(transaction);
      },
      state,
    };

    expect(
      applyNotesSourcePeekMarkdown(view, range, "After"),
    ).toBe(true);
    expect(nextState.doc.textContent).toBe("After");
  });

  it("keeps the rich-editor cursor at its relative offset after committing", () => {
    const state = createState("Before", 4);
    const range = getNotesSourcePeekRange(state);
    let nextState = state;
    const view = {
      dispatch(transaction: Transaction) {
        nextState = nextState.apply(transaction);
      },
      state,
    };

    expect(applyNotesSourcePeekMarkdown(view, range, "Afterword")).toBe(true);
    expect(nextState.selection.from).toBe(4);
    expect(nextState.selection.to).toBe(4);
  });

  it("keeps an editable empty paragraph when Source Peek content is cleared", () => {
    const state = createState("Before");
    const range = getNotesSourcePeekRange(state);
    let nextState = state;
    const view = {
      dispatch(transaction: Transaction) {
        nextState = nextState.apply(transaction);
      },
      state,
    };

    expect(applyNotesSourcePeekMarkdown(view, range, "")).toBe(true);
    expect(nextState.doc.childCount).toBe(1);
    expect(nextState.doc.firstChild?.type.name).toBe("paragraph");
    expect(nextState.doc.textContent).toBe("");
  });

  it("keeps code blocks in their dedicated editor instead of opening Source Peek", () => {
    expect(canUseNotesSourcePeek("code_block")).toBe(false);
    expect(canUseNotesSourcePeek("paragraph")).toBe(true);
  });
});
