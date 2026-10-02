import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleNotesMathRender } from "@/features/notes/editor/notes-math-render-scheduler";
import { createRenderQueue } from "@/features/notes/editor/math-render-queue";
let callback: IntersectionObserverCallback;
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
let targets: Set<Element>;
beforeEach(() => {
  frames = new Map(); nextFrame = 0; targets = new Set();
  vi.stubGlobal("IntersectionObserver", class {
    constructor(cb: IntersectionObserverCallback) { callback = cb; }
    observe(target: Element) { targets.add(target); }
    unobserve(target: Element) { targets.delete(target); }
    disconnect() { targets.clear(); }
  });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { frames.set(++nextFrame, cb); return nextFrame; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => { frames.delete(id); });
  vi.spyOn(performance, "now").mockReturnValue(0);
});
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function setup(count: number) {
  const root = document.createElement("div"); root.className = "notes-v2__editor-host--wysiwyg";
  const editor = document.createElement("div"); root.append(editor); document.body.append(root);
  const render = vi.fn();
  const cancels = Array.from({ length: count }, () => {
    const target = document.createElement("span"); editor.append(target);
    return scheduleNotesMathRender(target, editor, render);
  });
  return { render, cancels };
}
function intersect(visible: boolean) {
  callback([...targets].map((target) => ({ target, isIntersecting: visible })) as IntersectionObserverEntry[], {} as IntersectionObserver);
}
function frame() {
  const entry = frames.entries().next().value;
  if (!entry) return;
  frames.delete(entry[0]); entry[1](0);
}
describe("deferred math work", () => {
  it("does no work for offscreen formulas and spreads a large visible batch across frames", async () => {
    const { render, cancels } = setup(1000);
    await Promise.resolve();
    expect(targets.size).toBe(1000);
    expect(render).not.toHaveBeenCalled();
    intersect(true); frame();
    expect(render).toHaveBeenCalledTimes(8);
    expect(frames.size).toBe(1);
    intersect(false); frame();
    expect(render).toHaveBeenCalledTimes(8);
    intersect(true);
    while (frames.size) frame();
    expect(render).toHaveBeenCalledTimes(1000);
    expect(targets.size).toBe(0);
    cancels.forEach((cancel) => cancel());
  });
  it("cancels destroyed or superseded nodes before attachment and after queuing", async () => {
    const { render, cancels } = setup(2);
    cancels[0]();
    await Promise.resolve();
    expect(targets.size).toBe(1);
    intersect(true); cancels[1](); frame();
    expect(render).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });
  it("renders immediately in export/test environments without IntersectionObserver", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { render } = setup(1);
    expect(render).toHaveBeenCalledOnce();
  });
  it("re-ranks pending formulas after a scroll, prioritizing the new viewport and expiring distant work", () => {
    const root = document.createElement("div");
    root.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
    const make = (name: string, top: number, distance: number) => {
      const block = document.createElement("span");
      block.getBoundingClientRect = () => new DOMRect(0, top, 10, 20);
      return { name, root, block, measuredAt: 0, distance };
    };
    const ran: string[] = [], expired: string[] = [];
    const queue = createRenderQueue<ReturnType<typeof make>>({ run: (job) => { ran.push(job.name); }, expire: (job) => { expired.push(job.name); }, budgetMs: 6, marginPx: 1200 });
    queue.add([make("old viewport", -4000, 0), make("new viewport", 50, 800), make("near", 900, 400)]);
    root.scrollTop = 4000;
    frame();
    expect(ran).toEqual(["new viewport", "near"]);
    expect(expired).toEqual(["old viewport"]);
    queue.clear();
  });
});
