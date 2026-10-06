import {
  EMPTY_OUTPUT_REVIEW_STATE,
  type OutputReviewState,
} from "@/features/output-review/output-review-model";

export const OUTPUT_REVIEW_STORAGE_KEY = "auris.output-review.v1";
export const OUTPUT_REVIEW_STORAGE_EVENT = "auris:output-review-changed";

export type OutputReviewReadResult =
  | { status: "ready"; state: OutputReviewState }
  | { status: "empty"; state: OutputReviewState }
  | { status: "invalid" | "unavailable"; state: null };

/**
 * 在保留既有空状态兜底行为的同时，提供可判别的读取结果。
 * 缺失键是第一次使用；损坏或不兼容的数据不能伪装成 0 条复习记录。
 */
export function readOutputReviewStateResult(storage: Storage | null): OutputReviewReadResult {
  if (!storage) return { status: "unavailable", state: null };

  try {
    const raw = storage.getItem(OUTPUT_REVIEW_STORAGE_KEY);
    if (raw === null) {
      return { status: "empty", state: EMPTY_OUTPUT_REVIEW_STATE };
    }

    const parsed = JSON.parse(raw) as Partial<OutputReviewState> | null;
    if (
      !parsed ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.projects) ||
      !Array.isArray(parsed.knowledgePoints) ||
      !Array.isArray(parsed.cycles)
    ) {
      return { status: "invalid", state: null };
    }

    return { status: "ready", state: parsed as OutputReviewState };
  } catch {
    return { status: "invalid", state: null };
  }
}

export function readOutputReviewState(storage: Storage | null): OutputReviewState {
  return readOutputReviewStateResult(storage).state ?? EMPTY_OUTPUT_REVIEW_STATE;
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
