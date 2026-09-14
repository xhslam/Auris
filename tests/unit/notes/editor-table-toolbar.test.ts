import { describe, expect, it, vi } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { parseNotesRichMarkdown, notesRichEditorSchema, serializeNotesRichMarkdown } from "@/features/notes/editor/notes-rich-markdown";
import {
  getNotesRichTableToolbarState,
  runNotesRichTableToolbarAction,
  type NotesRichTableToolbarView,
} from "@/features/notes/editor/editor-table-toolbar";

function findTextPosition(doc: EditorState["doc"], text: string) {
  let position: number | null = null;

  doc.descendants((node, pos) => {
    if (position !== null) {
      return false;
    }

    if (!node.isText || !node.text?.includes(text)) {
      return true;
    }

    position = pos + node.text.indexOf(text) + 1;
    return false;
  });

  if (position === null) {
    throw new Error(`Could not find text: ${text}`);
  }

  return position;
}

function createState(rawSource: string, selectionText: string) {
  const initialDoc = parseNotesRichMarkdown(rawSource);
  const initialState = EditorState.create({
    doc: initialDoc,
    schema: notesRichEditorSchema,
  });
  const selection = TextSelection.create(
    initialState.doc,
    findTextPosition(initialState.doc, selectionText),
  );

  return initialState.apply(initialState.tr.setSelection(selection));
}

describe("editor table toolbar", () => {
  it("detects active header state from the current selection", () => {
    const state = createState(
      [
        "| Head one | Head two |",
        "| --- | --- |",
        "| Body one | Body two |",
      ].join("\n"),
      "Head one",
    );

    const toolbarState = getNotesRichTableToolbarState(state);

    expect(toolbarState.visible).toBe(true);
    expect(toolbarState.headerRowActive).toBe(true);
    expect(toolbarState.headerColumnActive).toBe(false);
    expect(toolbarState.canDeleteTable).toBe(true);
  });

  it("runs table commands against the current view state", () => {
    let currentState = createState(
      [
        "| Left | Right |",
        "| --- | --- |",
        "| One | Two |",
      ].join("\n"),
      "One",
    );
    const focus = vi.fn();
    const view: NotesRichTableToolbarView = {
      dispatch(tr) {
        currentState = currentState.apply(tr);
      },
      focus,
      get state() {
        return currentState;
      },
    };

    const didRun = runNotesRichTableToolbarAction(view, "deleteColumn");

    expect(didRun).toBe(true);
    expect(focus).toHaveBeenCalled();

    const nextSource = serializeNotesRichMarkdown(currentState.doc);
    expect(nextSource).toContain("| Right |");
    expect(nextSource).toContain("| Two |");
    expect(nextSource).not.toContain("Left");
  });
});
