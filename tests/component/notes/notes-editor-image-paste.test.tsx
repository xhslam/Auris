import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotesEditorPane } from "@/components/notes-v2/notes-editor-pane";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import type { EditorView } from "@codemirror/view";

type NotesEditorHostElement = HTMLDivElement & {
  __notesEditorView?: EditorView;
};

function createDocument(rawSource: string): NoteDocument {
  return {
    basename: "daily-review",
    fileName: "daily-review.md",
    frontmatter: {},
    mtime: "2026-04-20T00:00:00.000Z",
    parsed: {
      backlinks: [],
      embeds: [],
      headings: [],
      links: [],
      tags: [],
      tasks: [],
      title: "Daily Review",
      wordCount: 1,
    },
    path: "notes/daily-review.md",
    rawSource,
  };
}

describe("NotesEditorPane image paste", () => {
  afterEach(() => {
    delete (window as Window & { shadowingDesktop?: unknown }).shadowingDesktop;
  });

  it("does not persist or insert pasted images while read-only", async () => {
    const saveFile = vi.fn(async () => undefined);
    (window as Window & { shadowingDesktop?: { vault?: { saveFile?: typeof saveFile } } })
      .shadowingDesktop = { vault: { saveFile } };
    const onDocumentChange = vi.fn();

    render(
      <NotesEditorPane
        document={createDocument("Paragraph")}
        documents={[createDocument("Paragraph")]}
        editorMode="source"
        onDocumentChange={onDocumentChange}
        viewPreferences={{
          focusMode: false,
          fontSize: 18,
          readOnly: true,
          typewriterMode: false,
        }}
      />,
    );

    const host = screen.getByTestId("notes-codemirror-host");
    const editor = host.querySelector(".cm-content") ?? host;
    fireEvent.paste(editor, {
      clipboardData: {
        files: [new File([new Uint8Array([1, 2, 3])], "blocked.png", {
          type: "image/png",
        })],
      },
    });

    await Promise.resolve();
    expect(saveFile).not.toHaveBeenCalled();
    expect(onDocumentChange).not.toHaveBeenCalled();
  });

  it("saves pasted image files into the note assets folder and inserts a markdown image line", async () => {
    const saveFile = vi.fn(async () => undefined);
    (window as Window & { shadowingDesktop?: { vault?: { saveFile?: typeof saveFile } } })
      .shadowingDesktop = {
      vault: {
        saveFile,
      },
    };

    const onDocumentChange = vi.fn();

    render(
      <NotesEditorPane
        document={createDocument("Paragraph")}
        documents={[createDocument("Paragraph")]}
        editorMode="source"
        onDocumentChange={onDocumentChange}
      />,
    );

    const host = screen.getByTestId("notes-codemirror-host");
    const view = (host as NotesEditorHostElement).__notesEditorView;

    act(() => {
      view?.dispatch({
        selection: {
          anchor: view.state.doc.length,
        },
      });
    });

    const editor = host.querySelector(".cm-content") ?? host;
    const file = new File([new Uint8Array([1, 2, 3])], "Cover Photo.PNG", {
      type: "image/png",
    });

    fireEvent.paste(editor, {
      clipboardData: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(saveFile).toHaveBeenCalled();
    });

    expect(saveFile.mock.calls[0]?.[0]).toMatch(
      /^notes\/assets\/daily-review-cover-photo-[\w-]+\.png$/,
    );
    expect(saveFile.mock.calls[0]?.[1]).toBeInstanceOf(Uint8Array);

    await waitFor(() => {
      expect(onDocumentChange).toHaveBeenCalledWith(
        expect.stringMatching(
          /Paragraph[\s\S]*!\[Cover Photo\]\(assets\/daily-review-cover-photo-[\w-]+\.png\)/,
        ),
      );
    });
  });
});
