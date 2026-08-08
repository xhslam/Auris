import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NotesEditorPane } from "@/components/notes-v2/notes-editor-pane";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import type { NotesEditorBridge } from "@/features/notes/editor/editor-types";
import type { EditorView as CodeMirrorEditorView } from "@codemirror/view";
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
  it("opens structured files as editable raw source with a parsed preview", () => {
    const onDocumentChange = vi.fn();
    const document = {
      ...createDocument('{\r\n  "lesson":"Grammar",\r\n  "score":92\r\n}'),
      basename: "progress",
      fileName: "progress.json",
      formatId: "json" as const,
      path: "notes/progress.json",
      parsed: {
        ...createDocument("").parsed,
        title: "progress",
      },
    };

    render(
      <NotesEditorPane
        document={document}
        documents={[document]}
        editorMode="wysiwyg"
        onDocumentChange={onDocumentChange}
      />,
    );

    expect(screen.getByTestId("notes-markdown-split")).toBeInTheDocument();
    expect(screen.getByText("Grammar")).toBeInTheDocument();
    expect(screen.queryByLabelText("Note title")).not.toBeInTheDocument();

    const host = screen.getByTestId("notes-codemirror-host") as HTMLDivElement & {
      __notesEditorView?: CodeMirrorEditorView;
    };
    act(() => {
      const view = host.__notesEditorView;
      if (!view) return;
      const scoreOffset = view.state.doc.toString().indexOf("92");
      view.dispatch({
        changes: { from: scoreOffset + 1, to: scoreOffset + 2, insert: "3" },
      });
    });
    expect(onDocumentChange).toHaveBeenLastCalledWith(
      '{\r\n  "lesson":"Grammar",\r\n  "score":93\r\n}',
    );
  });

  it("renders an editable Markdown source beside a read-only live preview", () => {
    const rawSource = "# Daily Review\n\nBody";

    render(
      <NotesEditorPane
        document={createDocument(rawSource)}
        documents={[createDocument(rawSource)]}
        editorMode="split"
        onDocumentChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId("notes-markdown-split")).toBeInTheDocument();
    expect(screen.getByTestId("notes-codemirror-host")).toBeInTheDocument();
    expect(
      screen
        .getByTestId("notes-prosemirror-host")
        .querySelector(".ProseMirror"),
    ).toHaveAttribute("contenteditable", "false");
  });

  it("enforces read-only mode in the source editor", () => {
    const rawSource = "# Daily Review\n\nBody";

    render(
      <NotesEditorPane
        document={createDocument(rawSource)}
        documents={[createDocument(rawSource)]}
        editorMode="source"
        onDocumentChange={vi.fn()}
        viewPreferences={{
          focusMode: false,
          fontSize: 18,
          readOnly: true,
          typewriterMode: false,
        }}
      />,
    );

    const content = screen
      .getByTestId("notes-codemirror-host")
      .querySelector(".cm-content");
    expect(content).toHaveAttribute("contenteditable", "false");

    fireEvent.keyDown(content as Element, { ctrlKey: true, key: "f" });
    expect(screen.getByLabelText("查找")).toBeInTheDocument();
    expect(screen.queryByLabelText("替换")).not.toBeInTheDocument();
  });

  it("does not let programmatic rich-editor writes bypass read-only mode", () => {
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
        viewPreferences={{
          focusMode: false,
          fontSize: 18,
          readOnly: true,
          typewriterMode: false,
        }}
      />,
    );

    act(() => {
      bridge?.insertSnippet("blocked");
    });

    expect(onDocumentChange).not.toHaveBeenCalled();
    expect(bridge?.getSource()).toBe(rawSource);
  });

  it("preserves original UTF-16 offsets during case-insensitive replacement", () => {
    const onDocumentChange = vi.fn();
    const rawSource = "# Daily Review\n\nİx";

    render(
      <NotesEditorPane
        document={createDocument(rawSource)}
        documents={[createDocument(rawSource)]}
        editorMode="wysiwyg"
        onDocumentChange={onDocumentChange}
      />,
    );

    const editor = screen
      .getByTestId("notes-prosemirror-host")
      .querySelector(".ProseMirror");
    fireEvent.keyDown(editor as Element, { ctrlKey: true, key: "f" });
    fireEvent.change(screen.getByLabelText("所见即所得查找"), {
      target: { value: "x" },
    });
    fireEvent.change(screen.getByLabelText("所见即所得替换"), {
      target: { value: "z" },
    });
    fireEvent.click(screen.getByRole("button", { name: "全部替换" }));

    expect(onDocumentChange).toHaveBeenLastCalledWith("# Daily Review\n\nİz");
  });

  it("finds and replaces text inside the WYSIWYG editor", () => {
    const onDocumentChange = vi.fn();
    const rawSource = "# Daily Review\n\nBody Body";

    render(
      <NotesEditorPane
        document={createDocument(rawSource)}
        documents={[createDocument(rawSource)]}
        editorMode="wysiwyg"
        onDocumentChange={onDocumentChange}
      />,
    );

    const editor = screen
      .getByTestId("notes-prosemirror-host")
      .querySelector(".ProseMirror");
    expect(editor).not.toBeNull();
    fireEvent.keyDown(editor as Element, { ctrlKey: true, key: "f" });
    fireEvent.change(screen.getByLabelText("所见即所得查找"), {
      target: { value: "Body" },
    });
    fireEvent.change(screen.getByLabelText("所见即所得替换"), {
      target: { value: "Text" },
    });
    fireEvent.click(screen.getByRole("button", { name: "全部替换" }));

    expect(onDocumentChange).toHaveBeenLastCalledWith(
      "# Daily Review\n\nText Text",
    );
  });

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
