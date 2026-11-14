import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TodayNoteReviewSection } from "@/components/review/today-note-review-section";
import type { NoteReviewItem } from "@/features/note-review/note-review-model";

describe("TodayNoteReviewSection", () => {
  const queue: NoteReviewItem[] = [
    {
      id: "1",
      noteId: "n1",
      noteTitle: "Algebra",
      noteRelativePath: "Math/Algebra.md",
      scheduledDate: "2026-11-14",
      addedAt: "2026-11-14T00:00:00Z",
      lastReviewedAt: null,
      reviewCount: 0,
      status: "pending",
    },
  ];

  it("renders progress badge and note cards", () => {
    render(
      <TodayNoteReviewSection
        notesStorage={null}
        onOpenPicker={vi.fn()}
        onPromoteToSpaced={vi.fn()}
        onRemoveFromToday={vi.fn()}
        onStatusChange={vi.fn()}
        queue={queue}
        today="2026-11-14"
      />,
    );

    expect(screen.getByText("今日笔记自选回顾")).toBeInTheDocument();
    expect(screen.getByText("已回顾 0 / 1 篇")).toBeInTheDocument();
    expect(screen.getByText("Algebra")).toBeInTheDocument();
  });

  it("renders empty state and calls onOpenPicker when clicking add button", async () => {
    const user = userEvent.setup();
    const onOpenPicker = vi.fn();

    render(
      <TodayNoteReviewSection
        notesStorage={null}
        onOpenPicker={onOpenPicker}
        onPromoteToSpaced={vi.fn()}
        onRemoveFromToday={vi.fn()}
        onStatusChange={vi.fn()}
        queue={[]}
        today="2026-11-14"
      />,
    );

    expect(screen.getByText(/今天还没有选择回顾的笔记/i)).toBeInTheDocument();
    const addBtn = screen.getByRole("button", { name: "从笔记库选择笔记" });
    await user.click(addBtn);
    expect(onOpenPicker).toHaveBeenCalled();
  });
});
