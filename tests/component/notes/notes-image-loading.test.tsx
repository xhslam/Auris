import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotesEditorPane } from "@/components/notes-v2/notes-editor-pane";
import { ImagePreviewWidget } from "@/features/notes/editor/code-block-preview";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { buildNoteHtmlExport } from "@/features/notes/export/note-export";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import { bumpNotesMediaReloadKey } from "@/features/notes/editor/notes-media-reload";

const observers: { callback: IntersectionObserverCallback; targets: Set<Element>; root: Element | null }[] = [];
let frames: Map<number, FrameRequestCallback>;
let nextFrame = 0;
function note(path = "notes/one.md", image = "images/a.png"): NoteDocument {
  return { basename: "one", fileName: "one.md", path, frontmatter: {}, mtime: "2026-10-19", rawSource: `# One\n\n![cover](${image} "caption")\n`, parsed: { backlinks: [], embeds: [], headings: [], links: [], tags: [], tasks: [], title: "One", wordCount: 1 } };
}
function intersect() {
  for (const observer of [...observers]) {
    observer.callback([...observer.targets].map(target => ({ target, isIntersecting: true })) as IntersectionObserverEntry[], {} as IntersectionObserver);
  }
  while (frames.size) { const entries = [...frames.entries()]; frames.clear(); for (const [, callback] of entries) callback(0); }
}
beforeEach(() => {
  frames = new Map(); observers.length = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal("IntersectionObserver", class {
    private entry: typeof observers[number];
    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) { this.entry = { callback, targets: new Set(), root: options?.root as Element | null }; observers.push(this.entry); }
    observe(target: Element) { this.entry.targets.add(target); }
    unobserve(target: Element) { this.entry.targets.delete(target); }
    disconnect() { this.entry.targets.clear(); }
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("Notes viewport image loading", () => {
  it.each(["source", "wysiwyg"] as const)("publishes only a fully loaded %s bridge, with no placeholder writeback", (editorMode) => {
    const document = note(); const change = vi.fn(); const published: string[] = [];
    const { unmount } = render(<NotesEditorPane document={document} documents={[document]} editorMode={editorMode} onDocumentChange={change} onBridgeReady={bridge => { if (bridge) published.push(bridge.getSource()); }} />);
    expect(published.length).toBeGreaterThan(0);
    expect(published.every(source => source.includes("images/a.png") && source.includes("cover"))).toBe(true);
    unmount(); expect(change).not.toHaveBeenCalled();
  });

  it("does not assign a rich image source until near its own scroll root, without editing Markdown", async () => {
    const document = note(); const change = vi.fn();
    const { unmount } = render(<NotesEditorPane document={document} documents={[document]} editorMode="wysiwyg" onDocumentChange={change} />);
    const image = screen.getByTestId("notes-prosemirror-host").querySelector<HTMLImageElement>("img:not(.ProseMirror-separator)")!;
    expect(image.getAttribute("src")).toBeNull();
    expect(image.decoding).toBe("async");
    await act(async () => { await Promise.resolve(); });
    expect(observers.some(o => o.root?.classList.contains("notes-v2__editor-host--wysiwyg"))).toBe(true);
    act(intersect);
    expect(image.getAttribute("src")).toContain("shadowing-media://vault/notes/images/a.png");
    expect(image.alt).toBe("cover"); expect(image.title).toBe("caption");
    expect(change).not.toHaveBeenCalled();
    unmount(); expect(observers.every(o => !o.targets.size)).toBe(true);
  });

  it("rebinds the same relative image when the document owner changes and when media reloads", async () => {
    const first = note("a/one.md"); const second = note("b/one.md"); const change = vi.fn();
    const { rerender } = render(<NotesEditorPane document={first} documents={[first, second]} editorMode="wysiwyg" onDocumentChange={change} />);
    await act(async () => { await Promise.resolve(); });
    rerender(<NotesEditorPane document={second} documents={[first, second]} editorMode="wysiwyg" onDocumentChange={change} />);
    await act(async () => { await Promise.resolve(); }); act(intersect);
    const image = screen.getByTestId("notes-prosemirror-host").querySelector<HTMLImageElement>("img:not(.ProseMirror-separator)")!;
    expect(image.getAttribute("src")).toContain("/b/images/a.png");
    act(() => { bumpNotesMediaReloadKey(); });
    await act(async () => { await Promise.resolve(); }); act(intersect);
    expect(image.getAttribute("src")).toMatch(/[?&]v=\d+/);
    expect(change).not.toHaveBeenCalled();
  });

  it("source widget defers src, reserves space, and cancels queued work on destruction", async () => {
    const host = document.createElement("div"); document.body.append(host);
    const view = new EditorView({ parent: host, state: EditorState.create({ doc: "text" }) });
    const widget = new ImagePreviewWidget({ source: "https://example.com/a.png", resolvedSrc: "https://example.com/a.png", alt: "a", title: "" });
    // WidgetType accepts the view; use the public base signature until the override is updated.
    const element = (widget as import("@codemirror/view").WidgetType).toDOM(view); view.contentDOM.append(element);
    const image = element.querySelector("img")!;
    expect(image.getAttribute("src")).toBeNull();
    expect(image.style.minHeight).not.toBe("");
    await Promise.resolve();
    widget.destroy(element); intersect();
    expect(image.getAttribute("src")).toBeNull();
    view.destroy(); host.remove();
  });

  it("preserves eager standalone export sources, independent of the on-screen queue", () => {
    const html = buildNoteHtmlExport(note("one.md", "https://example.com/offscreen.png"));
    expect(html).toContain('src="https://example.com/offscreen.png"');
    expect(html).not.toContain("data-notes-image-pending"); expect(html).not.toContain('loading="lazy"');
  });
});
