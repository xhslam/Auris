"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { baseKeymap } from "prosemirror-commands";
import { history } from "prosemirror-history";
import { EditorState, Selection, TextSelection } from "prosemirror-state";
import { keymap } from "prosemirror-keymap";
import { Node as ProseMirrorNode, Slice } from "prosemirror-model";
import { EditorView, type NodeView, type ViewMutationRecord } from "prosemirror-view";
import {
  NotesEditorContextMenu,
  type EditorContextMenuTarget,
} from "@/components/notes-v2/notes-editor-context-menu";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import { useNotesScrollMemory } from "@/components/notes-v2/use-notes-scroll-memory";
import { createWikiLinkResolver } from "@/features/notes/documents/backlinks";
import { findWikiLinkAtLineOffset } from "@/features/notes/documents/wiki-link-navigation";
import {
  NEW_NOTE_BODY_PLACEHOLDER,
  composeEditableNoteSource,
  parseEditableNoteSource,
} from "@/features/notes/documents/note-editing-source";
import {
  createNotesRichEditorBridge,
} from "@/features/notes/editor/notes-rich-editor-bridge";
import {
  normalizeLanguage,
  renderCodeBlockPreview,
} from "@/features/notes/editor/code-block-preview";
import {
  createWikiLinkDecorationPlugin,
  createNotesRichMathPastePlugin,
  notesRichEditorSchema,
  parseNotesRichMarkdown,
  serializeNotesRichMarkdown,
} from "@/features/notes/editor/notes-rich-markdown";
import { createNotesUndoIntegrityPlugin } from "@/features/notes/editor/notes-undo-integrity";
import { createNotesRichInputRules } from "@/features/notes/editor/notes-rich-input-rules";
import { createNotesRichKeymap } from "@/features/notes/editor/notes-rich-keymap";
import {
  createNotesMathBlockNodeView,
  createNotesMathInlineNodeView,
} from "@/features/notes/editor/notes-math-node-view";
import {
  replaceAllNotesRichSearchMatches,
  replaceNextNotesRichSearchMatch,
  selectNextNotesRichSearchMatch,
} from "@/features/notes/editor/notes-rich-find-replace";
import {
  applyNotesSourcePeekMarkdown,
  canUseNotesSourcePeek,
  getNotesSourcePeekNode,
  getNotesSourcePeekRange,
  serializeNotesSourcePeekRange,
} from "@/features/notes/editor/notes-source-peek";
import {
  createNotesSourcePeekPlugin,
  NOTES_SOURCE_PEEK_META,
  type NotesSourcePeekController,
  type NotesSourcePeekState,
} from "@/features/notes/editor/notes-source-peek-inline";
import type {
  NotesEditorBridge,
  NotesLinkEditHandler,
  NotesMarkdownLinkOpenHandler,
  NotesEditorSelectionState,
} from "@/features/notes/editor/editor-types";
import { findNotesRichLinkMarkRange } from "@/features/notes/editor/notes-rich-link-range";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import { NotesRichTableToolbar } from "@/components/notes-v2/notes-rich-table-toolbar";
import {
  getNotesRichTableToolbarState,
  runNotesRichTableToolbarAction,
  type NotesRichTableToolbarAction,
  type NotesRichTableToolbarState,
} from "@/features/notes/editor/editor-table-toolbar";
import { tableEditing } from "prosemirror-tables";
import type { Plugin } from "prosemirror-state";

const NOTES_RICH_EDITOR_SYNC_META = "shadowing-notes-rich-editor-sync";
const NOTES_TOC_REFRESH_EVENT = "auris-notes-toc-refresh";
const CJK_COMPOSED_RE = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;
const PINYIN_PREFIX_RE = /^[A-Za-z0-9;'\s]+$/;

type NotesRichEditorHostElement = HTMLDivElement & {
  __notesRichEditorView?: EditorView;
};

type NotesRichEditorPaneProps = {
  document: NoteDocument | null;
  documents: NoteDocument[];
  onActiveLineChange?: (line: number) => void;
  onBridgeReady?: (bridge: NotesEditorBridge | null) => void;
  onDocumentChange: (nextSource: string) => void;
  onEnsureWikiLinkNote?: (target: string, sourcePath?: string) => void;
  onOpenMarkdownLink?: NotesMarkdownLinkOpenHandler;
  onEditLink?: NotesLinkEditHandler;
  onOpenWikiLink?: (target: string) => void;
  onSelectionStateChange?: (selection: NotesEditorSelectionState | null) => void;
  onUnparseableDocument?: (error: unknown) => void;
  readOnly?: boolean;
  focusMode?: boolean;
  typewriterMode?: boolean;
};

type RichEditableDocument = ReturnType<typeof parseEditableNoteSource>;

function createWysiwygDocumentSource(document: RichEditableDocument) {
  if (document.titleStorage === "virtual") {
    return document.bodySource;
  }

  if (!document.bodySource) {
    return `# ${document.title}`;
  }

  return `# ${document.title}\n\n${document.bodySource}`;
}

function clampPosition(position: number, doc: ProseMirrorNode) {
  return Math.min(Math.max(Math.round(position), 0), doc.content.size);
}

function createSelection(doc: ProseMirrorNode, from: number, to: number) {
  const start = clampPosition(Math.min(from, to), doc);
  const end = clampPosition(Math.max(from, to), doc);

  if (start === end) {
    return TextSelection.create(doc, start);
  }

  return TextSelection.create(doc, start, end);
}

function getLineAndColumnFromPosition(doc: ProseMirrorNode, position: number) {
  const prefix = doc.textBetween(0, clampPosition(position, doc), "\n");

  if (!prefix) {
    return { column: 0, line: 0 };
  }

  const lines = prefix.split("\n");
  const line = lines.length - 1;
  const column = lines[line].length;

  return { column, line };
}

function getLineFromPosition(doc: ProseMirrorNode, position: number) {
  return getLineAndColumnFromPosition(doc, position).line;
}

function updateActiveRichBlock(
  view: EditorView,
  options: { focusMode: boolean; typewriterMode: boolean },
) {
  view.dom
    .querySelectorAll(".notes-v2__rich-active-block")
    .forEach((element) =>
      element.classList.remove("notes-v2__rich-active-block"),
    );
  const node = view.domAtPos(view.state.selection.from).node;
  let element =
    node instanceof HTMLElement ? node : node.parentElement;
  while (element && element.parentElement !== view.dom) {
    element = element.parentElement;
  }
  if (!element) return;
  if (options.focusMode) {
    element.classList.add("notes-v2__rich-active-block");
  }
  if (options.typewriterMode) {
    element.scrollIntoView?.({ block: "center", inline: "nearest" });
  }
}

function getSelectionState(view: EditorView): NotesEditorSelectionState {
  const selection = view.state.selection;
  const { line, column } = getLineAndColumnFromPosition(view.state.doc, selection.head);

  return {
    column,
    from: selection.from,
    line,
    text: view.state.doc.textBetween(selection.from, selection.to, "\n"),
    to: selection.to,
  };
}

class RichCodeBlockView implements NodeView {
  dom: HTMLElement;

  contentDOM: HTMLElement;

  private previewHost: HTMLElement;

  private renderVersion = 0;

  constructor(node: ProseMirrorNode) {
    const wrapper = document.createElement("div");
    wrapper.className = "notes-v2__pm-code-block";

    const pre = document.createElement("pre");
    pre.className = "notes-v2__pm-code-block-source";

    const code = document.createElement("code");
    code.className = "notes-v2__pm-code-block-content";
    pre.append(code);

    const previewHost = document.createElement("div");
    previewHost.className = "notes-v2__pm-code-block-preview";
    previewHost.setAttribute("aria-hidden", "true");

    wrapper.append(pre, previewHost);

    this.dom = wrapper;
    this.contentDOM = code;
    this.previewHost = previewHost;
    this.updatePreview(node);
  }

  private updatePreview(node: ProseMirrorNode) {
    const language = normalizeLanguage(node.attrs.params);
    const currentVersion = ++this.renderVersion;

    if (!language) {
      this.previewHost.innerHTML = "";
      return;
    }

    void renderCodeBlockPreview(
      this.previewHost,
      language,
      node.textContent,
      currentVersion,
      () => this.renderVersion,
    );
  }

  ignoreMutation(mutation: ViewMutationRecord) {
    return !this.contentDOM.contains(mutation.target as Node);
  }

  update(node: ProseMirrorNode) {
    if (node.type.name !== "code_block") {
      return false;
    }

    this.updatePreview(node);
    return true;
  }

  destroy() {
    this.renderVersion += 1;
    this.previewHost.innerHTML = "";
  }
}

type NotesTocHeading = {
  depth: number;
  pos: number;
  text: string;
};
function collectNotesTocHeadings(doc: ProseMirrorNode): NotesTocHeading[] {
  const headings: NotesTocHeading[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "heading" && node.textContent.trim()) {
      headings.push({
        depth: Number(node.attrs.level) || 1,
        pos,
        text: node.textContent.trim(),
      });
    }
  });
  return headings;
}
class RichTableOfContentsView implements NodeView {
  dom: HTMLElement;
  private readonly refresh = () => this.render();
  constructor(private readonly getView: () => EditorView | null) {
    this.dom = document.createElement("nav");
    this.dom.className = "notes-v2__rich-toc";
    this.dom.setAttribute("aria-label", "文档目录");
    this.dom.setAttribute("data-notes-toc", "true");
    this.dom.contentEditable = "false";
    this.dom.addEventListener("click", this.handleClick);
    window.addEventListener(NOTES_TOC_REFRESH_EVENT, this.refresh);
    queueMicrotask(this.refresh);
  }
  private readonly handleClick = (event: MouseEvent) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
      "button[data-notes-toc-position]",
    );
    const view = this.getView();
    const rawPosition = button?.dataset.notesTocPosition;
    const position = rawPosition ? Number(rawPosition) : NaN;
    if (!button || !view || !Number.isFinite(position)) return;
    event.preventDefault();
    const target = Math.min(Math.max(position + 1, 0), view.state.doc.content.size);
    view.dispatch(
      view.state.tr
        .setSelection(Selection.near(view.state.doc.resolve(target), 1))
        .scrollIntoView(),
    );
    view.focus();
  };
  private render() {
    const view = this.getView();
    if (!view) return;
    const headings = collectNotesTocHeadings(view.state.doc);
    const title = document.createElement("p");
    title.className = "notes-v2__rich-toc-title";
    title.textContent = "目录";
    if (headings.length === 0) {
      const empty = document.createElement("p");
      empty.className = "notes-v2__rich-toc-empty";
      empty.textContent = "添加标题后自动生成目录。";
      this.dom.replaceChildren(title, empty);
      return;
    }
    const list = document.createElement("ol");
    list.className = "notes-v2__rich-toc-list";
    headings.forEach((heading) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = heading.text;
      button.dataset.notesTocPosition = String(heading.pos);
      button.style.paddingInlineStart = String(8 + (heading.depth - 1) * 14) + "px";
      item.append(button);
      list.append(item);
    });
    this.dom.replaceChildren(title, list);
  }
  update(node: ProseMirrorNode) {
    if (node.type.name !== "toc") return false;
    this.render();
    return true;
  }
  ignoreMutation() { return true; }
  destroy() {
    this.dom.removeEventListener("click", this.handleClick);
    window.removeEventListener(NOTES_TOC_REFRESH_EVENT, this.refresh);
  }
}
function createNotesRichEditorState(
  rawSource: string,
  resolveWikiLinkExists: (token: string) => boolean,
  sourcePeekController: NotesSourcePeekController,
  undoIntegrityPlugin?: Plugin,
) {
  const initialDoc = parseNotesRichMarkdown(rawSource, { throwOnRefusal: true });

  return EditorState.create({
    doc: initialDoc,
    plugins: [
      createNotesRichInputRules(notesRichEditorSchema),
      createNotesRichMathPastePlugin(notesRichEditorSchema),
      history(),
      ...(undoIntegrityPlugin ? [undoIntegrityPlugin] : []),
      // Formatting/list shortcuts first, then base editing keys; list-aware
      // Enter/Tab fall through to baseKeymap when not inside a list.
      keymap(createNotesRichKeymap(notesRichEditorSchema)),
      keymap(baseKeymap),
      tableEditing(),
      createWikiLinkDecorationPlugin(resolveWikiLinkExists),
      createNotesSourcePeekPlugin(sourcePeekController),
    ],
    schema: notesRichEditorSchema,
  });
}

function clampSelectionToDoc(
  selection: NotesEditorSelectionState,
  doc: ProseMirrorNode,
) {
  const safeFrom = clampPosition(selection.from, doc);
  const safeTo = clampPosition(selection.to, doc);

  return createSelection(doc, safeFrom, safeTo);
}

function getImePinyinPrefixLength(text: string, composed: string) {
  if (!composed || !CJK_COMPOSED_RE.test(composed) || !text.endsWith(composed)) {
    return null;
  }

  const prefix = text.slice(0, text.length - composed.length);

  if (!prefix || !PINYIN_PREFIX_RE.test(prefix) || !/[A-Za-z]/.test(prefix)) {
    return null;
  }

  return prefix.length;
}

function isNewNotePlaceholderDocument(document: RichEditableDocument | null) {
  return (
    document?.titleStorage === "virtual" &&
    document.bodySource.trim() === NEW_NOTE_BODY_PLACEHOLDER
  );
}

export function NotesRichEditorPane({
  document,
  documents,
  onActiveLineChange,
  onBridgeReady,
  onDocumentChange,
  onEnsureWikiLinkNote,
  onOpenMarkdownLink,
  onEditLink,
  onOpenWikiLink,
  onSelectionStateChange,
  readOnly = false,
  focusMode = false,
  typewriterMode = false,
  onUnparseableDocument,
}: NotesRichEditorPaneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  useNotesScrollMemory({
    enabled: Boolean(document),
    hostRef,
    path: document?.path,
    surface: "wysiwyg",
  });
  const viewRef = useRef<EditorView | null>(null);
  const bridgeRef = useRef<NotesEditorBridge | null>(null);
  const lastAppliedSourceRef = useRef<string | null>(null);
  const lastDocumentPathRef = useRef<string | null>(null);
  const editableDocumentRef = useRef<RichEditableDocument | null>(null);
  const isImeCompositionRef = useRef(false);
  const pendingImeSourceRef = useRef<string | null>(null);
  const imeCompositionDataRef = useRef("");
  const imeCompositionStartRef = useRef<number | null>(null);
  const imeCompositionTokenRef = useRef(0);
  const removeImeListenersRef = useRef<(() => void) | null>(null);
  const onActiveLineChangeRef = useRef(onActiveLineChange);
  const onBridgeReadyRef = useRef(onBridgeReady);
  const onDocumentChangeRef = useRef(onDocumentChange);
  const onEnsureWikiLinkNoteRef = useRef(onEnsureWikiLinkNote);
  const onOpenWikiLinkRef = useRef(onOpenWikiLink);
  const onOpenMarkdownLinkRef = useRef(onOpenMarkdownLink);
  const onEditLinkRef = useRef(onEditLink);
  const documentPathRef = useRef(document?.path ?? null);
  const onSelectionStateChangeRef = useRef(onSelectionStateChange);
  const onUnparseableDocumentRef = useRef(onUnparseableDocument);
  const isDocumentRefusedRef = useRef(false);
  const undoIntegrity = useMemo(() => createNotesUndoIntegrityPlugin(), []);
  const viewModeRef = useRef({ focusMode, readOnly, typewriterMode });
  const [tableToolbarState, setTableToolbarState] =
    useState<NotesRichTableToolbarState | null>(null);
  const [contextMenuTarget, setContextMenuTarget] =
    useState<EditorContextMenuTarget | null>(null);
  const [sourcePeek, setSourcePeek] = useState<NotesSourcePeekState | null>(
    null,
  );
  const [virtualTitleDraft, setVirtualTitleDraft] = useState("");
  const [findQuery, setFindQuery] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [isFindOpen, setIsFindOpen] = useState(false);
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const findQueryRef = useRef("");
  const sourcePeekControllerRef = useRef<NotesSourcePeekController>({
    cancel() {},
    commit() {},
    current: null,
    toggleLivePreview() {},
    updateMarkdown() {},
  });

  useEffect(() => {
    viewModeRef.current = { focusMode, readOnly, typewriterMode };
    if (viewRef.current) {
      viewRef.current.setProps({
        editable: () => !viewModeRef.current.readOnly,
      });
      updateActiveRichBlock(viewRef.current, viewModeRef.current);
    }
  }, [focusMode, readOnly, typewriterMode]);

  useEffect(() => {
    findQueryRef.current = findQuery;
  }, [findQuery]);

  const editableDocument = useMemo(
    () =>
      document ? parseEditableNoteSource(document.rawSource, document.path) : null,
    [document],
  );
  const wysiwygDocumentSource = useMemo(
    () =>
      editableDocument ? createWysiwygDocumentSource(editableDocument) : "",
    [editableDocument],
  );
  const shouldShowVirtualTitle = editableDocument?.titleStorage === "virtual";

  // Resolver for colouring wiki links as resolved vs missing. Memoised on the
  // vault documents alone (the source path is supplied per call), so switching
  // notes does not rebuild the lookup or fire a refresh transaction. Held in a
  // ref so the decoration plugin (created once at mount) always sees the latest
  // resolver without recreating the editor view.
  const wikiLinkExists = useMemo(
    () => createWikiLinkResolver(documents),
    [documents],
  );
  const wikiLinkExistsRef = useRef(wikiLinkExists);

  useEffect(() => {
    editableDocumentRef.current = editableDocument;
  }, [editableDocument]);

  useEffect(() => {
    setVirtualTitleDraft("");
  }, [document?.path]);

  useEffect(() => {
    onEnsureWikiLinkNoteRef.current = onEnsureWikiLinkNote;
  }, [onEnsureWikiLinkNote]);

  // Keep the resolver ref current and force the decoration plugin to recompute
  // colours when the vault's documents change (a no-op sync transaction).
  useEffect(() => {
    wikiLinkExistsRef.current = wikiLinkExists;

    const view = viewRef.current;

    if (view) {
      view.dispatch(view.state.tr.setMeta(NOTES_RICH_EDITOR_SYNC_META, true));
    }
  }, [wikiLinkExists]);

  useEffect(() => {
    onActiveLineChangeRef.current = onActiveLineChange;
  }, [onActiveLineChange]);

  useEffect(() => {
    onBridgeReadyRef.current = onBridgeReady;
  }, [onBridgeReady]);

  useEffect(() => {
    onDocumentChangeRef.current = onDocumentChange;
  }, [onDocumentChange]);

  useEffect(() => {
    onOpenWikiLinkRef.current = onOpenWikiLink;
  }, [onOpenWikiLink]);

  useEffect(() => {
    onOpenMarkdownLinkRef.current = onOpenMarkdownLink;
  }, [onOpenMarkdownLink]);

  useEffect(() => {
    onEditLinkRef.current = onEditLink;
  }, [onEditLink]);

  useLayoutEffect(() => {
    documentPathRef.current = document?.path ?? null;
  }, [document?.path]);

  useEffect(() => {
    onSelectionStateChangeRef.current = onSelectionStateChange;
  }, [onSelectionStateChange]);

  useEffect(() => {
    onUnparseableDocumentRef.current = onUnparseableDocument;
  }, [onUnparseableDocument]);

  const handleContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const view = viewRef.current;

      if (!view) {
        return;
      }

      const selection = view.state.selection;

      if (selection.empty) {
        return;
      }

      const text = view.state.doc.textBetween(
        selection.from,
        selection.to,
        "\n",
      );

      if (!text.trim() || text.includes("\n")) {
        return;
      }

      event.preventDefault();
      setContextMenuTarget({
        from: selection.from,
        text,
        to: selection.to,
        x: event.clientX,
        y: event.clientY,
      });
    },
    [],
  );

  const handleAddWikiLink = useCallback(
    (target: EditorContextMenuTarget) => {
      const view = viewRef.current;

      if (!view || viewModeRef.current.readOnly) {
        return;
      }

      // Insert a live wiki_link node so the new link renders (and colours)
      // immediately instead of waiting for the next markdown reparse.
      const node = notesRichEditorSchema.nodes.wiki_link.create({
        target: target.text,
        token: target.text,
      });

      view.dispatch(view.state.tr.replaceWith(target.from, target.to, node));
      view.focus();

      onEnsureWikiLinkNoteRef.current?.(
        target.text,
        editableDocumentRef.current?.path,
      );
    },
    [],
  );

  const handleCloseContextMenu = useCallback(() => {
    setContextMenuTarget(null);
  }, []);

  const handleTableToolbarAction = useCallback(
    (action: NotesRichTableToolbarAction) => {
      const view = viewRef.current;

      if (!view || viewModeRef.current.readOnly) {
        return;
      }

      runNotesRichTableToolbarAction(view, action);
    },
    [],
  );

  const commitVirtualTitle = useCallback(() => {
    const nextTitle = virtualTitleDraft.trim();
    const currentEditableDocument = editableDocumentRef.current;

    if (!nextTitle || currentEditableDocument?.titleStorage !== "virtual") {
      return;
    }

    const view = viewRef.current;
    const bodySource = view
      ? serializeNotesRichMarkdown(view.state.doc)
      : currentEditableDocument.bodySource;

    onDocumentChangeRef.current(
      composeEditableNoteSource(currentEditableDocument, {
        bodySource,
        title: nextTitle,
      }),
    );
  }, [virtualTitleDraft]);

  const handleVirtualTitleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        event.currentTarget.blur();
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setVirtualTitleDraft("");
        event.currentTarget.blur();
      }
    },
    [],
  );

  const clearNewNotePlaceholder = useCallback((view: EditorView) => {
    if (!isNewNotePlaceholderDocument(editableDocumentRef.current)) {
      return false;
    }

    if (serializeNotesRichMarkdown(view.state.doc).trim() !== NEW_NOTE_BODY_PLACEHOLDER) {
      return false;
    }

    view.dispatch(
      view.state.tr
        .delete(0, view.state.doc.content.size)
        .scrollIntoView(),
    );
    view.focus();
    return true;
  }, []);

  const updateSourcePeek = useCallback((next: NotesSourcePeekState | null) => {
    sourcePeekControllerRef.current.current = next;
    setSourcePeek(next);
  }, []);

  const closeSourcePeek = useCallback(
    (view: EditorView, restoreSelection = true) => {
      const peek = sourcePeekControllerRef.current.current;

      updateSourcePeek(null);
      const transaction = view.state.tr.setMeta(NOTES_SOURCE_PEEK_META, true);

      if (peek && restoreSelection) {
        transaction.setSelection(
          createSelection(transaction.doc, peek.selection.from, peek.selection.to),
        );
      }

      view.dispatch(transaction);
      view.focus();
    },
    [updateSourcePeek],
  );

  const commitSourcePeek = useCallback(
    (view: EditorView) => {
      const peek = sourcePeekControllerRef.current.current;

      if (!peek) {
        return;
      }

      if (peek.markdown !== peek.originalMarkdown) {
        applyNotesSourcePeekMarkdown(
          view,
          peek.range,
          peek.markdown,
          peek.selection,
        );
      }

      closeSourcePeek(view, false);
    },
    [closeSourcePeek],
  );

  const updateSourcePeekMarkdown = useCallback(
    (view: EditorView, markdown: string) => {
      const currentPeek = sourcePeekControllerRef.current.current;

      if (!currentPeek) {
        return;
      }

      let nextPeek: NotesSourcePeekState = {
        ...currentPeek,
        markdown,
      };

      if (
        currentPeek.livePreview &&
        applyNotesSourcePeekMarkdown(view, currentPeek.range, markdown)
      ) {
        nextPeek = {
          ...nextPeek,
          range: getNotesSourcePeekRange(view.state),
        };
      }

      updateSourcePeek(nextPeek);
    },
    [updateSourcePeek],
  );

  const toggleSourcePeekLivePreview = useCallback(
    (view: EditorView) => {
      const currentPeek = sourcePeekControllerRef.current.current;

      if (!currentPeek) {
        return;
      }

      updateSourcePeek({
        ...currentPeek,
        livePreview: !currentPeek.livePreview,
      });
      view.dispatch(view.state.tr.setMeta(NOTES_SOURCE_PEEK_META, true));
    },
    [updateSourcePeek],
  );

  const openSourcePeek = useCallback(
    (view: EditorView) => {
      if (sourcePeekControllerRef.current.current) {
        closeSourcePeek(view);
        return true;
      }

      const range = getNotesSourcePeekRange(view.state);
      const node = getNotesSourcePeekNode(view.state, range);

      if (!node || !canUseNotesSourcePeek(node.type.name)) {
        return false;
      }

      const markdown = serializeNotesSourcePeekRange(view.state, range);

      updateSourcePeek({
        livePreview: false,
        markdown,
        nodeType: node.type.name,
        originalMarkdown: markdown,
        range,
        selection: view.state.selection,
      });
      view.dispatch(view.state.tr.setMeta(NOTES_SOURCE_PEEK_META, true));
      return true;
    },
    [closeSourcePeek, updateSourcePeek],
  );

  useEffect(() => {
    const controller = sourcePeekControllerRef.current;
    controller.cancel = closeSourcePeek;
    controller.commit = commitSourcePeek;
    controller.toggleLivePreview = toggleSourcePeekLivePreview;
    controller.updateMarkdown = updateSourcePeekMarkdown;
  }, [
    closeSourcePeek,
    commitSourcePeek,
    toggleSourcePeekLivePreview,
    updateSourcePeekMarkdown,
  ]);

  useEffect(() => {
    sourcePeekControllerRef.current.current = null;
    setSourcePeek(null);

    const view = viewRef.current;

    if (view) {
      view.dispatch(view.state.tr.setMeta(NOTES_SOURCE_PEEK_META, true));
    }
  }, [document?.path]);

  useEffect(() => {
    imeCompositionTokenRef.current += 1;
    isImeCompositionRef.current = false;
    pendingImeSourceRef.current = null;
    imeCompositionDataRef.current = "";
    imeCompositionStartRef.current = null;
  }, [document?.path]);

  useEffect(() => {
    if (
      !hostRef.current ||
      !document ||
      !editableDocument ||
      viewRef.current
    ) {
      return;
    }

    const viewState = {
      current: null as EditorView | null,
    };

    const flushPendingImeChange = (compositionToken: number) => {
      if (imeCompositionTokenRef.current !== compositionToken) {
        return;
      }

      isImeCompositionRef.current = false;
      imeCompositionDataRef.current = "";
      imeCompositionStartRef.current = null;

      const pendingSource = pendingImeSourceRef.current;
      pendingImeSourceRef.current = null;

      if (pendingSource !== null) {
        onDocumentChangeRef.current(pendingSource);
      }
    };

    const removeLeftoverPinyin = (composed: string) => {
      const start = imeCompositionStartRef.current;

      if (start === null) {
        return;
      }

      try {
        const $start = view.state.doc.resolve(start);
        const text = view.state.doc.textBetween(start, $start.end(), "\n");
        const prefixLength = getImePinyinPrefixLength(text, composed);

        if (prefixLength !== null) {
          view.dispatch(view.state.tr.delete(start, start + prefixLength));
        }
      } catch {
        // The document may have changed before the browser completes IME input.
      }
    };

    const handleCompositionStart = () => {
      imeCompositionTokenRef.current += 1;
      isImeCompositionRef.current = true;
      pendingImeSourceRef.current = null;
      imeCompositionDataRef.current = "";
      imeCompositionStartRef.current = view.state.selection.from;
    };

    const handleCompositionUpdate = (event: CompositionEvent) => {
      imeCompositionDataRef.current = event.data || imeCompositionDataRef.current;
    };

    const handleCompositionEnd = (event: CompositionEvent) => {
      const compositionToken = imeCompositionTokenRef.current;
      const composed = event.data || imeCompositionDataRef.current;

      // This listener runs after ProseMirror's own event handler. The next
      // animation frame therefore sees its final document state without
      // interfering with macOS's candidate-selection event sequence.
      window.requestAnimationFrame(() => {
        if (imeCompositionTokenRef.current !== compositionToken) {
          return;
        }

        removeLeftoverPinyin(composed);
        flushPendingImeChange(compositionToken);
      });
    };

    isDocumentRefusedRef.current = false;
    let initialEditorState;
    try {
      initialEditorState = createNotesRichEditorState(
        wysiwygDocumentSource,
        (token) =>
          wikiLinkExistsRef.current(
            token,
            editableDocumentRef.current?.path ?? "",
          ),
        sourcePeekControllerRef.current,
        undoIntegrity.plugin,
      );
    } catch (error) {
      isDocumentRefusedRef.current = true;
      console.warn(
        "[NotesRichEditorPane] Document refused by rich markdown parser:",
        error,
      );
      onUnparseableDocumentRef.current?.(error);
      return;
    }

    const view = new EditorView(hostRef.current, {
      editable: () => !viewModeRef.current.readOnly,
      handleKeyDown(keyView, event) {
        const isMod = event.metaKey || event.ctrlKey;

        if (isMod && event.key.toLowerCase() === "k") {
          const linkRange = findNotesRichLinkMarkRange(
            keyView.state.doc,
            keyView.state.selection.from,
          );
          const editLink = onEditLinkRef.current;

          if (linkRange && editLink && !viewModeRef.current.readOnly) {
            event.preventDefault();
            const initialDoc = keyView.state.doc;
            const initialPath = documentPathRef.current;
            const initialHref = String(linkRange.mark.attrs.href ?? "");

            void editLink(initialHref)
              .then((nextHref) => {
                if (
                  nextHref === null ||
                  documentPathRef.current !== initialPath ||
                  !keyView.dom.isConnected ||
                  !keyView.state.doc.eq(initialDoc)
                ) {
                  return;
                }

                const currentRange = findNotesRichLinkMarkRange(
                  keyView.state.doc,
                  keyView.state.selection.from,
                );
                if (
                  !currentRange ||
                  currentRange.from !== linkRange.from ||
                  currentRange.to !== linkRange.to ||
                  String(currentRange.mark.attrs.href ?? "") !== initialHref
                ) {
                  return;
                }

                const trimmedHref = nextHref.trim();
                let transaction = keyView.state.tr.removeMark(
                  currentRange.from,
                  currentRange.to,
                  currentRange.mark.type,
                );
                if (trimmedHref) {
                  transaction = transaction.addMark(
                    currentRange.from,
                    currentRange.to,
                    currentRange.mark.type.create({
                      ...currentRange.mark.attrs,
                      href: trimmedHref,
                    }),
                  );
                }
                keyView.dispatch(transaction);
                keyView.focus();
              })
              .catch((error) => {
                console.warn("[NotesRichEditorPane] Link edit failed:", error);
              });

            return true;
          }
        }

        if (isMod && event.key.toLowerCase() === "f") {
          event.preventDefault();
          setIsFindOpen(true);
          window.requestAnimationFrame(() => {
            findInputRef.current?.focus();
            findInputRef.current?.select();
          });
          return true;
        }

        if (event.key === "F3" || (isMod && event.key.toLowerCase() === "g")) {
          event.preventDefault();
          return selectNextNotesRichSearchMatch(
            keyView,
            findQueryRef.current,
            event.shiftKey,
          );
        }

        if (event.key === "F5") {
          event.preventDefault();

          if (sourcePeekControllerRef.current.current) {
            sourcePeekControllerRef.current.cancel(keyView);
            return true;
          }

          return openSourcePeek(keyView);
        }

        if (event.key === "Escape" && sourcePeekControllerRef.current.current) {
          event.preventDefault();
          sourcePeekControllerRef.current.cancel(keyView);
          return true;
        }

        return false;
      },
      handleClick(clickView, position, event) {
        if (!readOnly && clearNewNotePlaceholder(clickView)) {
          event.preventDefault();
          return true;
        }

        const handler = onOpenWikiLinkRef.current;

        if (!handler) {
          return false;
        }

        // Obsidian-style: a plain click on a rendered [[wiki link]] node jumps
        // to the target note.
        const clickedNode =
          clickView.state.doc.nodeAt(position) ??
          (position > 0 ? clickView.state.doc.nodeAt(position - 1) : null);

        if (clickedNode?.type.name === "wiki_link") {
          event.preventDefault();
          handler(
            (clickedNode.attrs.token as string) ||
              (clickedNode.attrs.target as string),
          );
          return true;
        }

        // Fallback for raw `[[...]]` still present as text (e.g. inside code):
        // require mod+click so plain clicks keep placing the cursor.
        if (!(event.metaKey || event.ctrlKey)) {
          return false;
        }

        const resolved = clickView.state.doc.resolve(position);
        const parent = resolved.parent;

        if (!parent.isTextblock) {
          return false;
        }

        const lineText = parent.textBetween(0, parent.content.size, "\n", "\n");
        const target = findWikiLinkAtLineOffset(
          lineText,
          position - resolved.start(),
        );

        if (!target) {
          return false;
        }

        event.preventDefault();
        handler(target);
        return true;
      },
      handleDOMEvents: {
        click(_clickView, event) {
          const mouseEvent = event as MouseEvent;
          if (mouseEvent.button !== 0) return false;
          const eventTarget = event.target;
          const target =
            eventTarget instanceof Element
              ? eventTarget
              : eventTarget instanceof Node
                ? eventTarget.parentElement
                : null;
          const anchor = target?.closest("a[href]");
          if (!anchor || anchor.hasAttribute("data-wikilink-target")) return false;

          const href = anchor.getAttribute("href");
          if (!href) return false;

          // Prevent native webview navigation on macOS and Windows. An
          // ordinary editable click leaves the caret in the link text; a
          // modified click opens it through the Notes link router.
          event.preventDefault();
          if (viewModeRef.current.readOnly || mouseEvent.metaKey || mouseEvent.ctrlKey) {
            void onOpenMarkdownLinkRef.current?.(href, documentPathRef.current);
          }
          return true;
        },
      },
      dispatchTransaction(transaction) {
        if (isDocumentRefusedRef.current) {
          return;
        }

        const currentView = viewState.current;

        if (!currentView) {
          return;
        }

        undoIntegrity.dispatch(transaction, (tr) => {
          if (
            tr.docChanged &&
            viewModeRef.current.readOnly &&
            !tr.getMeta(NOTES_RICH_EDITOR_SYNC_META)
          ) {
            return;
          }

          const nextState = currentView.state.apply(tr);
          currentView.updateState(nextState);
          updateActiveRichBlock(currentView, viewModeRef.current);
          setTableToolbarState(getNotesRichTableToolbarState(nextState));

          if (
            tr.getMeta(NOTES_RICH_EDITOR_SYNC_META) ||
            tr.getMeta(NOTES_SOURCE_PEEK_META)
          ) {
            return;
          }

          if (tr.docChanged) {
            window.dispatchEvent(new Event(NOTES_TOC_REFRESH_EVENT));
            const nextWysiwygSource = serializeNotesRichMarkdown(nextState.doc);
            const currentEditableDocument = editableDocumentRef.current;

            if (!currentEditableDocument) {
              return;
            }

            const nextEditableDocument = parseEditableNoteSource(
              nextWysiwygSource,
              currentEditableDocument.path,
            );

            lastAppliedSourceRef.current = nextWysiwygSource;
            const nextSource = composeEditableNoteSource(
              currentEditableDocument,
              {
                bodySource: nextEditableDocument.bodySource,
                title: nextEditableDocument.title,
              },
            );

            if (isImeCompositionRef.current) {
              pendingImeSourceRef.current = nextSource;
            } else {
              onDocumentChangeRef.current(nextSource);
            }
          }
          const selection = getSelectionState(currentView);
          onSelectionStateChangeRef.current?.(selection);
          onActiveLineChangeRef.current?.(selection.line);
        });
      },
      nodeViews: {
        code_block: (node) => new RichCodeBlockView(node),
        math_block: (node, mathView, getPos) =>
          createNotesMathBlockNodeView(node, mathView, getPos),
        math_inline: (node, mathView, getPos) =>
          createNotesMathInlineNodeView(node, mathView, getPos),
        toc: () => new RichTableOfContentsView(() => viewState.current),
      },
      state: initialEditorState,
    });
    viewState.current = view;
    view.dom.addEventListener("compositionstart", handleCompositionStart);
    view.dom.addEventListener("compositionupdate", handleCompositionUpdate);
    view.dom.addEventListener("compositionend", handleCompositionEnd);
    removeImeListenersRef.current = () => {
      view.dom.removeEventListener("compositionstart", handleCompositionStart);
      view.dom.removeEventListener("compositionupdate", handleCompositionUpdate);
      view.dom.removeEventListener("compositionend", handleCompositionEnd);
    };
    setTableToolbarState(getNotesRichTableToolbarState(view.state));

    (hostRef.current as NotesRichEditorHostElement).__notesRichEditorView = view;
    viewRef.current = view;
    const bridge = createNotesRichEditorBridge(
      view,
      () => openSourcePeek(view),
      () => viewModeRef.current.readOnly,
    );
    bridgeRef.current = bridge;
    lastAppliedSourceRef.current = wysiwygDocumentSource;
    lastDocumentPathRef.current = document.path;
    onActiveLineChangeRef.current?.(0);
    onBridgeReadyRef.current?.(bridgeRef.current);
    updateActiveRichBlock(view, viewModeRef.current);
  }, [
    clearNewNotePlaceholder,
    document,
    editableDocument,
    openSourcePeek,
    readOnly,
    undoIntegrity,
    wysiwygDocumentSource,
  ]);

  useEffect(() => {
    const view = viewRef.current;

    if (!view || !document || !editableDocument) {
      return;
    }

    if (
      lastDocumentPathRef.current === document.path &&
      isImeCompositionRef.current
    ) {
      return;
    }

    const currentSource = serializeNotesRichMarkdown(view.state.doc);
    const hasNewExternalSource =
      lastAppliedSourceRef.current !== wysiwygDocumentSource;
    const documentPathChanged = lastDocumentPathRef.current !== document.path;

    if (
      lastDocumentPathRef.current === document.path &&
      (!hasNewExternalSource || currentSource === wysiwygDocumentSource)
    ) {
      lastAppliedSourceRef.current = wysiwygDocumentSource;
      return;
    }

    let nextDoc;
    try {
      nextDoc = parseNotesRichMarkdown(wysiwygDocumentSource, { throwOnRefusal: true });
    } catch (error) {
      isDocumentRefusedRef.current = true;
      onUnparseableDocumentRef.current?.(error);
      return;
    }
    const transaction = view.state.tr
      .setMeta(NOTES_RICH_EDITOR_SYNC_META, true)
      .replace(0, view.state.doc.content.size, new Slice(nextDoc.content, 0, 0));

    if (lastDocumentPathRef.current === document.path) {
      transaction.setSelection(
        clampSelectionToDoc(
          {
            from: view.state.selection.from,
            line: getLineFromPosition(view.state.doc, view.state.selection.head),
            text: view.state.doc.textBetween(
              view.state.selection.from,
              view.state.selection.to,
              "\n",
            ),
            to: view.state.selection.to,
          },
          transaction.doc,
        ),
      );
    } else {
      transaction.setSelection(TextSelection.create(transaction.doc, 1));
    }

    view.dispatch(transaction.scrollIntoView());
    lastAppliedSourceRef.current = wysiwygDocumentSource;
    lastDocumentPathRef.current = document.path;
    if (documentPathChanged) onBridgeReadyRef.current?.(bridgeRef.current);
  }, [document, editableDocument, wysiwygDocumentSource]);

  useEffect(() => {
    if (document || !viewRef.current) {
      return;
    }

    const host = hostRef.current as NotesRichEditorHostElement | null;

    removeImeListenersRef.current?.();
    removeImeListenersRef.current = null;
    onBridgeReadyRef.current?.(null);
    bridgeRef.current = null;
    lastAppliedSourceRef.current = null;
    lastDocumentPathRef.current = null;
    onSelectionStateChangeRef.current?.(null);
    setTableToolbarState(null);
    if (host) {
      host.__notesRichEditorView = undefined;
    }
    viewRef.current.destroy();
    viewRef.current = null;
  }, [document]);

  useEffect(() => {
    const host = hostRef.current as NotesRichEditorHostElement | null;

    return () => {
      imeCompositionTokenRef.current += 1;
      isImeCompositionRef.current = false;
      pendingImeSourceRef.current = null;
      imeCompositionDataRef.current = "";
      imeCompositionStartRef.current = null;
      removeImeListenersRef.current?.();
      removeImeListenersRef.current = null;
      onBridgeReadyRef.current?.(null);
      bridgeRef.current = null;
      lastAppliedSourceRef.current = null;
      lastDocumentPathRef.current = null;
      onSelectionStateChangeRef.current?.(null);
      setTableToolbarState(null);
      if (host) {
        host.__notesRichEditorView = undefined;
      }
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, []);

  if (!document) {
    return (
      <div className="notes-v2__rich-editor-pane">
        <p className="notes-v2__empty-copy">{NOTES_UI_COPY.emptyEditor}</p>
      </div>
    );
  }

  return (
    <div
      className="notes-v2__rich-editor-pane"
      data-source-peek-open={sourcePeek ? "true" : "false"}
    >
      <div
        className="notes-v2__rich-editor-surface"
        data-virtual-title={shouldShowVirtualTitle ? "true" : "false"}
      >
        {isFindOpen ? (
          <div className="notes-v2__find-replace">
            <label className="notes-v2__find-replace-field">
              <span>查找</span>
              <input
                aria-label="所见即所得查找"
                onChange={(event) => setFindQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && viewRef.current) {
                    event.preventDefault();
                    selectNextNotesRichSearchMatch(
                      viewRef.current,
                      findQuery,
                      event.shiftKey,
                    );
                  }
                  if (event.key === "Escape") {
                    setIsFindOpen(false);
                    viewRef.current?.focus();
                  }
                }}
                ref={findInputRef}
                type="search"
                value={findQuery}
              />
            </label>
            {!readOnly ? (
              <label className="notes-v2__find-replace-field">
                <span>替换</span>
                <input
                  aria-label="所见即所得替换"
                  onChange={(event) => setReplaceText(event.target.value)}
                  type="text"
                  value={replaceText}
                />
              </label>
            ) : null}
            <div className="notes-v2__find-replace-actions">
              <button
                onClick={() =>
                  viewRef.current &&
                  selectNextNotesRichSearchMatch(viewRef.current, findQuery, true)
                }
                type="button"
              >
                上一个
              </button>
              <button
                onClick={() =>
                  viewRef.current &&
                  selectNextNotesRichSearchMatch(viewRef.current, findQuery)
                }
                type="button"
              >
                下一个
              </button>
              {!readOnly ? (
                <>
                  <button
                    onClick={() =>
                      viewRef.current &&
                      replaceNextNotesRichSearchMatch(
                        viewRef.current,
                        findQuery,
                        replaceText,
                      )
                    }
                    type="button"
                  >
                    替换当前
                  </button>
                  <button
                    onClick={() =>
                      viewRef.current &&
                      replaceAllNotesRichSearchMatches(
                        viewRef.current,
                        findQuery,
                        replaceText,
                      )
                    }
                    type="button"
                  >
                    全部替换
                  </button>
                </>
              ) : null}
              <button onClick={() => setIsFindOpen(false)} type="button">
                关闭
              </button>
            </div>
          </div>
        ) : null}
        {shouldShowVirtualTitle ? (
          <input
            aria-label="Note title"
            className="notes-v2__virtual-title-input"
            onBlur={commitVirtualTitle}
            onChange={(event) => setVirtualTitleDraft(event.target.value)}
            onKeyDown={handleVirtualTitleKeyDown}
            placeholder=""
            readOnly={readOnly}
            type="text"
            value={virtualTitleDraft}
          />
        ) : null}
        <NotesRichTableToolbar
          onAction={handleTableToolbarAction}
          state={tableToolbarState}
        />
        <div
          className="notes-v2__editor-host notes-v2__editor-host--wysiwyg"
          data-testid="notes-prosemirror-host"
          onContextMenu={handleContextMenu}
          ref={hostRef}
        />
      </div>
      {contextMenuTarget ? (
        <NotesEditorContextMenu
          onAddWikiLink={handleAddWikiLink}
          onClose={handleCloseContextMenu}
          target={contextMenuTarget}
        />
      ) : null}
    </div>
  );
}
