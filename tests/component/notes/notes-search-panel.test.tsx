import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NotesSearchPanel } from "@/components/notes-v2/notes-search-panel";
import { createNoteDocument } from "@/features/notes/documents/document-repository";
import type { NoteDocument } from "@/features/notes/documents/document-types";

function buildMockDoc(i: number): NoteDocument {
  const path = `notes/note-${String(i).padStart(4, "0")}.md`;
  return createNoteDocument({
    mtime: "2026-11-05T00:00:00.000Z",
    path,
    rawSource: `# Note ${i}\n\nBody content ${i}`,
  });
}

describe("NotesSearchPanel", () => {
  it("limits initial visible results to 100 and shows more on clicking load more", async () => {
    const user = userEvent.setup();
    const mockResults = Array.from({ length: 250 }, (_, i) => buildMockDoc(i));
    const onOpenPath = vi.fn();
    const onQueryChange = vi.fn();

    const { rerender } = render(
      <NotesSearchPanel
        onOpenPath={onOpenPath}
        onQueryChange={onQueryChange}
        query="Note"
        results={mockResults}
      />,
    );

    // Initial visible count should be at most 100
    const buttons = screen.getAllByRole("button", { name: /notes\/note-/i });
    expect(buttons).toHaveLength(100);
    expect(screen.getByText("显示 100 / 共 250 条")).toBeInTheDocument();

    // Click "加载更多"
    const loadMoreButton = screen.getByRole("button", { name: "加载更多" });
    await user.click(loadMoreButton);

    const buttonsAfter = screen.getAllByRole("button", { name: /notes\/note-/i });
    expect(buttonsAfter).toHaveLength(200);
    expect(screen.getByText("显示 200 / 共 250 条")).toBeInTheDocument();

    // Reset on query change: re-rendering with new query resets visible count to 100
    rerender(
      <NotesSearchPanel
        onOpenPath={onOpenPath}
        onQueryChange={onQueryChange}
        query="Note 1"
        results={mockResults.slice(0, 150)}
      />,
    );

    const buttonsAfterReset = screen.getAllByRole("button", { name: /notes\/note-/i });
    expect(buttonsAfterReset).toHaveLength(100);
    expect(screen.getByText("显示 100 / 共 150 条")).toBeInTheDocument();
  });
});
