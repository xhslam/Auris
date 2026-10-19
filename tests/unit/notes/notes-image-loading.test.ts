import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import { loadNotesImageNearViewport } from "@/features/notes/editor/notes-image-loading";
import { NotesRichImageNodeView } from "@/features/notes/editor/notes-rich-image-node-view";
import { notesRichEditorSchema, parseNotesRichMarkdown, serializeNotesRichMarkdown } from "@/features/notes/editor/notes-rich-markdown";

let callback: IntersectionObserverCallback;
let targets: Set<Element>;
let frames: Map<number, FrameRequestCallback>;
let nextFrame = 0;
beforeEach(() => {
  targets = new Set(); frames = new Map();
  vi.stubGlobal("IntersectionObserver", class {
    constructor(cb: IntersectionObserverCallback) { callback = cb; }
    observe(el: Element) { targets.add(el); }
    unobserve(el: Element) { targets.delete(el); }
    disconnect() { targets.clear(); }
  });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { frames.set(++nextFrame, cb); return nextFrame; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.spyOn(performance, "now").mockReturnValue(0);
});
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function scene() { const root = document.createElement("div"); const image = document.createElement("img"); root.append(image); document.body.append(root); return { root, image }; }
function enter(visible = true) { callback([...targets].map(target => ({ target, isIntersecting: visible })) as IntersectionObserverEntry[], {} as IntersectionObserver); }
function frame() { const first = frames.entries().next().value; if (first) { frames.delete(first[0]); first[1](0); } }

describe("image load cancellation and fallbacks", () => {
  it("does not resolve offscreen; resolves once when near and releases reserved dimensions on load", async () => {
    const { root, image } = scene(); const resolve = vi.fn(() => "https://example.com/image.png");
    const cancel = loadNotesImageNearViewport(image, root, resolve);
    await Promise.resolve(); expect(resolve).not.toHaveBeenCalled();
    enter(); frame(); expect(resolve).toHaveBeenCalledTimes(1); expect(image.src).toContain("image.png");
    enter(); frame(); expect(resolve).toHaveBeenCalledTimes(1);
    image.dispatchEvent(new Event("load")); expect(image.style.minHeight).toBe("");
    expect(image.dataset.notesImagePending).toBeUndefined(); cancel();
  });
  it("cancels before DOM insertion/observation and before a queued frame", async () => {
    const { root, image } = scene(); const resolve = vi.fn(() => "https://example.com/image.png");
    const first = loadNotesImageNearViewport(image, root, resolve); first(); await Promise.resolve();
    expect(targets.size).toBe(0);
    const second = loadNotesImageNearViewport(image, root, resolve); await Promise.resolve();
    enter(); second(); frame(); expect(resolve).not.toHaveBeenCalled(); expect(targets.size).toBe(0);
  });
  it.each(["root", "observer"])("starts at once without a %s", (missing) => {
    const { root, image } = scene(); if (missing === "observer") vi.stubGlobal("IntersectionObserver", undefined);
    const cancel = loadNotesImageNearViewport(image, missing === "root" ? null : root, () => "https://example.com/export.png");
    expect(image.src).toContain("export.png"); image.dispatchEvent(new Event("error"));
    expect(image.style.minHeight).toBe(""); cancel();
  });
  it("limits a batch of image assignments to eight per frame and drops work that scrolls away", async () => {
    const { root, image } = scene(); image.remove(); const assign = vi.fn(() => "https://example.com/a.png");
    const cancels = Array.from({ length: 100 }, () => { const img = document.createElement("img"); root.append(img); return loadNotesImageNearViewport(img, root, assign); });
    await Promise.resolve(); enter(); frame(); expect(assign).toHaveBeenCalledTimes(8);
    enter(false); frame(); expect(assign).toHaveBeenCalledTimes(8); cancels.forEach(cancel => cancel());
  });
  it("never writes an unsafe URL or resolves a stale source after replacement/deletion", async () => {
    const { root, image } = scene(); image.remove();
    const owner = () => ({ path: "one/note.md", reloadKey: 0 });
    const first = notesRichEditorSchema.nodes.image.create({ src: "images/old.png" });
    const nodeView = new NotesRichImageNodeView(first, root, owner); root.append(nodeView.dom);
    await Promise.resolve(); enter(); // old work is queued, not run yet
    nodeView.update(notesRichEditorSchema.nodes.image.create({ src: "javascript:alert(1)" }));
    await Promise.resolve(); enter(); frame();
    expect(nodeView.dom.hasAttribute("src")).toBe(false);
    nodeView.update(notesRichEditorSchema.nodes.image.create({ src: "https://example.com/new.png" }));
    await Promise.resolve(); enter(); nodeView.destroy(); frame();
    expect(nodeView.dom.hasAttribute("src")).toBe(false);
  });
  it("keeps loaded remote images stable across unrelated Vault revisions or document ownership changes", async () => {
    const { root, image } = scene(); image.remove(); let reloadKey = 0; let path = "one/a.md";
    const node = notesRichEditorSchema.nodes.image.create({ src: "https://example.com/a.png" });
    const view = new NotesRichImageNodeView(node, root, () => ({ path, reloadKey })); root.append(view.dom);
    await Promise.resolve(); enter(); frame(); view.dom.dispatchEvent(new Event("load"));
    reloadKey++; path = "two/b.md"; view.refresh();
    expect(view.dom.getAttribute("src")).toBe("https://example.com/a.png");
    expect(view.dom.dataset.notesImagePending).toBeUndefined();
    expect(view.dom.style.minHeight).toBe(""); view.destroy();
  });
  it("changes only DOM presentation, not portable image Markdown or alt/title/marks", async () => {
    const source = '[![cover](images/a.png "Caption")](https://example.com)';
    const doc = parseNotesRichMarkdown(source); const before = serializeNotesRichMarkdown(doc);
    let node: ProseMirrorNode | undefined; doc.descendants(child => { if (child.type.name === "image") node = child; });
    const { root, image } = scene(); image.remove();
    const view = new NotesRichImageNodeView(node!, root, () => ({ path: "folder/note.md", reloadKey: 0 })); root.append(view.dom);
    await Promise.resolve(); enter(); frame();
    expect(view.dom.getAttribute("src")).toContain("/folder/images/a.png");
    expect(view.dom.alt).toBe("cover"); expect(view.dom.title).toBe("Caption");
    expect(serializeNotesRichMarkdown(doc)).toBe(before); expect(before).toContain("images/a.png");
    view.destroy();
  });
});
