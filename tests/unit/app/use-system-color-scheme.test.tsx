import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  darkColorSchemeQuery,
  useSystemColorScheme,
} from "@/features/appearance/use-system-color-scheme";

type MediaQueryChangeListener = (event: MediaQueryListEvent) => void;

function installMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<MediaQueryChangeListener>();
  const mediaQuery: MediaQueryList = {
    get matches() {
      return matches;
    },
    media: darkColorSchemeQuery,
    onchange: null,
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === "change" && typeof listener === "function") {
        listeners.add(listener as MediaQueryChangeListener);
      }
    }),
    removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === "change" && typeof listener === "function") {
        listeners.delete(listener as MediaQueryChangeListener);
      }
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  };

  const matchMedia = vi.fn((query: string) => {
    expect(query).toBe(darkColorSchemeQuery);
    return mediaQuery;
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: matchMedia,
    writable: true,
  });

  return {
    mediaQuery,
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      listeners.forEach((listener) => listener({ matches } as MediaQueryListEvent));
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, "matchMedia");
});

describe("useSystemColorScheme", () => {
  it("在挂载后读取当前系统明暗偏好", () => {
    installMatchMedia(true);

    const { result } = renderHook(() => useSystemColorScheme());

    expect(result.current).toBe("dark");
  });

  it("在系统主题改变时实时更新，并在卸载时移除监听", () => {
    const { mediaQuery, setMatches } = installMatchMedia(false);
    const { result, unmount } = renderHook(() => useSystemColorScheme());

    expect(result.current).toBe("light");
    act(() => setMatches(true));
    expect(result.current).toBe("dark");

    unmount();
    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
  });
});
