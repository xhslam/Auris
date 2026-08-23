import { useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotesEditorPane } from "@/components/notes-v2/notes-editor-pane";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import { NotesWorkbench } from "@/components/notes-v2/notes-workbench";
import type { BrowserNativeBridge } from "@/features/browser/browser-bridge";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import type { VaultEntry } from "@/features/notes/vault/vault-types";
import type { DesktopTerminalBridge } from "@/platform/desktop/desktop-bridge";
import type { EditorView } from "@codemirror/view";
import { TextSelection } from "prosemirror-state";
import type { EditorView as ProseMirrorEditorView } from "prosemirror-view";

afterEach(() => {
  window.localStorage.removeItem("auris.appearance.window-preferences.v1");
});

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    unicode = {
      activeVersion: "",
    };

    clear() {
      return undefined;
    }
    dispose() {
      return undefined;
    }
    focus() {
      return undefined;
    }
    getSelection() {
      return "";
    }
    loadAddon() {
      return undefined;
    }
    onData() {
      return {
        dispose() {},
      };
    }
    open(container: HTMLElement) {
      const stub = document.createElement("div");
      stub.dataset.testid = "xterm-stub";
      container.appendChild(stub);
    }
    write() {
      return undefined;
    }
  },
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {
      return undefined;
    }
  },
}));

vi.mock("@xterm/addon-search", () => ({
  SearchAddon: class {
    clearDecorations() {
      return undefined;
    }
    findNext() {
      return undefined;
    }
  },
}));

vi.mock("@xterm/addon-unicode11", () => ({
  Unicode11Addon: class {},
}));

vi.mock("@xterm/addon-web-links", () => ({
  WebLinksAddon: class {
    constructor(handler: unknown) {
      void handler;
    }
  },
}));

type NotesEditorHostElement = HTMLDivElement & {
  __notesEditorView?: EditorView;
};

type NotesRichEditorHostElement = HTMLDivElement & {
  __notesRichEditorView?: ProseMirrorEditorView;
};

type NotesSourcePeekElement = HTMLElement & {
  __notesSourcePeekView?: EditorView;
};

function selectRichEditorBlock(
  host: NotesRichEditorHostElement,
  blockIndex: number,
) {
  const view = host.__notesRichEditorView;

  if (!view) {
    throw new Error("Expected the rich editor view to be available");
  }

  let position = 0;

  for (let index = 0; index < blockIndex; index += 1) {
    position += view.state.doc.child(index).nodeSize;
  }

  act(() => {
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, position + 1)),
    );
  });
}

function createDocument(): NoteDocument {
  return {
    basename: "daily",
    fileName: "daily.md",
    frontmatter: {},
    mtime: "2026-04-04T00:00:00.000Z",
    parsed: {
      backlinks: [],
      embeds: [],
      headings: [
        {
          depth: 1,
          line: 0,
          slug: "daily-review",
          text: "Daily Review",
        },
      ],
      links: [],
      tags: ["shadowing"],
      tasks: [],
      title: "Daily Review",
      wordCount: 2,
    },
    path: "notes/daily.md",
    rawSource: "# Daily Review",
  };
}

function createGrammarDocument(): NoteDocument {
  return {
    basename: "grammar",
    fileName: "grammar.md",
    frontmatter: {},
    mtime: "2026-04-04T00:00:00.000Z",
    parsed: {
      backlinks: [],
      embeds: [],
      headings: [
        {
          depth: 1,
          line: 0,
          slug: "grammar-review",
          text: "Grammar Review",
        },
      ],
      links: [],
      tags: ["grammar"],
      tasks: [],
      title: "Grammar Review",
      wordCount: 2,
    },
    path: "notes/grammar.md",
    rawSource: "# Grammar Review",
  };
}

const ENTRIES: VaultEntry[] = [
  {
    kind: "directory",
    mtime: null,
    name: "notes",
    path: "notes",
    size: null,
  },
  {
    kind: "file",
    mtime: "2026-04-04T00:00:00.000Z",
    name: "daily.md",
    path: "notes/daily.md",
    size: 64,
  },
  {
    kind: "file",
    mtime: "2026-04-04T00:00:00.000Z",
    name: "grammar.md",
    path: "notes/grammar.md",
    size: 72,
  },
];

describe("NotesEditorPane", () => {
  it("renders the note title as the first heading in the rich editor canvas", () => {
    const document = createDocument();
    const { container } = render(
      <NotesEditorPane
        document={document}
        documents={[document]}
        editorMode="wysiwyg"
        onDocumentChange={vi.fn()}
      />,
    );

    expect(container.querySelectorAll(".notes-v2__editor-pane")).toHaveLength(1);
    expect(screen.queryByLabelText("Note title")).not.toBeInTheDocument();
    expect(screen.getByTestId("notes-prosemirror-host")).toHaveTextContent(
      "Daily Review",
    );
    expect(
      screen.getByTestId("notes-prosemirror-host").querySelector("h1"),
    ).toHaveTextContent("Daily Review");
  });

  it("renders the note title separately from the source body editor", () => {
    const document = createDocument();
    document.rawSource = "# Daily Review\n\nShadow the line\n- Keep breathing steady";

    render(
      <NotesEditorPane
        document={document}
        documents={[document]}
        editorMode="source"
        onDocumentChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Note title")).toHaveValue("Daily Review");

    const host = screen.getByTestId(
      "notes-codemirror-host",
    ) as NotesEditorHostElement;
    const view = host.__notesEditorView;

    expect(view?.state.doc.toString()).toBe(
      "Shadow the line\n- Keep breathing steady",
    );
  });

  it("rewrites the note title from the source title input", () => {
    const document = createDocument();
    document.rawSource = "# Daily Review\n\nShadow the line";
    const handleDocumentChange = vi.fn();

    render(
      <NotesEditorPane
        document={document}
        documents={[document]}
        editorMode="source"
        onDocumentChange={handleDocumentChange}
      />,
    );

    act(() => {
      fireEvent.change(screen.getByLabelText("Note title"), {
        target: { value: "Rhythm Drill" },
      });
    });

    expect(handleDocumentChange).toHaveBeenLastCalledWith(
      "# Rhythm Drill\n\nShadow the line",
    );
    expect(screen.getByLabelText("Note title")).toHaveValue("Rhythm Drill");
  });

  it("renders a CodeMirror host for source editing", () => {
    render(
      <NotesEditorPane
        document={createDocument()}
        documents={[createDocument()]}
        editorMode="source"
        onDocumentChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId("notes-codemirror-host")).toBeInTheDocument();
    expect(screen.getByText("notes/daily.md")).toBeInTheDocument();
  });

  it("uses the current localized empty state when no note is open", () => {
    render(
      <NotesEditorPane
        document={null}
        documents={[]}
        onDocumentChange={vi.fn()}
      />,
    );

    expect(
      screen.queryByText("Open or create a note to start editing."),
    ).not.toBeInTheDocument();
    expect(screen.getByText(NOTES_UI_COPY.emptyEditor)).toBeInTheDocument();
  });

  it("renders a ProseMirror host for rich-text editing", () => {
    const document = createDocument();
    document.rawSource = [
      "# Daily Review",
      "",
      "| Focus | Cue |",
      "| --- | --- |",
      "| Rhythm | Stress |",
      "",
      "```math",
      "x^2",
      "```",
    ].join("\n");

    render(
      <NotesEditorPane
        document={document}
        documents={[document]}
        editorMode="wysiwyg"
        onDocumentChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId("notes-prosemirror-host")).toBeInTheDocument();
    expect(screen.queryByTestId("notes-codemirror-host")).not.toBeInTheDocument();
  });

  it("does not render line number digits beside the body editor", () => {
    const { container } = render(
      <NotesEditorPane
        document={createDocument()}
        documents={[createDocument()]}
        editorMode="source"
        onDocumentChange={vi.fn()}
      />,
    );

    expect(container.querySelector(".cm-lineNumbers")).toBeNull();
  });

  it("enables wrapped line layout in the source editor", () => {
    const { container } = render(
      <NotesEditorPane
        document={createDocument()}
        documents={[createDocument()]}
        editorMode="source"
        onDocumentChange={vi.fn()}
      />,
    );

    expect(container.querySelector(".cm-content.cm-lineWrapping")).not.toBeNull();
  });

  it("keeps the existing editor view alive when the active document updates in place", () => {
    const bridgeEvents = vi.fn();
    const initialDocument = createDocument();
    const updatedDocument: NoteDocument = {
      ...initialDocument,
      parsed: {
        ...initialDocument.parsed,
        tasks: [
          {
            checked: false,
            line: 2,
            text: "Shadow the paragraph",
          },
        ],
        wordCount: 6,
      },
      rawSource: "# Daily Review\n\n- [ ] Shadow the paragraph",
    };
    const { rerender } = render(
      <NotesEditorPane
        document={initialDocument}
        documents={[initialDocument]}
        editorMode="source"
        onBridgeReady={bridgeEvents}
        onDocumentChange={vi.fn()}
      />,
    );

    rerender(
      <NotesEditorPane
        document={updatedDocument}
        documents={[updatedDocument]}
        editorMode="source"
        onBridgeReady={bridgeEvents}
        onDocumentChange={vi.fn()}
      />,
    );

    expect(bridgeEvents).toHaveBeenCalledTimes(1);
  });

  it("does not recreate the editor when the bridge callback identity changes", () => {
    const initialDocument = createDocument();
    const firstBridgeReady = vi.fn();
    const secondBridgeReady = vi.fn();
    const handleDocumentChange = vi.fn();
    const { rerender } = render(
      <NotesEditorPane
        document={initialDocument}
        documents={[initialDocument]}
        editorMode="source"
        onBridgeReady={firstBridgeReady}
        onDocumentChange={handleDocumentChange}
      />,
    );

    const host = screen.getByTestId(
      "notes-codemirror-host",
    ) as NotesEditorHostElement;
    const initialView = host.__notesEditorView;

    expect(initialView).toBeDefined();
    expect(firstBridgeReady).toHaveBeenCalledTimes(1);

    rerender(
      <NotesEditorPane
        document={initialDocument}
        documents={[initialDocument]}
        editorMode="source"
        onBridgeReady={secondBridgeReady}
        onDocumentChange={handleDocumentChange}
      />,
    );

    expect(host.__notesEditorView).toBe(initialView);
    expect(firstBridgeReady).toHaveBeenCalledTimes(1);
    expect(secondBridgeReady).toHaveBeenCalledTimes(1);
    expect(secondBridgeReady.mock.calls[0]?.[0]?.view).toBe(initialView);
  });

  it("clamps the selection before syncing a shorter version of the same document", () => {
    const initialDocument: NoteDocument = {
      ...createDocument(),
      rawSource: "# Daily Review\n\n- [ ] Shadow the paragraph",
    };
    const shortenedDocument: NoteDocument = {
      ...initialDocument,
      rawSource: "# Daily",
    };
    const { rerender } = render(
      <NotesEditorPane
        document={initialDocument}
        documents={[initialDocument]}
        editorMode="source"
        onDocumentChange={vi.fn()}
      />,
    );

    const host = screen.getByTestId(
      "notes-codemirror-host",
    ) as NotesEditorHostElement;
    const view = host.__notesEditorView;

    expect(view).toBeDefined();

    act(() => {
      view?.dispatch({
        selection: { anchor: view.state.doc.length },
      });
    });

    expect(() => {
      rerender(
        <NotesEditorPane
          document={shortenedDocument}
          documents={[shortenedDocument]}
          editorMode="source"
          onDocumentChange={vi.fn()}
        />,
      );
    }).not.toThrow();

    expect(view?.state.doc.toString()).toBe("");
    expect(view?.state.selection.main.head).toBe(0);
  });

  it("exposes document selection get and set through the editor bridge", () => {
    const bridgeReady = vi.fn();
    const document: NoteDocument = {
      ...createDocument(),
      rawSource: "# Daily Review\n\nShadow the line",
    };

    render(
      <NotesEditorPane
        document={document}
        documents={[document]}
        editorMode="source"
        onBridgeReady={bridgeReady}
        onDocumentChange={vi.fn()}
      />,
    );

    const bridge = bridgeReady.mock.calls[0]?.[0];

    expect(bridge).toBeDefined();

    act(() => {
      bridge.setSelection(0, 6);
    });

    expect(bridge.getSelection()).toMatchObject({
      from: 0,
      line: 0,
      text: "Shadow",
      to: 6,
    });

    act(() => {
      bridge.setSelection(-20, 200);
    });

    expect(bridge.getSelection()).toMatchObject({
      from: 0,
      text: "Shadow the line",
      to: "Shadow the line".length,
    });
  });
});

describe("NotesWorkbench", () => {
  it("applies persisted status-bar hiding and focus dim intensity", async () => {
    window.localStorage.setItem(
      "auris.appearance.window-preferences.v1",
      JSON.stringify({ focusDim: 2, hideStatus: true, titlebarName: false }),
    );

    const { container } = render(
      <NotesWorkbench
        activePath="notes/daily.md"
        documents={[createDocument()]}
        entries={ENTRIES}
        onDocumentChange={vi.fn()}
        onOpenPath={vi.fn()}
        openTabs={["notes/daily.md"]}
      />,
    );

    const workbench = container.querySelector(".notes-v2--minimal");
    await waitFor(() => {
      expect(workbench).toHaveAttribute(
        "data-focus-dim",
        "stronger",
      );
    });
    expect(workbench).toHaveAttribute(
      "data-auto-hide-status",
      "true",
    );
  });

  it("opens an editable Source Peek for the current display block with F5", async () => {
    const user = userEvent.setup();
    const onDocumentChange = vi.fn();
    const document = createDocument();
    document.rawSource = "# Daily Review\n\nFirst paragraph";

    render(
      <NotesEditorPane
        document={document}
        documents={[document]}
        editorMode="wysiwyg"
        onDocumentChange={onDocumentChange}
      />,
    );

    const host = screen.getByTestId(
      "notes-prosemirror-host",
    ) as NotesRichEditorHostElement;
    selectRichEditorBlock(host, 1);

    fireEvent.keyDown(host.querySelector(".ProseMirror")!, { key: "F5" });

    const peek = await screen.findByTestId("notes-source-peek");
    expect(peek).toHaveTextContent("Source Peek");
    expect(peek).toHaveTextContent("First paragraph");

    await user.click(within(peek).getByRole("button", { name: "保存" }));

    expect(screen.queryByTestId("notes-source-peek")).not.toBeInTheDocument();
    expect(onDocumentChange).not.toHaveBeenCalled();
  });

  it("does not open Source Peek for a code block", () => {
    const document = createDocument();
    document.rawSource = "```js\nconst answer = 42;\n```";

    render(
      <NotesEditorPane
        document={document}
        documents={[document]}
        editorMode="wysiwyg"
        onDocumentChange={vi.fn()}
      />,
    );

    const host = screen.getByTestId(
      "notes-prosemirror-host",
    ) as NotesRichEditorHostElement;
    selectRichEditorBlock(host, 0);

    fireEvent.keyDown(host.querySelector(".ProseMirror")!, { key: "F5" });

    expect(screen.queryByTestId("notes-source-peek")).not.toBeInTheDocument();
  });

  it("commits Source Peek Markdown only when the user saves", async () => {
    const user = userEvent.setup();
    const onDocumentChange = vi.fn();
    const document = createDocument();
    document.rawSource = "# Daily Review\n\nFirst paragraph";

    render(
      <NotesEditorPane
        document={document}
        documents={[document]}
        editorMode="wysiwyg"
        onDocumentChange={onDocumentChange}
      />,
    );

    const host = screen.getByTestId(
      "notes-prosemirror-host",
    ) as NotesRichEditorHostElement;
    selectRichEditorBlock(host, 1);

    fireEvent.keyDown(host.querySelector(".ProseMirror")!, { key: "F5" });

    const peek = (await screen.findByTestId(
      "notes-source-peek",
    )) as NotesSourcePeekElement;

    act(() => {
      peek.__notesSourcePeekView?.dispatch({
        changes: { from: 0, insert: "Updated " },
      });
    });

    expect(onDocumentChange).not.toHaveBeenCalled();

    await user.click(within(peek).getByRole("button", { name: "保存" }));

    expect(onDocumentChange).toHaveBeenCalledWith(
      expect.stringContaining("Updated First paragraph"),
    );
  });

  it("discards unsaved Source Peek Markdown when the user cancels", async () => {
    const user = userEvent.setup();
    const onDocumentChange = vi.fn();
    const document = createDocument();
    document.rawSource = "# Daily Review\n\nFirst paragraph";

    render(
      <NotesEditorPane
        document={document}
        documents={[document]}
        editorMode="wysiwyg"
        onDocumentChange={onDocumentChange}
      />,
    );

    const host = screen.getByTestId(
      "notes-prosemirror-host",
    ) as NotesRichEditorHostElement;
    selectRichEditorBlock(host, 1);

    fireEvent.keyDown(host.querySelector(".ProseMirror")!, { key: "F5" });

    const peek = (await screen.findByTestId(
      "notes-source-peek",
    )) as NotesSourcePeekElement;

    act(() => {
      peek.__notesSourcePeekView?.dispatch({
        changes: { from: 0, insert: "Discarded " },
      });
    });

    await user.click(within(peek).getByRole("button", { name: "取消" }));

    expect(screen.queryByTestId("notes-source-peek")).not.toBeInTheDocument();
    expect(onDocumentChange).not.toHaveBeenCalled();
  });

  it("renders the minimal workbench shell with the active document pill and the editor pane", () => {
    render(
      <NotesWorkbench
        activePath="notes/daily.md"
        documents={[createDocument()]}
        entries={ENTRIES}
        onDocumentChange={vi.fn()}
        onOpenPath={vi.fn()}
        openTabs={["notes/daily.md"]}
      />,
    );

    expect(screen.getByTestId("notes-workbench")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Open workspace switcher for Daily Review/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("notes-prosemirror-host")).toBeInTheDocument();
    expect(screen.queryByTestId("notes-codemirror-host")).not.toBeInTheDocument();
  });

  it("opens the embedded browser beside the editor, supports resizing, and can collapse it", async () => {
    const user = userEvent.setup();
    const observer = class {
      disconnect() {}
      observe() {}
      unobserve() {}
    };
    vi.stubGlobal("ResizeObserver", observer);
    const snapshot = {
      currentWindowId: "browser-window-embedded",
      windows: [{ activeTabId: null, tabs: [], windowId: "browser-window-embedded" }],
    };
    const bridge: BrowserNativeBridge = {
      invoke: async (command) => command === "getSnapshot" ? snapshot : true,
      subscribe: () => true,
      unsubscribe: () => true,
    };
    window.aurisBrowser = bridge;

    render(
      <NotesWorkbench
        activePath="notes/daily.md"
        documents={[createDocument()]}
        entries={ENTRIES}
        onDocumentChange={vi.fn()}
        onOpenPath={vi.fn()}
        openTabs={["notes/daily.md"]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "打开内置浏览器" }));
    expect(await screen.findByRole("region", { name: "Note 内置浏览器" }))
      .toBeInTheDocument();
    expect(screen.getByTestId("notes-prosemirror-host")).toBeInTheDocument();
    expect(document.querySelector(".notes-v2__minimal-properties-pane")).toBeNull();
    expect(document.querySelector(".notes-v2__rail")).toBeNull();

    const splitter = screen.getByRole("separator", { name: "调整浏览器宽度" });
    expect(splitter).toHaveAttribute("aria-valuenow", "520");
    fireEvent.keyDown(splitter, { key: "ArrowLeft" });
    await waitFor(() => {
      expect(splitter).toHaveAttribute("aria-valuenow", "552");
    });

    await user.click(screen.getByRole("button", { name: "收起浏览器" }));
    expect(screen.queryByRole("region", { name: "Note 内置浏览器" })).toBeNull();
    expect(screen.getByTestId("notes-prosemirror-host")).toBeInTheDocument();

    delete window.aurisBrowser;
    vi.unstubAllGlobals();
  });

  it("shows the external editor conflict dialog with reload, keep, and copy actions", async () => {
    const user = userEvent.setup();
    const onReloadWriteConflict = vi.fn();
    const onKeepWriteConflict = vi.fn();
    const onCopyWriteConflictDiff = vi.fn();

    render(
      <NotesWorkbench
        activePath="notes/daily.md"
        documents={[createDocument()]}
        entries={ENTRIES}
        onCopyWriteConflictDiff={onCopyWriteConflictDiff}
        onDocumentChange={vi.fn()}
        onKeepWriteConflict={onKeepWriteConflict}
        onOpenPath={vi.fn()}
        onReloadWriteConflict={onReloadWriteConflict}
        openTabs={["notes/daily.md"]}
        writeConflict={{
          expectedRawSource: "# Daily Review\n\nShadow the line",
          localRawSource: "# Daily Review\n\nStay with the rhythm",
          path: "notes/daily.md",
          remoteRawSource: "# Daily Review\n\nStay steady",
        }}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: /外部编辑器冲突/i });
    expect(within(dialog).getByText(/notes\/daily\.md/i)).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", { name: /重新加载/i }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: /保留我的版本/i }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: /复制差异/i }),
    );

    expect(onReloadWriteConflict).toHaveBeenCalledTimes(1);
    expect(onKeepWriteConflict).toHaveBeenCalledTimes(1);
    expect(onCopyWriteConflictDiff).toHaveBeenCalledTimes(1);
  });

  it("shows MCP edit review actions without applying automatically", async () => {
    const user = userEvent.setup();
    const onAcceptPendingMcpEdit = vi.fn();
    const onRejectPendingMcpEdit = vi.fn();

    render(
      <NotesWorkbench
        activePath="notes/daily.md"
        documents={[createDocument()]}
        entries={ENTRIES}
        onAcceptPendingMcpEdit={onAcceptPendingMcpEdit}
        onDocumentChange={vi.fn()}
        onOpenPath={vi.fn()}
        onRejectPendingMcpEdit={onRejectPendingMcpEdit}
        openTabs={["notes/daily.md"]}
        pendingMcpEdit={{
          afterSource: "# Daily Review\n\nStay with the rhythm",
          beforeSource: "# Daily Review\n\nShadow the line",
          createdAt: "2026-06-29T00:00:00.000Z",
          expectedRevision: "sha256-current",
          id: "review-1",
          kind: "document",
          mode: "source",
          path: "notes/daily.md",
        }}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: /MCP edit review/i });
    expect(within(dialog).getByText(/notes\/daily\.md/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /Reject/i }));
    await user.click(within(dialog).getByRole("button", { name: /Apply edit/i }));

    expect(onRejectPendingMcpEdit).toHaveBeenCalledTimes(1);
    expect(onAcceptPendingMcpEdit).toHaveBeenCalledTimes(1);
  });

  it("keeps the workspace popover focused on the file tree", async () => {
    const user = userEvent.setup();
    const documents = [createDocument(), createGrammarDocument()];

    render(
      <NotesWorkbench
        activePath="notes/daily.md"
        documents={documents}
        entries={ENTRIES}
        onDocumentChange={vi.fn()}
        onOpenPath={vi.fn()}
        openTabs={["notes/daily.md"]}
        recentFiles={["notes/grammar.md", "notes/daily.md"]}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: /Open workspace switcher for Daily Review/i,
      }),
    );

    const workspaceTree = screen.getByRole("navigation", {
      name: NOTES_UI_COPY.fileTree.ariaLabel,
    });

    expect(workspaceTree).toBeInTheDocument();
    expect(workspaceTree).toHaveAttribute("data-variant", "obsidian");
    expect(document.querySelector(".notes-v2__popover-header")).not.toBeInTheDocument();
    expect(
      screen.queryByText(NOTES_UI_COPY.leftPane.files.recent),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(NOTES_UI_COPY.panels.search.searchPlaceholder),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(NOTES_UI_COPY.panels.tags.title),
    ).not.toBeInTheDocument();
  });

  it("renders back and forward file history controls", async () => {
    const user = userEvent.setup();
    const onGoBack = vi.fn();
    const onGoForward = vi.fn();

    render(
      <NotesWorkbench
        activePath="notes/daily.md"
        canGoBack
        canGoForward
        documents={[createDocument()]}
        entries={ENTRIES}
        onDocumentChange={vi.fn()}
        onGoBack={onGoBack}
        onGoForward={onGoForward}
        onOpenPath={vi.fn()}
        openTabs={["notes/daily.md"]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "返回上一个打开的文件" }));
    await user.click(screen.getByRole("button", { name: "前进到下一个打开的文件" }));

    expect(onGoBack).toHaveBeenCalledTimes(1);
    expect(onGoForward).toHaveBeenCalledTimes(1);
  });

  it("moves search, tags, and recent files into the library navigator button", async () => {
    const user = userEvent.setup();
    const onOpenPath = vi.fn();
    const onSearchQueryChange = vi.fn();

    render(
      <NotesWorkbench
        activePath="notes/daily.md"
        documents={[createDocument(), createGrammarDocument()]}
        entries={ENTRIES}
        onDocumentChange={vi.fn()}
        onOpenPath={onOpenPath}
        onSearchQueryChange={onSearchQueryChange}
        openTabs={["notes/daily.md"]}
        recentFiles={["notes/grammar.md", "notes/daily.md"]}
        searchResults={[createGrammarDocument()]}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: NOTES_UI_COPY.rightRail.library.open }),
    );

    expect(
      screen.getByPlaceholderText(NOTES_UI_COPY.panels.search.searchPlaceholder),
    ).toBeInTheDocument();
    expect(screen.getByText(NOTES_UI_COPY.panels.tags.title)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Open recent note Grammar Review/i }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: NOTES_UI_COPY.panels.tags.filterLabel("grammar"),
      }),
    );

    expect(onSearchQueryChange).toHaveBeenCalledWith("#grammar");

    await user.click(
      screen.getAllByRole("button", { name: /Grammar Review/i })[0],
    );

    expect(onOpenPath).toHaveBeenCalledWith("notes/grammar.md");
    expect(
      screen.queryByPlaceholderText(NOTES_UI_COPY.panels.search.searchPlaceholder),
    ).not.toBeInTheDocument();
  });

  it("keeps document actions in the overflow menu while exposing the source toggle", async () => {
    const user = userEvent.setup();

    render(
      <NotesWorkbench
        activePath="notes/daily.md"
        documents={[createDocument()]}
        entries={ENTRIES}
        onDocumentChange={vi.fn()}
        onOpenPath={vi.fn()}
        openTabs={["notes/daily.md"]}
      />,
    );

    expect(
      screen.getByRole("button", { name: NOTES_UI_COPY.toolbar.source }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("notes-prosemirror-host")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "More note actions" }),
    );

    expect(
      screen.getByRole("button", { name: NOTES_UI_COPY.headerActions.rename }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: NOTES_UI_COPY.headerActions.delete }),
    ).toBeInTheDocument();
  });

  it("opens inline source editing for the current rich-text block from the 源码 button", async () => {
    const user = userEvent.setup();
    const document = createDocument();
    document.rawSource = "# Daily Review\n\nFirst paragraph";

    render(
      <NotesWorkbench
        activePath="notes/daily.md"
        documents={[document]}
        entries={ENTRIES}
        onDocumentChange={vi.fn()}
        onOpenPath={vi.fn()}
        openTabs={["notes/daily.md"]}
      />,
    );

    expect(screen.getByTestId("notes-prosemirror-host")).toBeInTheDocument();
    expect(screen.queryByTestId("notes-codemirror-host")).not.toBeInTheDocument();

    const host = screen.getByTestId(
      "notes-prosemirror-host",
    ) as NotesRichEditorHostElement;
    selectRichEditorBlock(host, 1);
    const initialSelection = host.__notesRichEditorView?.state.selection.from;

    await user.click(
      screen.getByRole("button", { name: NOTES_UI_COPY.toolbar.source }),
    );

    expect(screen.getByTestId("notes-prosemirror-host")).toBeInTheDocument();
    expect(screen.queryByTestId("notes-codemirror-host")).not.toBeInTheDocument();
    expect(await screen.findByTestId("notes-source-peek")).toHaveTextContent(
      "First paragraph",
    );

    await user.click(
      screen.getByRole("button", { name: NOTES_UI_COPY.toolbar.source }),
    );

    expect(screen.queryByTestId("notes-source-peek")).not.toBeInTheDocument();
    expect(host.__notesRichEditorView?.state.selection.from).toBe(initialSelection);
  });

  it("clears inline source editing instead of carrying it into the next note", async () => {
    const user = userEvent.setup();
    const first = createDocument();
    first.rawSource = "# Daily Review\n\nFirst paragraph";
    const second = {
      ...createDocument(),
      basename: "second-note",
      fileName: "second-note.md",
      parsed: { ...createDocument().parsed, title: "Second note" },
      path: "notes/second.md",
      rawSource: "# Second note\n\nSecond paragraph",
    };

    const { rerender } = render(
      <NotesWorkbench
        activePath={first.path}
        documents={[first, second]}
        entries={ENTRIES}
        onDocumentChange={vi.fn()}
        onOpenPath={vi.fn()}
        openTabs={[first.path, second.path]}
      />,
    );
    const firstHost = screen.getByTestId(
      "notes-prosemirror-host",
    ) as NotesRichEditorHostElement;
    selectRichEditorBlock(firstHost, 1);
    await user.click(
      screen.getByRole("button", { name: NOTES_UI_COPY.toolbar.source }),
    );
    expect(await screen.findByTestId("notes-source-peek")).toBeInTheDocument();

    rerender(
      <NotesWorkbench
        activePath={second.path}
        documents={[first, second]}
        entries={ENTRIES}
        onDocumentChange={vi.fn()}
        onOpenPath={vi.fn()}
        openTabs={[first.path, second.path]}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("notes-source-peek")).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("notes-prosemirror-host")).toHaveTextContent(
      "Second note",
    );
  });

  it("exposes vault export from the overflow menu", async () => {
    const user = userEvent.setup();
    const onExportVault = vi.fn();

    render(
      <NotesWorkbench
        activePath="notes/daily.md"
        documents={[createDocument()]}
        entries={ENTRIES}
        onDocumentChange={vi.fn()}
        onExportVault={onExportVault}
        onOpenPath={vi.fn()}
        openTabs={["notes/daily.md"]}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "More note actions" }),
    );

    await user.click(
      screen.getByRole("button", {
        name: NOTES_UI_COPY.headerActions.exportVault,
      }),
    );

    expect(onExportVault).toHaveBeenCalledTimes(1);
  });

  it("exposes a rebuild-index action with status feedback in the overflow menu", async () => {
    const user = userEvent.setup();
    const handleRebuildIndex = vi.fn();

    const { rerender } = render(
      <NotesWorkbench
        activePath="notes/daily.md"
        documents={[createDocument()]}
        entries={ENTRIES}
        indexRebuildMessage="索引可从当前 vault 重建"
        isRebuildingIndex={false}
        onDocumentChange={vi.fn()}
        onOpenPath={vi.fn()}
        onRebuildIndex={handleRebuildIndex}
        openTabs={["notes/daily.md"]}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "More note actions" }),
    );

    await user.click(
      screen.getByRole("button", {
        name: NOTES_UI_COPY.headerActions.rebuildIndex,
      }),
    );

    expect(handleRebuildIndex).toHaveBeenCalledTimes(1);
    expect(screen.getByText("索引可从当前 vault 重建")).toBeInTheDocument();

    rerender(
      <NotesWorkbench
        activePath="notes/daily.md"
        documents={[createDocument()]}
        entries={ENTRIES}
        indexRebuildMessage={NOTES_UI_COPY.indexStatus.rebuilding}
        isRebuildingIndex
        onDocumentChange={vi.fn()}
        onOpenPath={vi.fn()}
        onRebuildIndex={handleRebuildIndex}
        openTabs={["notes/daily.md"]}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: NOTES_UI_COPY.headerActions.rebuildIndex,
      }),
    ).toBeDisabled();
    expect(
      screen.getByText(NOTES_UI_COPY.indexStatus.rebuilding),
    ).toBeInTheDocument();
  });

  it("keeps tool shortcuts in the bottom-right status cluster and drops the learning and properties buttons", () => {
    const { container } = render(
      <NotesWorkbench
        activePath="notes/daily.md"
        documents={[createDocument()]}
        entries={ENTRIES}
        onDocumentChange={vi.fn()}
        onOpenPath={vi.fn()}
        openTabs={["notes/daily.md"]}
      />,
    );

    const cluster = container.querySelector(
      ".notes-v2__corner-cluster--right",
    );

    expect(cluster).not.toBeNull();
    expect(
      within(cluster as HTMLElement).getByRole("button", {
        name: NOTES_UI_COPY.rightRail.backlinks.open,
      }),
    ).toBeInTheDocument();
    expect(
      within(cluster as HTMLElement).getByRole("button", {
        name: NOTES_UI_COPY.rightRail.terminal.open,
      }),
    ).toBeInTheDocument();
    expect(
      within(cluster as HTMLElement).getByRole("button", {
        name: NOTES_UI_COPY.toolbar.source,
      }),
    ).toBeInTheDocument();

    // The learning (✣) and properties (□) buttons have been removed.
    expect(
      screen.queryByRole("button", {
        name: NOTES_UI_COPY.rightRail.learning.open,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: NOTES_UI_COPY.rightRail.properties.open,
      }),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector(".notes-v2__corner-icon--learning"),
    ).toBeNull();
  });

  it("keeps history arrows grouped with the active note pill", () => {
    const onGoBack = vi.fn();
    const onGoForward = vi.fn();
    const { container } = render(
      <NotesWorkbench
        activePath="notes/daily.md"
        canGoBack
        canGoForward
        documents={[createDocument()]}
        entries={ENTRIES}
        onDocumentChange={vi.fn()}
        onGoBack={onGoBack}
        onGoForward={onGoForward}
        onOpenPath={vi.fn()}
        openTabs={["notes/daily.md"]}
      />,
    );

    const cluster = container.querySelector(
      ".notes-v2__corner-cluster--left",
    );

    expect(cluster).not.toBeNull();
    expect(
      within(cluster as HTMLElement).getByRole("button", {
        name: "返回上一个打开的文件",
      }),
    ).toBeInTheDocument();
    expect(
      within(cluster as HTMLElement).getByRole("button", {
        name: "前进到下一个打开的文件",
      }),
    ).toBeInTheDocument();
    expect(
      within(cluster as HTMLElement).getByRole("button", {
        name: /Open workspace switcher/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "快速删除当前笔记" }),
    ).not.toBeInTheDocument();
  });

  it("opens the terminal as an integrated split pane from the toolbar", async () => {
    const user = userEvent.setup();
    const terminalBridge: DesktopTerminalBridge = {
      create: vi.fn(async (input) => ({
        backend: "pty" as const,
        cols: input.cols ?? 80,
        cwd: input.cwd ?? null,
        id: input.sessionId ?? "term-1",
        rows: input.rows ?? 24,
        shell: "C:\\Windows\\System32\\cmd.exe",
      })),
      kill: vi.fn(async () => undefined),
      list: vi.fn(async () => []),
      onData: vi.fn(() => () => undefined),
      onExit: vi.fn(() => () => undefined),
      resize: vi.fn(async () => undefined),
      write: vi.fn(async () => undefined),
    };

    function TerminalHarness() {
      const [rightSidebarMode, setRightSidebarMode] = useState<
        "backlinks" | "learning" | "properties" | "terminal"
      >("properties");

      return (
        <NotesWorkbench
          activePath="notes/daily.md"
          desktopTerminal={terminalBridge}
          documents={[createDocument(), createGrammarDocument()]}
          entries={ENTRIES}
          onDocumentChange={vi.fn()}
          onOpenPath={vi.fn()}
          onRightSidebarModeChange={setRightSidebarMode}
          openTabs={["notes/daily.md"]}
          rightSidebarMode={rightSidebarMode}
        />
      );
    }

    render(<TerminalHarness />);

    await user.click(
      screen.getByRole("button", {
        name: NOTES_UI_COPY.rightRail.terminal.open,
      }),
    );

    expect(
      document.querySelector(".notes-v2[data-terminal-open=\"true\"]"),
    ).not.toBeNull();
    expect(
      document.querySelector(".notes-v2__minimal-terminal-pane"),
    ).not.toBeNull();
    expect(
      document.querySelector(".notes-v2__dock-switcher"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("notes-terminal-host")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: NOTES_UI_COPY.panels.terminal.newSession,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(
        NOTES_UI_COPY.panels.terminal.searchPlaceholder,
      ),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector(".notes-v2__terminal-session-dock"),
    ).not.toBeNull();
    expect(
      document.querySelector(".notes-v2__terminal-toolbar"),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector(".notes-v2__terminal-meta"),
    ).not.toBeInTheDocument();
  });

  it("closes the workspace popover when opening the terminal split", async () => {
    const user = userEvent.setup();

    render(
      <NotesWorkbench
        activePath="notes/daily.md"
        documents={[createDocument()]}
        entries={ENTRIES}
        onDocumentChange={vi.fn()}
        onOpenPath={vi.fn()}
        openTabs={["notes/daily.md"]}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: /Open workspace switcher for Daily Review/i,
      }),
    );

    expect(
      screen.getByRole("dialog", { name: /Workspace/i }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: NOTES_UI_COPY.rightRail.terminal.open,
      }),
    );

    expect(
      screen.queryByRole("dialog", { name: /Workspace/i }),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector(".notes-v2__minimal-terminal-pane"),
    ).not.toBeNull();
  });

  it("resizes the integrated split pane from a thin separator", async () => {
    const user = userEvent.setup();

    render(
      <NotesWorkbench
        activePath="notes/daily.md"
        documents={[createDocument()]}
        entries={ENTRIES}
        onDocumentChange={vi.fn()}
        onOpenPath={vi.fn()}
        openTabs={["notes/daily.md"]}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: NOTES_UI_COPY.rightRail.terminal.open,
      }),
    );

    const separator = screen.getByRole("separator", {
      name: "调整终端宽度",
    });
    const workbench = document.querySelector(".notes-v2") as HTMLElement | null;
    const editorCanvas = document.querySelector(
      ".notes-v2__minimal-canvas",
    ) as HTMLElement | null;
    const terminalPane = document.querySelector(
      ".notes-v2__minimal-terminal-pane",
    ) as HTMLElement | null;

    expect(separator).toBeInTheDocument();
    expect(workbench?.style.getPropertyValue("--notes-terminal-width")).toBe(
      "620px",
    );
    expect(editorCanvas).not.toBeNull();
    expect(terminalPane?.style.width).toBe("620px");

    fireEvent.mouseDown(separator, { clientX: 1000 });
    fireEvent.mouseMove(window, { clientX: 900 });
    fireEvent.mouseUp(window);

    expect(workbench?.style.getPropertyValue("--notes-terminal-width")).toBe(
      "720px",
    );
    expect(terminalPane?.style.width).toBe("720px");

    fireEvent.keyDown(separator, { key: "ArrowRight" });

    expect(workbench?.style.getPropertyValue("--notes-terminal-width")).toBe(
      "688px",
    );
    expect(terminalPane?.style.width).toBe("688px");
  });

  it("opens the command palette from the keyboard, filters commands, and closes after selection", async () => {
    const user = userEvent.setup();
    const runRecentCommand = vi.fn();

    function CommandPaletteHarness() {
      const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);

      return (
        <NotesWorkbench
          activePath="notes/daily.md"
          commandPaletteItems={[
            {
              id: "new-note",
              onSelect: vi.fn(),
              title: NOTES_UI_COPY.commands.newNote.title,
            },
            {
              id: "open-recent",
              keywords: ["recent", "quick"],
              onSelect: runRecentCommand,
              subtitle: "notes/grammar.md",
              title: "Open Recent Grammar",
            },
          ]}
          documents={[createDocument(), createGrammarDocument()]}
          entries={ENTRIES}
          isCommandPaletteOpen={isCommandPaletteOpen}
          onDocumentChange={vi.fn()}
          onOpenCommandPaletteChange={setCommandPaletteOpen}
          onOpenPath={vi.fn()}
          openTabs={["notes/daily.md"]}
        />
      );
    }

    render(<CommandPaletteHarness />);

    fireEvent.keyDown(window, { ctrlKey: true, key: "p" });

    const dialog = await screen.findByRole("dialog", {
      name: NOTES_UI_COPY.commandPalette.dialogLabel,
    });
    const searchbox = within(dialog).getByRole("searchbox");

    await user.type(searchbox, "recent grammar");

    expect(
      within(dialog).queryByRole("button", {
        name: new RegExp(NOTES_UI_COPY.commands.newNote.title, "i"),
      }),
    ).not.toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", { name: /Open Recent Grammar/i }),
    );

    expect(runRecentCommand).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", {
          name: NOTES_UI_COPY.commandPalette.dialogLabel,
        }),
      ).not.toBeInTheDocument();
    });
  });
});
