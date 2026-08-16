import {
  EMPTY_OUTPUT_REVIEW_STATE,
  type OutputReviewState,
} from "@/features/output-review/output-review-model";

export const OUTPUT_REVIEW_STORAGE_KEY = "auris.output-review.v1";
export const OUTPUT_REVIEW_STORAGE_EVENT = "auris:output-review-changed";

export function readOutputReviewState(storage: Storage | null): OutputReviewState {
  if (!storage) return EMPTY_OUTPUT_REVIEW_STATE;
  try {
    const parsed = JSON.parse(storage.getItem(OUTPUT_REVIEW_STORAGE_KEY) ?? "null") as Partial<OutputReviewState> | null;
    if (
      !parsed ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.projects) ||
      !Array.isArray(parsed.knowledgePoints) ||
      !Array.isArray(parsed.cycles)
    ) {
      return EMPTY_OUTPUT_REVIEW_STATE;
    }
    return parsed as OutputReviewState;
  } catch {
    return EMPTY_OUTPUT_REVIEW_STATE;
  }
}

export function writeOutputReviewState(storage: Storage | null, state: OutputReviewState) {
  if (!storage) return;
  try {
    storage.setItem(OUTPUT_REVIEW_STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent(OUTPUT_REVIEW_STORAGE_EVENT));
  } catch {
    // Local persistence is best-effort; the current renderer state remains usable.
  }
}
