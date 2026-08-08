import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NotesEditorPane } from "@/components/notes-v2/notes-editor-pane";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import type { NotesEditorBridge } from "@/features/notes/editor/editor-types";
import type { EditorView as ProseMirrorEditorView } from "prosemirror-view";

function createDocument(rawSource: string): NoteDocument {
  return {
    basename: "daily-review",
    fileName: "daily-review.md",
    frontmatter: {
      tags: ["shadowing"],
    },
    mtime: "2026-04-20T00:00:00.000Z",
    parsed: {
      backlinks: [],
      embeds: [],
      headings: [],
      links: [],
      tags: ["shadowing"],
      tasks: [],
      title: "Daily Review",
      wordCount: 2,
    },
    path: "notes/daily-review.md",
    rawSource,
  };
}

describe("NotesRichEditorPane sync", () => {
  it("serializes the first rich-editor heading as the note title", () => {
    const onDocumentChange = vi.fn();
    let bridge: NotesEditorBridge | null = null;
    const rawSource = "# Daily Review\n\nBody";

    render(
      <NotesEditorPane
        document={createDocument(rawSource)}
        documents={[createDocument(rawSource)]}
        editorMode="wysiwyg"
        onBridgeReady={(nextBridge) => {
          bridge = nextBridge;
        }}
        onDocumentChange={onDocumentChange}
      />,
    );

    act(() => {
      const view = bridge?.view as ProseMirrorEditorView | null;
      view?.dispatch(view.state.tr.insertText("Edited ", 1));
    });

    expect(onDocumentChange).toHaveBeenLastCalledWith(
      "# Edited Daily Review\n\nBody",
    );
  });

  it("emits full note source when WYSIWYG edits change the body", () => {
    const onDocumentChange = vi.fn();
    let bridge: NotesEditorBridge | null = null;
    const rawSource = [
      "---",
      "tags:",
      "  - shadowing",
      "---",
      "# Daily Review",
      "",
      "Body",
    ].join("\n");

    render(
      <NotesEditorPane
        document={createDocument(rawSource)}
        documents={[createDocument(rawSource)]}
        editorMode="wysiwyg"
        onBridgeReady={(nextBridge) => {
          bridge = nextBridge;
        }}
        onDocumentChange={onDocumentChange}
      />,
    );

    act(() => {
      bridge?.insertSnippet("Second paragraph");
    });

    expect(onDocumentChange).toHaveBeenCalledWith(
      expect.stringContaining("---\ntags:\n  - shadowing\n---"),
    );
    expect(onDocumentChange).toHaveBeenCalledWith(
      expect.stringContaining("# Daily Review"),
    );
    expect(onDocumentChange).toHaveBeenCalledWith(
      expect.stringContaining("Second paragraph"),
    );
  });

  it("waits for an IME composition to finish before emitting a rich-editor change", () => {
    vi.useFakeTimers();
    const onDocumentChange = vi.fn();
    let bridge: NotesEditorBridge | null = null;
    const rawSource = "# Daily Review\n\nBody";
    const { container } = render(
      <NotesEditorPane
        document={createDocument(rawSource)}
        documents={[createDocument(rawSource)]}
        editorMode="wysiwyg"
        onBridgeReady={(nextBridge) => {
          bridge = nextBridge;
        }}
        onDocumentChange={onDocumentChange}
      />,
    );
    const editorDom = container.querySelector(".ProseMirror");

    expect(editorDom).not.toBeNull();

    act(() => {
      editorDom?.dispatchEvent(new Event("compositionstart", { bubbles: true }));
      const view = bridge?.view as ProseMirrorEditorView | null;
      view?.dispatch(view.state.tr.insertText("wo ju", 1));
      view?.dispatch(view.state.tr.insertText("我觉得", 1, 6));
    });

    expect(onDocumentChange).not.toHaveBeenCalled();

    act(() => {
      editorDom?.dispatchEvent(new Event("compositionend", { bubbles: true }));
      vi.runAllTimers();
    });

    expect(onDocumentChange).toHaveBeenCalledTimes(1);
    expect(onDocumentChange).toHaveBeenLastCalledWith(
      "# 我觉得Daily Review\n\nBody",
    );

    vi.useRealTimers();
  });

  it("removes leftover pinyin before a confirmed Chinese candidate", () => {
    vi.useFakeTimers();
    const onDocumentChange = vi.fn();
    let bridge: NotesEditorBridge | null = null;
    const rawSource = "# 李笑来\n\nBody";
    const { container } = render(
      <NotesEditorPane
        document={createDocument(rawSource)}
        documents={[createDocument(rawSource)]}
        editorMode="wysiwyg"
        onBridgeReady={(nextBridge) => {
          bridge = nextBridge;
        }}
        onDocumentChange={onDocumentChange}
      />,
    );
    const editorDom = container.querySelector(".ProseMirror");
    const view = bridge?.view as ProseMirrorEditorView | null;
    const compositionEnd = new Event("compositionend", { bubbles: true });
    Object.defineProperty(compositionEnd, "data", { value: "实际" });

    act(() => {
      bridge?.setSelection(4, 4);
      editorDom?.dispatchEvent(new Event("compositionstart", { bubbles: true }));
      view?.dispatch(view.state.tr.insertText("sh实际", 4));
      editorDom?.dispatchEvent(compositionEnd);
      vi.runAllTimers();
    });

    expect(onDocumentChange).toHaveBeenLastCalledWith("# 李笑来实际\n\nBody");

    vi.useRealTimers();
  });

  it("serializes the final IME document state after candidate replacement", () => {
    vi.useFakeTimers();
    const onDocumentChange = vi.fn();
    let bridge: NotesEditorBridge | null = null;
    const rawSource = "# Daily Review\n\nBody";
    const { container } = render(
      <NotesEditorPane
        document={createDocument(rawSource)}
        documents={[createDocument(rawSource)]}
        editorMode="wysiwyg"
        onBridgeReady={(nextBridge) => {
          bridge = nextBridge;
        }}
        onDocumentChange={onDocumentChange}
      />,
    );
    const editorDom = container.querySelector(".ProseMirror");
    const view = bridge?.view as ProseMirrorEditorView | null;

    act(() => {
      editorDom?.dispatchEvent(new Event("compositionstart", { bubbles: true }));
      view?.dispatch(view.state.tr.insertText("pin", 1));
      editorDom?.dispatchEvent(new Event("compositionend", { bubbles: true }));
      view?.dispatch(view.state.tr.insertText("拼", 1, 4));
      vi.runAllTimers();
    });

    expect(onDocumentChange).toHaveBeenCalledTimes(1);
    expect(onDocumentChange).toHaveBeenLastCalledWith("# 拼Daily Review\n\nBody");

    vi.useRealTimers();
  });

  it("does not replace active IME composition with a stale parent document", () => {
    const onDocumentChange = vi.fn();
    let bridge: NotesEditorBridge | null = null;
    const rawSource = "# Daily Review\n\nBody";
    const staleDocument = createDocument(rawSource);
    const { container, rerender } = render(
      <NotesEditorPane
        document={staleDocument}
        documents={[staleDocument]}
        editorMode="wysiwyg"
        onBridgeReady={(nextBridge) => {
          bridge = nextBridge;
        }}
        onDocumentChange={onDocumentChange}
      />,
    );
    const editorDom = container.querySelector(".ProseMirror");
    const view = bridge?.view as ProseMirrorEditorView | null;

    act(() => {
      editorDom?.dispatchEvent(new Event("compositionstart", { bubbles: true }));
      view?.dispatch(view.state.tr.insertText("pin", 1));
    });

    rerender(
      <NotesEditorPane
        document={createDocument(rawSource)}
        documents={[createDocument(rawSource)]}
        editorMode="wysiwyg"
        onBridgeReady={(nextBridge) => {
          bridge = nextBridge;
        }}
        onDocumentChange={onDocumentChange}
      />,
    );

    expect(bridge?.getSource()).toBe("# pinDaily Review\n\nBody");
    expect(onDocumentChange).not.toHaveBeenCalled();
  });

  it("drops a deferred IME change when the rich editor unmounts", () => {
    vi.useFakeTimers();
    const onDocumentChange = vi.fn();
    let bridge: NotesEditorBridge | null = null;
    const rawSource = "# Daily Review\n\nBody";
    const { container, unmount } = render(
      <NotesEditorPane
        document={createDocument(rawSource)}
        documents={[createDocument(rawSource)]}
        editorMode="wysiwyg"
        onBridgeReady={(nextBridge) => {
          bridge = nextBridge;
        }}
        onDocumentChange={onDocumentChange}
      />,
    );
    const editorDom = container.querySelector(".ProseMirror");

    act(() => {
      editorDom?.dispatchEvent(new Event("compositionstart", { bubbles: true }));
      bridge?.insertSnippet("wo ju");
      editorDom?.dispatchEvent(new Event("compositionend", { bubbles: true }));
      unmount();
      vi.runAllTimers();
    });

    expect(onDocumentChange).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
