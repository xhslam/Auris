import { describe, expect, it } from "vitest";
import { buildNoteHtmlExport } from "@/features/notes/export/note-export";
import type { NoteDocument } from "@/features/notes/documents/document-types";

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

describe("note export", () => {
  it("renders markdown, tables, and KaTeX blocks into a standalone HTML document", () => {
    const html = buildNoteHtmlExport(
      createDocument(
        [
          "# Daily Review",
          "",
          "| Cue | Note |",
          "| --- | --- |",
          "| rhythm | stress |",
          "",
          "```math",
          "x^2",
          "```",
        ].join("\n"),
      ),
    );

    expect(html).toContain("<title>Daily Review</title>");
    expect(html).toContain("<h1>Daily Review</h1>");
    expect(html).toContain("<table>");
    expect(html).toContain("rhythm");
    expect(html).toContain("katex");
  });
});
