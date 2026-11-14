import { describe, expect, it } from "vitest";
import {
  EMPTY_NOTE_REVIEW_STATE,
  addNotesToReview,
  getTodayNoteReviewMetrics,
  getTodayNoteReviewQueue,
  removeNoteFromToday,
  updateNoteReviewStatus,
  type NoteReviewState,
} from "@/features/note-review/note-review-model";

describe("note-review-model", () => {
  it("initializes with empty state", () => {
    expect(EMPTY_NOTE_REVIEW_STATE.items).toEqual([]);
    expect(EMPTY_NOTE_REVIEW_STATE.version).toBe(1);
  });

  it("adds notes to review state with scheduledDate as today", () => {
    const today = "2026-11-14";
    const initial: NoteReviewState = { version: 1, items: [] };
    const notesToAdd = [
      { id: "note-1", title: "Linear Algebra", relativePath: "Math/LA.md" },
      { id: "note-2", title: "Quantum Physics", relativePath: "Physics/QP.md" },
    ];

    const next = addNotesToReview(initial, notesToAdd, today);
    expect(next.items).toHaveLength(2);
    expect(next.items[0]).toMatchObject({
      noteId: "note-1",
      noteTitle: "Linear Algebra",
      noteRelativePath: "Math/LA.md",
      scheduledDate: today,
      status: "pending",
      reviewCount: 0,
    });
  });

  it("filters today's queue including overdue uncompleted items", () => {
    const today = "2026-11-14";
    const state: NoteReviewState = {
      version: 1,
      items: [
        {
          id: "1",
          noteId: "n1",
          noteTitle: "Today pending",
          noteRelativePath: "1.md",
          scheduledDate: "2026-11-14",
          addedAt: "2026-11-14T00:00:00Z",
          lastReviewedAt: null,
          reviewCount: 0,
          status: "pending",
        },
        {
          id: "2",
          noteId: "n2",
          noteTitle: "Overdue pending",
          noteRelativePath: "2.md",
          scheduledDate: "2026-11-12",
          addedAt: "2026-11-12T00:00:00Z",
          lastReviewedAt: null,
          reviewCount: 0,
          status: "needs_practice",
        },
        {
          id: "3",
          noteId: "n3",
          noteTitle: "Overdue already reviewed",
          noteRelativePath: "3.md",
          scheduledDate: "2026-11-10",
          addedAt: "2026-11-10T00:00:00Z",
          lastReviewedAt: "2026-11-10T10:00:00Z",
          reviewCount: 1,
          status: "reviewed",
        },
        {
          id: "4",
          noteId: "n4",
          noteTitle: "Unscheduled / removed",
          noteRelativePath: "4.md",
          scheduledDate: "",
          addedAt: "2026-11-01T00:00:00Z",
          lastReviewedAt: null,
          reviewCount: 0,
          status: "pending",
        },
      ],
    };

    const queue = getTodayNoteReviewQueue(state, today);
    expect(queue.map((item) => item.id)).toEqual(["1", "2"]);

    const metrics = getTodayNoteReviewMetrics(state, today);
    expect(metrics.totalToday).toBe(2);
    expect(metrics.completedToday).toBe(0);
    expect(metrics.pendingToday).toBe(2);
  });

  it("updates note status and increments review count", () => {
    const today = "2026-11-14";
    const state: NoteReviewState = {
      version: 1,
      items: [
        {
          id: "1",
          noteId: "n1",
          noteTitle: "Note",
          noteRelativePath: "1.md",
          scheduledDate: today,
          addedAt: "2026-11-14T00:00:00Z",
          lastReviewedAt: null,
          reviewCount: 0,
          status: "pending",
        },
      ],
    };

    const next = updateNoteReviewStatus(state, "1", "reviewed", today);
    expect(next.items[0]?.status).toBe("reviewed");
    expect(next.items[0]?.reviewCount).toBe(1);
    expect(next.items[0]?.lastReviewedAt).toBe(today);

    const metrics = getTodayNoteReviewMetrics(next, today);
    expect(metrics.completedToday).toBe(1);
    expect(metrics.pendingToday).toBe(0);
  });

  it("removes note from today's deck by clearing scheduledDate", () => {
    const today = "2026-11-14";
    const state: NoteReviewState = {
      version: 1,
      items: [
        {
          id: "1",
          noteId: "n1",
          noteTitle: "Note",
          noteRelativePath: "1.md",
          scheduledDate: today,
          addedAt: "2026-11-14T00:00:00Z",
          lastReviewedAt: null,
          reviewCount: 0,
          status: "pending",
        },
      ],
    };

    const next = removeNoteFromToday(state, "1");
    expect(next.items[0]?.scheduledDate).toBe("");
    expect(getTodayNoteReviewQueue(next, today)).toHaveLength(0);
  });
});
