import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

if (!URL.createObjectURL) {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:mock-audio"),
  });
}

if (!URL.revokeObjectURL) {
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
}

// jsdom does not implement Range.getClientRects/getBoundingClientRect, which
// CodeMirror calls when it measures selection/active-line rectangles. Provide
// inert stubs so editor components can mount and flush measures under jsdom.
if (!Range.prototype.getClientRects) {
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value() {
      return {
        item: () => null,
        length: 0,
        [Symbol.iterator]: function* () {},
      };
    },
  });
}

if (!Range.prototype.getBoundingClientRect) {
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value() {
      return {
        bottom: 0,
        height: 0,
        left: 0,
        right: 0,
        toJSON() {
          return {};
        },
        top: 0,
        width: 0,
        x: 0,
        y: 0,
      };
    },
  });
}

// jsdom implements neither ResizeObserver nor IntersectionObserver. xyflow's
// pane measures itself through ResizeObserver on mount, so any component that
// renders a graph throws "ResizeObserver is not defined" before its first
// paint. The stub records callbacks but never fires them: under jsdom every
// element is 0x0 anyway, so a synthetic resize event would only feed the
// component a size that is just as fake as no event at all.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {
      return undefined;
    }

    unobserve() {
      return undefined;
    }

    disconnect() {
      return undefined;
    }
  }

  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: ResizeObserverStub,
    writable: true,
  });
}

Object.defineProperty(HTMLMediaElement.prototype, "pause", {
  configurable: true,
  value() {
    return undefined;
  },
});

Object.defineProperty(HTMLMediaElement.prototype, "load", {
  configurable: true,
  value() {
    return undefined;
  },
});

Object.defineProperty(HTMLMediaElement.prototype, "play", {
  configurable: true,
  value() {
    return Promise.resolve();
  },
});
