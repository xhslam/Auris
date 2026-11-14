import { beforeEach, describe, expect, it } from "vitest";
import {
  EMPTY_BOOK_REVIEW_STATE,
  getBookReviewMetrics,
  loadReadingBookReviewState,
  recordParagraphReview,
  setActiveReviewBookId,
} from "@/features/reading/reading-book-review-store";

describe("reading-book-review-store", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("loads empty state on initial call", () => {
    const state = loadReadingBookReviewState(window.localStorage);
    expect(state).toEqual(EMPTY_BOOK_REVIEW_STATE);
  });

  it("records paragraph review status and adds unknown to unknown list", () => {
    recordParagraphReview(
      window.localStorage,
      "the-little-prince",
      "小王子",
      "p-1",
      "unknown",
      0,
    );

    const state = loadReadingBookReviewState(window.localStorage);
    expect(state.activeBookId).toBe("the-little-prince");
    const book = state.books["the-little-prince"];
    expect(book).toBeDefined();
    expect(book.paragraphStatuses["p-1"]).toBe("unknown");
    expect(book.unknownParagraphIds).toContain("p-1");

    // Next, master it: should remove from unknown list
    recordParagraphReview(
      window.localStorage,
      "the-little-prince",
      "小王子",
      "p-1",
      "mastered",
      0,
    );

    const updated = loadReadingBookReviewState(window.localStorage);
    expect(updated.books["the-little-prince"].paragraphStatuses["p-1"]).toBe("mastered");
    expect(updated.books["the-little-prince"].unknownParagraphIds).not.toContain("p-1");
  });

  it("sets active review book id", () => {
    setActiveReviewBookId(window.localStorage, "atomic-habits");
    const state = loadReadingBookReviewState(window.localStorage);
    expect(state.activeBookId).toBe("atomic-habits");
  });

  it("computes review metrics correctly", () => {
    const metrics0 = getBookReviewMetrics(undefined, 10);
    expect(metrics0).toEqual({
      total: 10,
      mastered: 0,
      fuzzy: 0,
      unknown: 0,
      unreviewed: 10,
      progressPercent: 0,
    });

    const record = {
      bookId: "b1",
      bookTitle: "Book 1",
      lastReviewedIndex: 2,
      lastReviewedAt: new Date().toISOString(),
      paragraphStatuses: {
        "p-1": "mastered" as const,
        "p-2": "fuzzy" as const,
        "p-3": "unknown" as const,
      },
      unknownParagraphIds: ["p-3"],
    };

    const metrics = getBookReviewMetrics(record, 5);
    expect(metrics.total).toBe(5);
    expect(metrics.mastered).toBe(1);
    expect(metrics.fuzzy).toBe(1);
    expect(metrics.unknown).toBe(1);
    expect(metrics.unreviewed).toBe(2);
    expect(metrics.progressPercent).toBe(20);
  });
});
