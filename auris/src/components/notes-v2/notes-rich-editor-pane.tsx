"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { baseKeymap } from "prosemirror-commands";
import { history } from "prosemirror-history";
import { EditorState, TextSelection } from "prosemirror-state";
import { keymap } from "prosemirror-keymap";
import { Node as ProseMirrorNode, Slice } from "prosemirror-model";
import { EditorView, type NodeView, type ViewMutationRecord } from "prosemirror-view";
import {
  NotesEditorContextMenu,
  type EditorContextMenuTarget,
} from "@/components/notes-v2/notes-editor-context-menu";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
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
  notesRichEditorSchema,
  parseNotesRichMarkdown,
  serializeNotesRichMarkdown,
} from "@/features/notes/editor/notes-rich-markdown";
import { createNotesRichInputRules } from "@/features/notes/editor/notes-rich-input-rules";
import { createNotesRichKeymap } from "@/features/notes/editor/notes-rich-keymap";
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
  NotesEditorSelectionState,
} from "@/features/notes/editor/editor-types";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import { NotesRichTableToolbar } from "@/components/notes-v2/notes-rich-table-toolbar";
import {
  getNotesRichTableToolbarState,
  runNotesRichTableToolbarAction,
  type NotesRichTableToolbarAction,
  type NotesRichTableToolbarState,
} from "@/features/notes/editor/editor-table-toolbar";
import { tableEditing } from "prosemirror-tables";

const NOTES_RICH_EDITOR_SYNC_META = "shadowing-notes-rich-editor-sync";
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
  onOpenWikiLink?: (target: string) => void;
  onSelectionStateChange?: (selection: NotesEditorSelectionState | null) => void;
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

function getLineFromPosition(doc: ProseMirrorNode, position: number) {
  const prefix = doc.textBetween(0, clampPosition(position, doc), "\n");

  if (!prefix) {
    return 0;
  }

  return prefix.split("\n").length - 1;
}

function getSelectionState(view: EditorView): NotesEditorSelectionState {
  const selection = view.state.selection;

  return {
    from: selection.from,
    line: getLineFromPosition(view.state.doc, selection.head),
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

function createNotesRichEditorState(
  rawSource: string,
  resolveWikiLinkExists: (token: string) => boolean,
  sourcePeekController: NotesSourcePeekController,
) {
  const initialDoc = parseNotesRichMarkdown(rawSource);

  return EditorState.create({
    doc: initialDoc,
    plugins: [
      createNotesRichInputRules(notesRichEditorSchema),
      history(),
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
  onOpenWikiLink,
  onSelectionStateChange,
}: NotesRichEditorPaneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
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
  const onSelectionStateChangeRef = useRef(onSelectionStateChange);
  const [tableToolbarState, setTableToolbarState] =
    useState<NotesRichTableToolbarState | null>(null);
  const [contextMenuTarget, setContextMenuTarget] =
    useState<EditorContextMenuTarget | null>(null);
  const [sourcePeek, setSourcePeek] = useState<NotesSourcePeekState | null>(
    null,
  );
  const [virtualTitleDraft, setVirtualTitleDraft] = useState("");
  const sourcePeekControllerRef = useRef<NotesSourcePeekController>({
    cancel() {},
    commit() {},
    current: null,
    toggleLivePreview() {},
    updateMarkdown() {},
  });

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
    onSelectionStateChangeRef.current = onSelectionStateChange;
  }, [onSelectionStateChange]);

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

      if (!view) {
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

      if (!view) {
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

    const view = new EditorView(hostRef.current, {
      handleKeyDown(keyView, event) {
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
        if (clearNewNotePlaceholder(clickView)) {
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
      dispatchTransaction(transaction) {
        const currentView = viewState.current;

        if (!currentView) {
          return;
        }

        const nextState = currentView.state.apply(transaction);
        currentView.updateState(nextState);
        setTableToolbarState(getNotesRichTableToolbarState(nextState));

        if (
          transaction.getMeta(NOTES_RICH_EDITOR_SYNC_META) ||
          transaction.getMeta(NOTES_SOURCE_PEEK_META)
        ) {
          return;
        }

        if (transaction.docChanged) {
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
      },
      nodeViews: {
        code_block: (node) => new RichCodeBlockView(node),
      },
      state: createNotesRichEditorState(
        wysiwygDocumentSource,
        (token) =>
          wikiLinkExistsRef.current(
            token,
            editableDocumentRef.current?.path ?? "",
          ),
        sourcePeekControllerRef.current,
      ),
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
    const bridge = createNotesRichEditorBridge(view, () => openSourcePeek(view));
    bridgeRef.current = bridge;
    lastAppliedSourceRef.current = wysiwygDocumentSource;
    lastDocumentPathRef.current = document.path;
    onActiveLineChangeRef.current?.(0);
    onBridgeReadyRef.current?.(bridgeRef.current);
  }, [
    clearNewNotePlaceholder,
    document,
    editableDocument,
    openSourcePeek,
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

    if (
      lastDocumentPathRef.current === document.path &&
      (!hasNewExternalSource || currentSource === wysiwygDocumentSource)
    ) {
      lastAppliedSourceRef.current = wysiwygDocumentSource;
      return;
    }

    const nextDoc = parseNotesRichMarkdown(wysiwygDocumentSource);
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
        {shouldShowVirtualTitle ? (
          <input
            aria-label="Note title"
            className="notes-v2__virtual-title-input"
            onBlur={commitVirtualTitle}
            onChange={(event) => setVirtualTitleDraft(event.target.value)}
            onKeyDown={handleVirtualTitleKeyDown}
            placeholder=""
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
