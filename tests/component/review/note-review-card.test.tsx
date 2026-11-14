import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NoteReviewCard } from "@/components/review/note-review-card";
import type { NoteReviewItem } from "@/features/note-review/note-review-model";
import type { NotesStorage } from "@/features/notes/note-types";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe("NoteReviewCard", () => {
  const mockItem: NoteReviewItem = {
    id: "item-1",
    noteId: "note-1",
    noteTitle: "Linear Algebra Notes",
    noteRelativePath: "Math/Linear Algebra.md",
    scheduledDate: "2026-11-14",
    addedAt: "2026-11-14T00:00:00Z",
    lastReviewedAt: null,
    reviewCount: 0,
    status: "pending",
  };

  const mockStorage = {
    getPage: vi.fn().mockResolvedValue({
      id: "note-1",
      title: "Linear Algebra Notes",
      markdownBody: "## Eigenvalues\n\nDefinition and algebraic multiplicity.",
    }),
  } as unknown as NotesStorage;

  it("renders card details and handles mastered action", async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();

    render(
      <NoteReviewCard
        item={mockItem}
        notesStorage={mockStorage}
        onPromoteToSpaced={vi.fn()}
        onRemoveFromToday={vi.fn()}
        onStatusChange={onStatusChange}
      />,
    );

    expect(screen.getByText("Linear Algebra Notes")).toBeInTheDocument();
    expect(screen.getByText("Math/Linear Algebra.md")).toBeInTheDocument();

    const masterBtn = screen.getByRole("button", { name: "已掌握 ✓" });
    await user.click(masterBtn);
    expect(onStatusChange).toHaveBeenCalledWith(mockItem.id, "reviewed");
  });

  it("expands markdown preview on toggle", async () => {
    const user = userEvent.setup();

    render(
      <NoteReviewCard
        item={mockItem}
        notesStorage={mockStorage}
        onPromoteToSpaced={vi.fn()}
        onRemoveFromToday={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    );

    const toggleBtn = screen.getByRole("button", { name: /预览正文/i });
    await user.click(toggleBtn);

    await waitFor(() => {
      expect(screen.getByText(/algebraic multiplicity/i)).toBeInTheDocument();
    });
  });

  it("navigates to /notes with resumeNoteId when clicking '不会 / 打开笔记 ↗'", async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();

    render(
      <NoteReviewCard
        item={mockItem}
        notesStorage={mockStorage}
        onPromoteToSpaced={vi.fn()}
        onRemoveFromToday={vi.fn()}
        onStatusChange={onStatusChange}
      />,
    );

    const jumpBtn = screen.getByRole("button", { name: "不会 / 打开笔记 ↗" });
    await user.click(jumpBtn);

    expect(onStatusChange).toHaveBeenCalledWith(mockItem.id, "needs_practice");
    expect(mockPush).toHaveBeenCalledWith(`/notes?resumeNoteId=${encodeURIComponent("note-1")}`);
  });
});
