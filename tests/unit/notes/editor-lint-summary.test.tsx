import path from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NotesEditorPane } from "@/components/notes-v2/notes-editor-pane";
import type { NoteDocument } from "@/features/notes/documents/document-types";

function createDocument(rawSource: string, notePath = "notes/lint.md"): NoteDocument {
  return {
    basename: path.basename(notePath, path.extname(notePath)),
    fileName: path.basename(notePath),
    frontmatter: {},
    mtime: "2026-08-08T00:00:00.000Z",
    parsed: {
      backlinks: [],
      embeds: [],
      headings: [],
      links: [],
      tags: [],
      tasks: [],
      title: "Lint",
      wordCount: 0,
    },
    path: notePath,
    rawSource,
  };
}

function renderPane(rawSource: string, notePath?: string) {
  const document = createDocument(rawSource, notePath);

  return render(
    <NotesEditorPane
      document={document}
      documents={[document]}
      editorMode="source"
      onDocumentChange={vi.fn()}
    />,
  );
}

describe("notes editor lint removal", () => {
  it("does not expose a lint summary or diagnostics panel", () => {
    const { container } = renderPane("# Title\n\n```text\nstill open\n");

    expect(container.querySelector(".notes-v2__lint-summary")).toBeNull();
    expect(container.querySelector(".notes-v2__lint-diagnostics")).toBeNull();
  });
});
