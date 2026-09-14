import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { NotesEditorPane } from "@/components/notes-v2/notes-editor-pane";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import type { NoteDocument } from "@/features/notes/documents/document-types";

type NotesRichEditorHostElement = HTMLDivElement & {
  __notesRichEditorView?: EditorView;
};

function createDocument(rawSource: string): NoteDocument {
  return {
    basename: "table-note",
    fileName: "table-note.md",
    frontmatter: {},
    mtime: "2026-04-20T00:00:00.000Z",
    parsed: {
      backlinks: [],
      embeds: [],
      headings: [],
      links: [],
      tags: [],
      tasks: [],
      title: "Table Note",
      wordCount: 2,
    },
    path: "notes/table-note.md",
    rawSource,
  };
}

function findTextPosition(doc: EditorView["state"]["doc"], text: string) {
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

describe("NotesRichEditorPane table toolbar", () => {
  it("shows the table toolbar in WYSIWYG mode and deletes the selected column", async () => {
    const user = userEvent.setup();
    const onDocumentChange = vi.fn();
    const rawSource = [
      "# Table Note",
      "",
      "| Left | Right |",
      "| --- | --- |",
      "| One | Two |",
    ].join("\n");

    render(
      <NotesEditorPane
        document={createDocument(rawSource)}
        documents={[createDocument(rawSource)]}
        editorMode="wysiwyg"
        onDocumentChange={onDocumentChange}
      />,
    );

    const host = screen.getByTestId("notes-prosemirror-host") as NotesRichEditorHostElement;
    const view = host.__notesRichEditorView;

    expect(view).toBeDefined();

    act(() => {
      const position = findTextPosition(view!.state.doc, "One");
      view!.dispatch(
        view!.state.tr.setSelection(TextSelection.create(view!.state.doc, position)),
      );
    });

    await waitFor(() => {
      expect(
        screen.getByRole("toolbar", {
          name: NOTES_UI_COPY.toolbar.table.toolbarLabel,
        }),
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", {
        name: NOTES_UI_COPY.toolbar.table.deleteColumn,
      }),
    );

    await waitFor(() => {
      expect(onDocumentChange).toHaveBeenCalled();
    });

    const nextSource = onDocumentChange.mock.calls.at(-1)?.[0] ?? "";
    expect(nextSource).toContain("# Table Note");
    expect(nextSource).toContain("| Right |");
    expect(nextSource).toContain("| Two |");
    expect(nextSource).not.toContain("Left");
  });
});
