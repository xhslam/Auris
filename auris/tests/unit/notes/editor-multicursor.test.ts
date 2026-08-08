import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";
import { createNotesEditorState } from "@/features/notes/editor/editor-state-bridge";

describe("notes editor multi-cursor", () => {
  it("keeps multiple cursor ranges so edits can fan out across lines", () => {
    const host = document.createElement("div");
    document.body.append(host);

    const view = new EditorView({
      parent: host,
      state: createNotesEditorState("alpha\nbeta", vi.fn()),
    });
    const firstLine = view.state.doc.line(1);
    const secondLine = view.state.doc.line(2);

    view.dispatch({
      selection: EditorSelection.create([
        EditorSelection.cursor(firstLine.to),
        EditorSelection.cursor(secondLine.to),
      ]),
    });

    expect(view.state.selection.ranges).toHaveLength(2);

    view.destroy();
    host.remove();
  });
});
