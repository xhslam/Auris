import { act, renderHook } from "@testing-library/react";
import { useAppUsageTracker } from "@/features/app-activity/use-app-usage-tracker";

describe("useAppUsageTracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T10:00:00"));
    window.localStorage.clear();
    Object.defineProperty(document, "hasFocus", {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("records focused visible time but stops after the window blurs", () => {
    const { result } = renderHook(() =>
      useAppUsageTracker({ flushIntervalMilliseconds: 10_000 }),
    );

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(result.current.todayMilliseconds).toBe(10_000);

    act(() => {
      window.dispatchEvent(new Event("blur"));
      vi.advanceTimersByTime(20_000);
    });

    expect(result.current.todayMilliseconds).toBe(10_000);
  });
});
