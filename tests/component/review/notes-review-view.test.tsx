import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NotesReviewView } from "@/components/review/notes-review-view";
import type { NoteReviewState } from "@/features/note-review/note-review-model";

describe("NotesReviewView", () => {
  const state: NoteReviewState = {
    version: 1,
    items: [
      {
        id: "1",
        noteId: "n1",
        noteTitle: "Linear Algebra",
        noteRelativePath: "Math/LA.md",
        scheduledDate: "2026-11-14",
        addedAt: "2026-11-14T00:00:00Z",
        lastReviewedAt: null,
        reviewCount: 0,
        status: "pending",
      },
      {
        id: "2",
        noteId: "n2",
        noteTitle: "Physics Optics",
        noteRelativePath: "Physics/Optics.md",
        scheduledDate: "2026-11-14",
        addedAt: "2026-11-14T00:00:00Z",
        lastReviewedAt: "2026-11-14T01:00:00Z",
        reviewCount: 1,
        status: "reviewed",
      },
    ],
  };

  it("renders list and supports filter chips", async () => {
    const user = userEvent.setup();

    render(
      <NotesReviewView
        notesStorage={null}
        onDelete={vi.fn()}
        onOpenPicker={vi.fn()}
        onPromoteToSpaced={vi.fn()}
        onRemoveFromToday={vi.fn()}
        onStatusChange={vi.fn()}
        state={state}
        today="2026-11-14"
      />,
    );

    expect(screen.getByText("Linear Algebra")).toBeInTheDocument();
    expect(screen.getByText("Physics Optics")).toBeInTheDocument();

    // Click "已回顾" filter
    const reviewedFilter = screen.getByRole("button", { name: "已回顾" });
    await user.click(reviewedFilter);

    expect(screen.queryByText("Linear Algebra")).not.toBeInTheDocument();
    expect(screen.getByText("Physics Optics")).toBeInTheDocument();
  });
});
