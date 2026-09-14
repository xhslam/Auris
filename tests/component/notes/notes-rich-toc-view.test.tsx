import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NotesRichEditorPane } from "@/components/notes-v2/notes-rich-editor-pane";
import type { NoteDocument } from "@/features/notes/documents/document-types";

function createDocument(): NoteDocument {
  return {
    basename: "study-plan",
    fileName: "study-plan.md",
    frontmatter: {},
    mtime: "2026-08-13T00:00:00.000Z",
    parsed: {
      backlinks: [],
      embeds: [],
      headings: [],
      links: [],
      tags: [],
      tasks: [],
      title: "Study plan",
      wordCount: 0,
    },
    path: "notes/study-plan.md",
    rawSource: "# Study plan\n\n[TOC]\n\n## Listening\n\nPractice daily.",
  };
}

describe("NotesRichEditorPane table of contents", () => {
  it("renders VMark [TOC] as a live navigator populated from headings", async () => {
    const document = createDocument();
    render(
      <NotesRichEditorPane
        document={document}
        documents={[document]}
        onDocumentChange={vi.fn()}
      />,
    );

    const navigator = await screen.findByRole("navigation", {
      name: "文档目录",
    });
    expect(
      within(navigator).getByRole("button", { name: "Study plan" }),
    ).toBeInTheDocument();
    expect(
      within(navigator).getByRole("button", { name: "Listening" }),
    ).toBeInTheDocument();
  });
});
