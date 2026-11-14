import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  NOTE_REVIEW_STORAGE_KEY,
  NOTE_REVIEW_STORAGE_EVENT,
  readNoteReviewState,
  writeNoteReviewState,
} from "@/features/note-review/note-review-storage";
import { EMPTY_NOTE_REVIEW_STATE, type NoteReviewState } from "@/features/note-review/note-review-model";

describe("note-review-storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("reads empty state when storage key is missing", () => {
    const state = readNoteReviewState(window.localStorage);
    expect(state).toEqual(EMPTY_NOTE_REVIEW_STATE);
  });

  it("reads empty state on corrupted JSON without crashing", () => {
    window.localStorage.setItem(NOTE_REVIEW_STORAGE_KEY, "invalid-json{{");
    const state = readNoteReviewState(window.localStorage);
    expect(state).toEqual(EMPTY_NOTE_REVIEW_STATE);
  });

  it("writes state and dispatches custom event", () => {
    const listener = vi.fn();
    window.addEventListener(NOTE_REVIEW_STORAGE_EVENT, listener);

    const testState: NoteReviewState = {
      version: 1,
      items: [
        {
          id: "item-1",
          noteId: "note-1",
          noteTitle: "Test Note",
          noteRelativePath: "test.md",
          scheduledDate: "2026-11-14",
          addedAt: "2026-11-14T00:00:00Z",
          lastReviewedAt: null,
          reviewCount: 0,
          status: "pending",
        },
      ],
    };

    writeNoteReviewState(window.localStorage, testState);
    expect(listener).toHaveBeenCalled();

    const loaded = readNoteReviewState(window.localStorage);
    expect(loaded.items).toHaveLength(1);
    expect(loaded.items[0]?.noteTitle).toBe("Test Note");

    window.removeEventListener(NOTE_REVIEW_STORAGE_EVENT, listener);
  });
});
