import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NotesEditorPane } from "@/components/notes-v2/notes-editor-pane";
import type { NoteDocument } from "@/features/notes/documents/document-types";

function openFindToolbar() {
  const surface = document.querySelector(
    ".notes-v2__editor-surface",
  ) as HTMLElement | null;

  if (!surface) {
    throw new Error("Source editor surface was not rendered");
  }

  fireEvent.keyDown(surface, { key: "f", metaKey: true });
}

function createDocument(rawSource: string): NoteDocument {
  return {
    basename: "daily-review",
    fileName: "daily-review.md",
    frontmatter: {},
    mtime: "2026-04-20T00:00:00.000Z",
    parsed: {
      backlinks: [],
      embeds: [],
      headings: [
        {
          depth: 1,
          line: 0,
          slug: "daily-review",
          text: "Daily Review",
        },
      ],
      links: [],
      tags: ["shadowing"],
      tasks: [],
      title: "Daily Review",
      wordCount: 9,
    },
    path: "notes/daily-review.md",
    rawSource,
  };
}

describe("notes find and replace", () => {
  it("highlights matches in the source editor when a search query is entered", async () => {
    render(
      <NotesEditorPane
        document={createDocument("# Daily Review\n\nAlpha beta beta")}
        documents={[createDocument("# Daily Review\n\nAlpha beta beta")]}
        editorMode="source"
        onDocumentChange={vi.fn()}
      />,
    );

    openFindToolbar();

    fireEvent.change(screen.getByLabelText("查找"), {
      target: { value: "beta" },
    });

    await waitFor(() => {
      expect(
        document.querySelectorAll(".notes-v2__cm-search-match"),
      ).toHaveLength(2);
    });
  });

  it("replaces all matches from the source editor toolbar", async () => {
    const onDocumentChange = vi.fn();

    render(
      <NotesEditorPane
        document={createDocument("# Daily Review\n\nAlpha beta beta")}
        documents={[createDocument("# Daily Review\n\nAlpha beta beta")]}
        editorMode="source"
        onDocumentChange={onDocumentChange}
      />,
    );

    openFindToolbar();

    fireEvent.change(screen.getByLabelText("查找"), {
      target: { value: "beta" },
    });
    fireEvent.change(screen.getByLabelText("替换"), {
      target: { value: "delta" },
    });
    fireEvent.click(screen.getByRole("button", { name: "全部替换" }));

    await waitFor(() => {
      expect(onDocumentChange).toHaveBeenLastCalledWith(
        "# Daily Review\n\nAlpha delta delta",
      );
    });
  });
});
