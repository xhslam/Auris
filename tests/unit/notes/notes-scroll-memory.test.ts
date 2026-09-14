import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearNotesScrollOffsets,
  findNotesScrollContainer,
  getNotesScrollOffset,
  resetNotesScrollMemoryForTests,
  restoreNotesScroll,
  setNotesScrollOffset,
  trackNotesScroll,
} from "@/features/notes/editor/notes-scroll-memory";

function createScrollableContainer({
  clientHeight = 100,
  scrollHeight = 1000,
}: { clientHeight?: number; scrollHeight?: number } = {}) {
  const container = document.createElement("div");
  let scrollTop = 0;
  Object.defineProperties(container, {
    clientHeight: { configurable: true, value: clientHeight },
    scrollHeight: { configurable: true, value: scrollHeight },
    scrollTop: {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    },
  });
  document.body.appendChild(container);
  return container;
}

describe("notes scroll memory", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetNotesScrollMemoryForTests();
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    resetNotesScrollMemoryForTests();
  });

  it("keeps independent offsets for source, rich text, and preview surfaces", () => {
    setNotesScrollOffset("notes/a.md", "source", 120);
    setNotesScrollOffset("notes/a.md", "wysiwyg", 420);
    setNotesScrollOffset("notes/a.md", "preview", 720);
    expect(getNotesScrollOffset("notes/a.md", "source")).toBe(120);
    expect(getNotesScrollOffset("notes/a.md", "wysiwyg")).toBe(420);
    expect(getNotesScrollOffset("notes/a.md", "preview")).toBe(720);
    clearNotesScrollOffsets("notes/a.md");
    expect(getNotesScrollOffset("notes/a.md", "source")).toBeUndefined();
    expect(getNotesScrollOffset("notes/a.md", "wysiwyg")).toBeUndefined();
  });

  it("tracks a reader scroll and flushes it when the view unmounts", () => {
    const container = createScrollableContainer();
    const stop = trackNotesScroll(container, "notes/a.md", "source");
    container.scrollTop = 360;
    container.dispatchEvent(new Event("scroll"));
    stop();
    expect(getNotesScrollOffset("notes/a.md", "source")).toBe(360);
  });

  it("does not record scroll noise from a non-scrollable surface", () => {
    const container = createScrollableContainer({ clientHeight: 100, scrollHeight: 100 });
    const stop = trackNotesScroll(container, "notes/a.md", "preview");
    container.scrollTop = 60;
    container.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(200);
    stop();
    expect(getNotesScrollOffset("notes/a.md", "preview")).toBeUndefined();
  });

  it("restores only after the layout can reach the saved position", () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    const container = createScrollableContainer({ clientHeight: 100, scrollHeight: 300 });
    restoreNotesScroll(container, 700);
    expect(container.scrollTop).toBe(0);
    Object.defineProperty(container, "scrollHeight", { configurable: true, value: 1000 });
    callbacks.shift()?.(0);
    expect(container.scrollTop).toBe(700);
  });

  it("lets an explicit user gesture take ownership of the viewport", () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    const container = createScrollableContainer();
    restoreNotesScroll(container, 500);
    container.scrollTop = 220;
    document.dispatchEvent(new Event("wheel", { bubbles: true }));
    callbacks.shift()?.(0);
    expect(container.scrollTop).toBe(220);
  });

  it("finds CodeMirror's own scroller before walking ancestor surfaces", () => {
    const host = document.createElement("div");
    const scroller = document.createElement("div");
    scroller.className = "cm-scroller";
    host.appendChild(scroller);
    document.body.appendChild(host);
    expect(findNotesScrollContainer(host)).toBe(scroller);
  });
});
