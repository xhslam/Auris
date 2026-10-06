import { act, cleanup, renderHook } from "@testing-library/react";
import { useOutputReviewMetrics } from "@/features/output-review/use-output-review-metrics";
import {
  EMPTY_OUTPUT_REVIEW_STATE, completeCurrentReview, createKnowledgePoint, createProject,
} from "@/features/output-review/output-review-model";
import {
  OUTPUT_REVIEW_STORAGE_KEY, writeOutputReviewState,
} from "@/features/output-review/output-review-storage";

const now = new Date(2026, 9, 6, 12);
function fixture(startDate = "2026-10-05") {
  const state = createProject(EMPTY_OUTPUT_REVIEW_STATE, { name: "数学" }, now);
  return createKnowledgePoint(state, { title: "相似矩阵", projectId: state.projects[0].id, startDate }, now);
}

describe("live Review metrics without the old homepage aggregator", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reads only Review storage and counts due or overdue tasks, excluding future stages", () => {
    localStorage.setItem(OUTPUT_REVIEW_STORAGE_KEY, JSON.stringify(fixture()));
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const { result } = renderHook(useOutputReviewMetrics);
    expect(result.current.status).toBe("ready");
    expect(result.current.metrics).toMatchObject({ dueTodayCount: 1, overdueCount: 0 });
    expect(getItem.mock.calls.map(([key]) => key)).toEqual([OUTPUT_REVIEW_STORAGE_KEY]);
  });

  it("refreshes after a same-window completion without counting completed work as pending", () => {
    const state = fixture();
    localStorage.setItem(OUTPUT_REVIEW_STORAGE_KEY, JSON.stringify(state));
    const { result } = renderHook(useOutputReviewMetrics);
    act(() => writeOutputReviewState(localStorage, completeCurrentReview(state, state.knowledgePoints[0].id, now)));
    expect(result.current.metrics).toMatchObject({ dueTodayCount: 0, overdueCount: 0, completedToday: 1 });
  });

  it("refreshes on cross-window writes, focus and storage clearing", () => {
    const { result } = renderHook(useOutputReviewMetrics);
    expect(result.current.status).toBe("empty");
    act(() => {
      localStorage.setItem(OUTPUT_REVIEW_STORAGE_KEY, JSON.stringify(fixture("2026-10-04")));
      window.dispatchEvent(new StorageEvent("storage", { key: OUTPUT_REVIEW_STORAGE_KEY }));
    });
    expect(result.current.metrics?.overdueCount).toBe(1);
    act(() => {
      localStorage.setItem(OUTPUT_REVIEW_STORAGE_KEY, JSON.stringify(fixture()));
      window.dispatchEvent(new Event("focus"));
    });
    expect(result.current.metrics?.dueTodayCount).toBe(1);
    act(() => {
      localStorage.clear();
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(result.current.status).toBe("empty");
  });

  it("updates at local midnight and releases the timer on unmount", () => {
    vi.setSystemTime(new Date(2026, 9, 5, 23, 59, 59));
    localStorage.setItem(OUTPUT_REVIEW_STORAGE_KEY, JSON.stringify(fixture()));
    const { result, unmount } = renderHook(useOutputReviewMetrics);
    expect(result.current.metrics?.dueTodayCount).toBe(0);
    act(() => vi.advanceTimersByTime(1500));
    expect(result.current.metrics?.dueTodayCount).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("distinguishes corrupt data from an empty queue and leaves it untouched", () => {
    localStorage.setItem(OUTPUT_REVIEW_STORAGE_KEY, "{corrupt");
    const { result } = renderHook(useOutputReviewMetrics);
    expect(result.current).toEqual({ status: "invalid", metrics: null });
    expect(localStorage.getItem(OUTPUT_REVIEW_STORAGE_KEY)).toBe("{corrupt");
  });
});
