import { act, renderHook } from "@testing-library/react";
import {
  DEFAULT_DESKTOP_ROUTE_PREFETCHES,
  DESKTOP_ROUTE_PREFETCH_DELAY_MS,
  DESKTOP_ROUTE_PREFETCH_STAGGER_MS,
  resetDesktopRoutePrefetchCacheForTests,
  useDesktopRoutePrefetch,
} from "@/platform/desktop/use-desktop-route-prefetch";

describe("useDesktopRoutePrefetch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetDesktopRoutePrefetchCacheForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetDesktopRoutePrefetchCacheForTests();
  });

  it("prefetches the desktop priority routes in a staggered sequence", () => {
    const prefetch = vi.fn();

    renderHook(() => {
      useDesktopRoutePrefetch({
        router: { prefetch },
      });
    });

    act(() => {
      vi.advanceTimersByTime(DESKTOP_ROUTE_PREFETCH_DELAY_MS);
    });

    expect(prefetch).toHaveBeenCalledTimes(1);
    expect(prefetch).toHaveBeenLastCalledWith(DEFAULT_DESKTOP_ROUTE_PREFETCHES[0]);

    act(() => {
      vi.advanceTimersByTime(
        DESKTOP_ROUTE_PREFETCH_STAGGER_MS * (DEFAULT_DESKTOP_ROUTE_PREFETCHES.length - 1),
      );
    });

    expect(prefetch.mock.calls.map(([route]) => route)).toEqual([
      ...DEFAULT_DESKTOP_ROUTE_PREFETCHES,
    ]);
  });

  it("cancels scheduled prefetch work when the hook unmounts", () => {
    const prefetch = vi.fn();

    const { unmount } = renderHook(() => {
      useDesktopRoutePrefetch({
        router: { prefetch },
      });
    });

    unmount();

    act(() => {
      vi.runAllTimers();
    });

    expect(prefetch).not.toHaveBeenCalled();
  });

  it("does not prefetch the same desktop routes again after remount", () => {
    const prefetch = vi.fn();

    renderHook(() => {
      useDesktopRoutePrefetch({
        router: { prefetch },
      });
    });

    act(() => {
      vi.runAllTimers();
    });

    renderHook(() => {
      useDesktopRoutePrefetch({
        router: { prefetch },
      });
    });

    act(() => {
      vi.runAllTimers();
    });

    expect(prefetch.mock.calls.map(([route]) => route)).toEqual([
      ...DEFAULT_DESKTOP_ROUTE_PREFETCHES,
    ]);
  });
});
