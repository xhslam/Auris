import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NotesWorkbenchBottomRight } from "@/components/notes-v2/notes-workbench-bottom-right";
import type { NoteDocument } from "@/features/notes/documents/document-types";

const activeDocument = {
  basename: "daily.md",
  parsed: { headings: [], links: [], tags: [], title: "Daily" },
  path: "daily.md",
  rawSource: "# Daily\n\nWriting",
} as unknown as NoteDocument;

describe("NotesWorkbenchBottomRight", () => {
  it("shows the active note save state beside its Markdown-aware metrics", () => {
    render(
      <NotesWorkbenchBottomRight
        activeDocument={activeDocument}
        backlinks={[]}
        documentSaveState="saving"
        documents={[activeDocument]}
        editorMode="source"
        isTerminalSplitOpen={false}
        learningQuery=""
        learningSnippets={[]}
        onOpenPath={vi.fn()}
        onTerminalSplitToggle={vi.fn()}
        recentDocuments={[]}
        searchQuery=""
        searchResults={[]}
      />,
    );

    expect(screen.getByText("保存中…")).toBeInTheDocument();
    expect(screen.getByText("2 词")).toBeInTheDocument();
    expect(screen.getByText("12 字符")).toBeInTheDocument();
  });
});
