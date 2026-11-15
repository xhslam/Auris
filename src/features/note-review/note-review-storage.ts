import {
  EMPTY_NOTE_REVIEW_STATE,
  type NoteReviewState,
} from "@/features/note-review/note-review-model";

export const NOTE_REVIEW_STORAGE_KEY = "auris.note-review.v1";
export const NOTE_REVIEW_STORAGE_EVENT = "auris:note-review-changed";

export function readNoteReviewState(storage: Storage | null): NoteReviewState {
  if (!storage) return EMPTY_NOTE_REVIEW_STATE;
  try {
    const raw = storage.getItem(NOTE_REVIEW_STORAGE_KEY);
    if (!raw) return EMPTY_NOTE_REVIEW_STATE;

    const parsed = JSON.parse(raw) as Partial<NoteReviewState> | null;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.items)) {
      return EMPTY_NOTE_REVIEW_STATE;
    }
    return parsed as NoteReviewState;
  } catch {
    return EMPTY_NOTE_REVIEW_STATE;
  }
}

export function writeNoteReviewState(storage: Storage | null, state: NoteReviewState): void {
  if (!storage) return;
  try {
    storage.setItem(NOTE_REVIEW_STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent(NOTE_REVIEW_STORAGE_EVENT));
  } catch {
    // Local persistence is best-effort; the current renderer state remains usable.
  }
}
