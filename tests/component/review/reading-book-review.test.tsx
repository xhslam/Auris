import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReadingBookReview } from "@/components/review/reading-book-review";
import { TodayBookReviewCard } from "@/components/review/today-book-review-card";
import { loadReadingBookReviewState } from "@/features/reading/reading-book-review-store";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe("Reading Book Review", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockPush.mockClear();
  });

  describe("TodayBookReviewCard", () => {
    it("renders book selector, paragraph preview and handles mastered action", async () => {
      const user = userEvent.setup();
      const onGoToReadingReview = vi.fn();
      const onNotice = vi.fn();

      render(
        <TodayBookReviewCard
          onGoToReadingReview={onGoToReadingReview}
          onNotice={onNotice}
        />,
      );

      expect(screen.getByRole("region", { name: "Reading 书籍每日回顾" })).toBeInTheDocument();
      const select = screen.getByRole("combobox", { name: "选择要回顾的书籍" });
      expect(select).toBeInTheDocument();

      // Switch to atomic-habits
      await user.selectOptions(select, "atomic-habits");
      expect(screen.getByText(/You do not rise to the level of your goals/i)).toBeInTheDocument();

      // Click "记住了"
      const masterBtn = screen.getByRole("button", { name: "记住了" });
      await user.click(masterBtn);
      expect(onNotice).toHaveBeenCalledWith("已标记为掌握！");

      const state = loadReadingBookReviewState(window.localStorage);
      expect(state.books["atomic-habits"]?.paragraphStatuses["atomic-habits-1"]).toBe("mastered");

      // Click "进入完整回顾"
      const openFullBtn = screen.getByRole("button", { name: /进入完整回顾/ });
      await user.click(openFullBtn);
      expect(onGoToReadingReview).toHaveBeenCalled();
    });

    it("jumps to notes when clicking '不会，跳转到笔记中回顾'", async () => {
      const user = userEvent.setup();
      const onNotice = vi.fn();

      render(
        <TodayBookReviewCard
          onGoToReadingReview={vi.fn()}
          onNotice={onNotice}
        />,
      );

      const jumpBtn = screen.getByRole("button", { name: /不会，跳转到笔记中回顾/ });
      await user.click(jumpBtn);

      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("/notes?resumeNoteId="));
      expect(onNotice).toHaveBeenCalledWith(expect.stringContaining("正在跳转到"));

      // Verify that this paragraph was recorded as unknown
      const state = loadReadingBookReviewState(window.localStorage);
      const activeBookId = state.activeBookId || "the-little-prince";
      expect(state.books[activeBookId]?.unknownParagraphIds.length).toBeGreaterThan(0);
    });
  });

  describe("ReadingBookReview", () => {
    it("renders full book review interface, switches books and toggles translation", async () => {
      const user = userEvent.setup();
      render(<ReadingBookReview onNotice={vi.fn()} onGoToToday={vi.fn()} />);

      expect(screen.getByRole("region", { name: "Reading 书籍回顾" })).toBeInTheDocument();
      expect(screen.getByText(/唯有用心才能看清事物|All grown-ups were once children/i)).toBeInTheDocument();

      // Click reveal button to see translation and analysis
      const revealTrigger = screen.getByRole("button", { name: /先在大脑中回忆意思/ });
      await user.click(revealTrigger);

      expect(screen.getByText(/所有的大人都曾经是小孩子/i)).toBeInTheDocument();
      expect(screen.getByText(/经典开篇献辞/i)).toBeInTheDocument();
    });

    it("marks paragraph as mastered and advances to next", async () => {
      const user = userEvent.setup();
      const onNotice = vi.fn();
      render(<ReadingBookReview onNotice={onNotice} onGoToToday={vi.fn()} />);

      const masterBtn = screen.getByRole("button", { name: /记住了 \/ 掌握/ });
      await user.click(masterBtn);

      expect(onNotice).toHaveBeenCalledWith(expect.stringContaining("已标记为掌握"));
      // Advanced to paragraph 2
      expect(screen.getByText(/段落 2 \//)).toBeInTheDocument();
      expect(screen.getByText(/It is only with the heart that one can see rightly/i)).toBeInTheDocument();
    });

    it("marks as unknown and jumps to notes when clicking '不会，跳转到笔记中回顾'", async () => {
      const user = userEvent.setup();
      const onNotice = vi.fn();
      render(<ReadingBookReview onNotice={onNotice} onGoToToday={vi.fn()} />);

      const jumpBtn = screen.getByRole("button", { name: /不会，跳转到笔记中回顾/ });
      await user.click(jumpBtn);

      // Should route to /notes?resumeNoteId=...
      expect(mockPush).toHaveBeenCalledWith(expect.stringMatching(/\/notes\?resumeNoteId=the-little-prince/));
      expect(onNotice).toHaveBeenCalledWith(expect.stringContaining("正在跳转到《小王子"));

      // Status in store should be unknown
      const state = loadReadingBookReviewState(window.localStorage);
      expect(state.books["the-little-prince"]?.paragraphStatuses["the-little-prince-1"]).toBe("unknown");
      expect(state.books["the-little-prince"]?.unknownParagraphIds).toContain("the-little-prince-1");
    });

    it("filters to '不会 / 待攻克' paragraphs", async () => {
      const user = userEvent.setup();
      render(<ReadingBookReview onNotice={vi.fn()} onGoToToday={vi.fn()} />);

      // Mark first paragraph as unknown
      const jumpBtn = screen.getByRole("button", { name: /不会，跳转到笔记中回顾/ });
      await user.click(jumpBtn);

      // Click filter: 不会 / 待攻克
      const unknownFilterBtn = screen.getByRole("button", { name: /不会 \/ 待攻克/ });
      await user.click(unknownFilterBtn);

      // Now only 1 paragraph should be in the filtered list
      expect(screen.getByText(/段落 1 \/ 1/)).toBeInTheDocument();
      expect(screen.getByText(/All grown-ups were once children/i)).toBeInTheDocument();
    });

    it("toggles outline drawer and navigates to selected paragraph", async () => {
      const user = userEvent.setup();
      render(<ReadingBookReview onNotice={vi.fn()} onGoToToday={vi.fn()} />);

      // Click "展开段落索引"
      const toggleOutlineBtn = screen.getByRole("button", { name: /展开段落索引/ });
      await user.click(toggleOutlineBtn);

      expect(screen.getByText("点击任意段落直接跳转")).toBeInTheDocument();

      // Click paragraph 3 in the outline list
      const para3Btn = screen.getByRole("button", { name: /#3.*rose/i });
      await user.click(para3Btn);

      expect(screen.getByText(/段落 3 \//)).toBeInTheDocument();
      expect(within(screen.getByRole("article")).getByText(/It is the time you have wasted for your rose/i)).toBeInTheDocument();
    });

    it("supports keyboard shortcuts: Space to reveal, ArrowRight/Left to navigate", async () => {
      render(<ReadingBookReview onNotice={vi.fn()} onGoToToday={vi.fn()} />);

      expect(screen.getByText(/段落 1 \//)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /先在大脑中回忆意思/ })).toBeInTheDocument();

      // Press Space to reveal
      fireEvent.keyDown(window, { code: "Space" });
      expect(screen.getByText(/所有的大人都曾经是小孩子/i)).toBeInTheDocument();

      // Press ArrowRight to go to next paragraph
      fireEvent.keyDown(window, { key: "ArrowRight" });
      expect(screen.getByText(/段落 2 \//)).toBeInTheDocument();

      // Press ArrowLeft to go back
      fireEvent.keyDown(window, { key: "ArrowLeft" });
      expect(screen.getByText(/段落 1 \//)).toBeInTheDocument();
    });
  });
});
