"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Compartment, EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  NotesEditorContextMenu,
  type EditorContextMenuTarget,
} from "@/components/notes-v2/notes-editor-context-menu";
import { NotesRichEditorPane } from "@/components/notes-v2/notes-rich-editor-pane";
import { useNotesScrollMemory } from "@/components/notes-v2/use-notes-scroll-memory";
import { NotesWechatPreview } from "@/components/notes-v2/notes-wechat-preview";
import { StructuredDataPreview } from "@/components/notes-v2/structured-data-preview";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import {
  NEW_NOTE_BODY_PLACEHOLDER,
  composeEditableNoteSource,
  parseEditableNoteSource,
} from "@/features/notes/documents/note-editing-source";
import { resolveMarkdownImageSource } from "@/features/notes/editor/code-block-preview";
import { refreshNotesMixedRendering } from "@/features/notes/editor/editor-mixed-rendering";
import {
  getNotesMediaReloadKey,
  subscribeNotesMediaReloadKey,
} from "@/features/notes/editor/notes-media-reload";
import { notesEditorSyncAnnotation } from "@/features/notes/editor/editor-annotations";
import {
  findNextNotesEditorSearchMatch,
  findPreviousNotesEditorSearchMatch,
  replaceAllNotesEditorSearchMatches,
  replaceNextNotesEditorSearchMatch,
  setNotesEditorSearchQuery,
} from "@/features/notes/editor/editor-find-replace";
import { clampSelectionToDocument } from "@/features/notes/editor/editor-selection";
import {
  createNotesEditorBridge,
  createNotesEditorState,
} from "@/features/notes/editor/editor-state-bridge";
import type {
  NotesEditorBridge,
  NotesEditorMode,
  NotesEditorSelectionState,
} from "@/features/notes/editor/editor-types";
import { lintMarkdown } from "@/features/notes/editor/markdown-lint";
import {
  DEFAULT_NOTES_VIEW_PREFERENCES,
  type NotesViewPreferences,
} from "@/features/notes/editor/notes-view-preferences";
import { getFormatDescriptor } from "@/features/notes/formats/format-registry";
import type { StructuredDataFormat } from "@/features/notes/formats/structured-data";

type NotesEditorHostElement = HTMLDivElement & {
  __notesEditorView?: EditorView;
};

type NotesEditorPaneProps = {
  document: NoteDocument | null;
  documents: NoteDocument[];
  editorMode?: NotesEditorMode;
  onActiveLineChange?: (line: number) => void;
  onBridgeReady?: (bridge: NotesEditorBridge | null) => void;
  onDocumentChange: (nextSource: string) => void;
  onEnsureWikiLinkNote?: (target: string, sourcePath?: string) => void;
  onOpenWikiLink?: (target: string) => void;
  onSelectionStateChange?: (selection: NotesEditorSelectionState | null) => void;
  viewPreferences?: NotesViewPreferences;
};

function isNewNotePlaceholderSource(document: NoteDocument | null) {
  return document?.rawSource.trim() === NEW_NOTE_BODY_PLACEHOLDER;
}

function parseDocumentEditableSource(document: NoteDocument) {
  const format = getFormatDescriptor(document.path);
  if (format.id === "markdown") {
    return parseEditableNoteSource(document.rawSource, document.path);
  }
  return {
    bodyLineStart: 0,
    bodySource: document.rawSource,
    frontmatter: {},
    hasSpacerAfterTitleHeading: false,
    path: document.path,
    title: document.basename,
    titleStorage: "virtual" as const,
  };
}

export function NotesEditorPane({
  document,
  documents,
  editorMode: requestedEditorMode = "wysiwyg",
  onActiveLineChange,
  onBridgeReady,
  onDocumentChange,
  onEnsureWikiLinkNote,
  onOpenWikiLink,
  onSelectionStateChange,
  viewPreferences = DEFAULT_NOTES_VIEW_PREFERENCES,
}: NotesEditorPaneProps) {
  const format = getFormatDescriptor(document?.path ?? "");
  const isStructured = format.previewKind === "structured-tree";
  const editorMode =
    isStructured && requestedEditorMode === "wysiwyg"
      ? "split"
      : requestedEditorMode;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const splitPreviewRef = useRef<HTMLDivElement | null>(null);
  useNotesScrollMemory({
    enabled: Boolean(document) && editorMode !== "wysiwyg",
    hostRef,
    path: document?.path,
    surface: "source",
  });
  useNotesScrollMemory({
    enabled: Boolean(document) && editorMode === "split",
    hostRef: splitPreviewRef,
    path: document?.path,
    surface: "preview",
  });
  const lastAppliedSourceRef = useRef<string | null>(null);
  const lastEmittedSourceRef = useRef<string | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const bridgeRef = useRef<NotesEditorBridge | null>(null);
  const lastDocumentPathRef = useRef<string | null>(null);
  const editableDocumentRef =
    useRef<ReturnType<typeof parseEditableNoteSource> | null>(null);
  const documentsRef = useRef(documents);
  const onActiveLineChangeRef = useRef(onActiveLineChange);
  const onBridgeReadyRef = useRef(onBridgeReady);
  const onDocumentChangeRef = useRef(onDocumentChange);
  const onOpenWikiLinkRef = useRef(onOpenWikiLink);
  const onSelectionStateChangeRef = useRef(onSelectionStateChange);
  const [contextMenuTarget, setContextMenuTarget] =
    useState<EditorContextMenuTarget | null>(null);
  const [findQuery, setFindQuery] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [isLintOpen, setIsLintOpen] = useState(false);
  const [sourceTitleDraft, setSourceTitleDraft] = useState("");
  const [splitPreview, setSplitPreview] = useState({
    path: document?.path ?? null,
    source: document?.rawSource ?? "",
  });
  const splitPreviewSource =
    splitPreview.path === (document?.path ?? null)
      ? splitPreview.source
      : (document?.rawSource ?? "");
  const [editableCompartment] = useState(() => new Compartment());
  const viewPreferencesRef = useRef(viewPreferences);
  const findQueryRef = useRef("");
  const replaceTextRef = useRef("");
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const sourceTitleDraftRef = useRef("");
  const mediaReloadKey = useSyncExternalStore(
    subscribeNotesMediaReloadKey,
    getNotesMediaReloadKey,
    () => 0,
  );

  useEffect(() => {
    viewPreferencesRef.current = viewPreferences;
  }, [viewPreferences]);

  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);

  const editableDocument = useMemo(
    () =>
      document ? parseDocumentEditableSource(document) : null,
    [document],
  );
  const lintIssues = useMemo(
    () =>
      format.id === "markdown" ? lintMarkdown(document?.rawSource ?? "") : [],
    [document?.rawSource, format.id],
  );

  useEffect(() => {
    editableDocumentRef.current = editableDocument;
    const nextTitle = editableDocument?.title ?? "";
    sourceTitleDraftRef.current = nextTitle;
    setSourceTitleDraft(nextTitle);
  }, [editableDocument]);

  useEffect(() => {
    setSplitPreview({
      path: document?.path ?? null,
      source: document?.rawSource ?? "",
    });
  }, [document?.path, document?.rawSource]);
  useEffect(() => {
    setIsLintOpen(false);
  }, [document?.path]);

  useEffect(() => {
    onActiveLineChangeRef.current = onActiveLineChange;
  }, [onActiveLineChange]);

  useEffect(() => {
    onBridgeReadyRef.current = onBridgeReady;

    if (bridgeRef.current) {
      onBridgeReady?.(bridgeRef.current);
    }
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

  // Close any open context menu when switching to a different note so stale
  // document position data from the previous note doesn't persist.
  useEffect(() => {
    setContextMenuTarget(null);
  }, [document?.path]);

  useEffect(() => {
    const view = viewRef.current;

    if (!view || editorMode === "wysiwyg") {
      return;
    }

    setNotesEditorSearchQuery(view, findQuery);
  }, [editorMode, findQuery]);

  useEffect(() => {
    if (!isFindOpen || editorMode === "wysiwyg") {
      return;
    }

    findInputRef.current?.focus();
    findInputRef.current?.select();
  }, [editorMode, isFindOpen]);

  const resolveWechatImageSource = useCallback(
    (source: string) => {
      const resolved = resolveMarkdownImageSource(
        source,
        document?.path ?? null,
        getNotesMediaReloadKey(),
      );

      if (
        resolved?.startsWith("shadowing-media://vault/") &&
        !window.shadowingDesktop?.vault
      ) {
        return null;
      }

      return resolved;
    },
    [document?.path],
  );

  useEffect(() => {
    refreshNotesMixedRendering(viewRef.current);
  }, [mediaReloadKey]);

  useEffect(() => {
    if (editorMode === "wysiwyg") {
      return;
    }

    if (!hostRef.current || !document || viewRef.current) {
      return;
    }

    const initialEditableDocument = parseDocumentEditableSource(document);
    editableDocumentRef.current = initialEditableDocument;
    sourceTitleDraftRef.current = initialEditableDocument.title;
    setSourceTitleDraft(initialEditableDocument.title);

    const view = new EditorView({
      parent: hostRef.current,
      state: createNotesEditorState(
        initialEditableDocument.bodySource,
        (nextBodySource) => {
          const currentEditableDocument = editableDocumentRef.current;
          const nextRawSource =
            currentEditableDocument &&
            getFormatDescriptor(currentEditableDocument.path).id === "markdown"
              ? composeEditableNoteSource(currentEditableDocument, {
                  bodySource: nextBodySource,
                  title:
                    sourceTitleDraftRef.current.trim() ||
                    currentEditableDocument.title,
                })
              : nextBodySource;

          lastAppliedSourceRef.current = nextRawSource;
          lastEmittedSourceRef.current = nextBodySource;
          setSplitPreview({
            path: currentEditableDocument?.path ?? document.path,
            source: nextRawSource,
          });
          onDocumentChangeRef.current(nextRawSource);
        },
        {
          getDocuments: () => documentsRef.current,
          onOpenWikiLink:
            format.id === "markdown"
              ? (target) => onOpenWikiLinkRef.current?.(target)
              : undefined,
          onSelectionChange: (line) => onActiveLineChangeRef.current?.(line),
          onSelectionStateChange: (selection) =>
            onSelectionStateChangeRef.current?.(selection),
          documentPath: document.path,
          lineSeparator: document.rawSource.includes("\r\n") ? "\r\n" : "\n",
          editableCompartment,
          readOnly: viewPreferencesRef.current.readOnly,
          resolveImageUrl: resolveWechatImageSource,
          saveAttachment:
            format.id === "markdown" && window.shadowingDesktop?.vault?.saveFile
            ? async (path, content) =>
                (window.shadowingDesktop?.vault?.saveFile as unknown as (
                  relativePath: string,
                  binaryContent: Uint8Array,
                ) => Promise<void>)(path, content)
            : undefined,
        },
      ),
    });

    (hostRef.current as NotesEditorHostElement).__notesEditorView = view;
    viewRef.current = view;
    const editorBridge = createNotesEditorBridge(view);
    setNotesEditorSearchQuery(view, findQueryRef.current);
    bridgeRef.current = editorBridge;
    lastAppliedSourceRef.current = document.rawSource;
    lastDocumentPathRef.current = document.path;
    onActiveLineChangeRef.current?.(0);
    onBridgeReadyRef.current?.(bridgeRef.current);
  }, [
    document,
    editableCompartment,
    editorMode,
    format.id,
    onActiveLineChange,
    resolveWechatImageSource,
  ]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: editableCompartment.reconfigure([
        EditorState.readOnly.of(viewPreferences.readOnly),
        EditorView.editable.of(!viewPreferences.readOnly),
      ]),
    });
  }, [editableCompartment, viewPreferences.readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !viewPreferences.typewriterMode) return;
    view.dispatch({
      effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: "center" }),
    });
  }, [document?.path, editorMode, viewPreferences.typewriterMode]);

  const handleRichBridgeReady = useCallback(
    (bridge: NotesEditorBridge | null) => {
      bridgeRef.current = bridge;
      onBridgeReadyRef.current?.(bridge);
    },
    [],
  );

  const handleFindQueryChange = useCallback((value: string) => {
    findQueryRef.current = value;
    setFindQuery(value);
  }, []);

  const handleReplaceTextChange = useCallback((value: string) => {
    replaceTextRef.current = value;
    setReplaceText(value);
  }, []);

  const focusFindInput = useCallback(() => {
    findInputRef.current?.focus();
    findInputRef.current?.select();
  }, []);

  const handleSourceEditorKeyDownCapture = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (editorMode === "wysiwyg" || !viewRef.current) {
        return;
      }

      const isMod = event.metaKey || event.ctrlKey;

      if (isMod && event.key.toLowerCase() === "f") {
        event.preventDefault();
        event.stopPropagation();
        setIsFindOpen(true);
        focusFindInput();
        return;
      }

      if (event.key === "Escape" && isFindOpen) {
        event.preventDefault();
        event.stopPropagation();
        setIsFindOpen(false);
        return;
      }

      if (event.key === "F3" || (isMod && event.key.toLowerCase() === "g")) {
        event.preventDefault();
        event.stopPropagation();

        if (event.shiftKey) {
          findPreviousNotesEditorSearchMatch(viewRef.current);
          return;
        }

        findNextNotesEditorSearchMatch(viewRef.current);
      }
    },
    [editorMode, focusFindInput, isFindOpen],
  );

  const handleSourceEditorMouseDownCapture = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const view = viewRef.current;

      if (
        editorMode === "wysiwyg" ||
        !view ||
        viewPreferencesRef.current.readOnly ||
        !isNewNotePlaceholderSource(document)
      ) {
        return;
      }

      if (view.state.sliceDoc().trim() !== NEW_NOTE_BODY_PLACEHOLDER) {
        return;
      }

      event.preventDefault();
      view.dispatch({
        changes: {
          from: 0,
          insert: "",
          to: view.state.doc.length,
        },
        selection: EditorSelection.cursor(0),
        userEvent: "delete.selection",
      });
      view.focus();
    },
    [document, editorMode],
  );

  const handleSourceContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const view = viewRef.current;

      if (
        editorMode === "wysiwyg" ||
        !view ||
        viewPreferencesRef.current.readOnly ||
        format.id !== "markdown"
      ) {
        return;
      }

      const selection = view.state.selection.main;

      if (selection.empty) {
        return;
      }

      const text = view.state.sliceDoc(selection.from, selection.to);

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
    [editorMode, format.id],
  );

  const handleAddWikiLink = useCallback(
    (target: EditorContextMenuTarget) => {
      const view = viewRef.current;

      if (!view || viewPreferencesRef.current.readOnly) {
        return;
      }

      const insert = `[[${target.text}]]`;

      view.dispatch({
        changes: { from: target.from, insert, to: target.to },
        selection: EditorSelection.cursor(target.from + insert.length),
      });
      view.focus();

      // Materialise the target note when missing, so the new link is "live"
      // (resolves and turns the rendered link from missing → existing).
      onEnsureWikiLinkNote?.(target.text, document?.path);
    },
    [document?.path, onEnsureWikiLinkNote],
  );

  const handleSourceTitleChange = useCallback(
    (nextTitle: string) => {
      if (viewPreferencesRef.current.readOnly) {
        return;
      }
      sourceTitleDraftRef.current = nextTitle;
      setSourceTitleDraft(nextTitle);

      const currentEditableDocument = editableDocumentRef.current;

      if (!currentEditableDocument) {
        return;
      }

      const bodySource =
        viewRef.current?.state.sliceDoc() ?? currentEditableDocument.bodySource;
      const nextRawSource = composeEditableNoteSource(currentEditableDocument, {
        bodySource,
        title: nextTitle,
      });

      lastAppliedSourceRef.current = nextRawSource;
      lastEmittedSourceRef.current = bodySource;
      setSplitPreview({
        path: currentEditableDocument.path,
        source: nextRawSource,
      });
      onDocumentChangeRef.current(nextRawSource);
    },
    [],
  );

  const handleCloseContextMenu = useCallback(() => {
    setContextMenuTarget(null);
  }, []);

  const handleFindNext = useCallback(() => {
    if (!viewRef.current) {
      return;
    }

    findNextNotesEditorSearchMatch(viewRef.current);
  }, []);

  const handleFindPrevious = useCallback(() => {
    if (!viewRef.current) {
      return;
    }

    findPreviousNotesEditorSearchMatch(viewRef.current);
  }, []);

  const handleReplaceNext = useCallback(() => {
    if (!viewRef.current || viewPreferencesRef.current.readOnly) {
      return;
    }

    replaceNextNotesEditorSearchMatch(viewRef.current, replaceTextRef.current);
  }, []);

  const handleReplaceAll = useCallback(() => {
    if (!viewRef.current || viewPreferencesRef.current.readOnly) {
      return;
    }

    replaceAllNotesEditorSearchMatches(viewRef.current, replaceTextRef.current);
  }, []);

  useEffect(() => {
    if (editorMode === "wysiwyg") {
      return;
    }

    const view = viewRef.current;

    if (!view || !document) {
      return;
    }

    const nextEditableDocument = parseDocumentEditableSource(document);
    editableDocumentRef.current = nextEditableDocument;
    sourceTitleDraftRef.current = nextEditableDocument.title;
    setSourceTitleDraft(nextEditableDocument.title);

    const currentSource = view.state.sliceDoc();
    const nextBodySource = nextEditableDocument.bodySource;
    const hasNewExternalSource =
      lastAppliedSourceRef.current !== document.rawSource;
    const isSameDocument = lastDocumentPathRef.current === document.path;

    if (isSameDocument && !hasNewExternalSource) {
      return;
    }

    if (isSameDocument && currentSource === nextBodySource) {
      lastAppliedSourceRef.current = document.rawSource;
      lastEmittedSourceRef.current = null;
      return;
    }

    if (
      isSameDocument &&
      lastEmittedSourceRef.current === currentSource
    ) {
      return;
    }

    if (!isSameDocument) {
      lastEmittedSourceRef.current = null;
    }

    view.dispatch({
      annotations: notesEditorSyncAnnotation.of(true),
      changes: {
        from: 0,
        insert: nextBodySource,
        to: view.state.doc.length,
      },
      selection: isSameDocument
        ? clampSelectionToDocument(
            view.state.selection,
            nextBodySource.length,
          )
        : EditorSelection.create([EditorSelection.cursor(0)]),
      // When switching to a different note, scroll back to the top so the
      // viewport doesn't remain at the scroll position of the previous note.
      scrollIntoView: !isSameDocument,
    });

    lastAppliedSourceRef.current = document.rawSource;
    lastDocumentPathRef.current = document.path;
    lastEmittedSourceRef.current = null;
  }, [document, editorMode]);

  useEffect(() => {
    if (editorMode !== "wysiwyg") {
      return;
    }

    if (!viewRef.current) {
      return;
    }

    const host = hostRef.current as NotesEditorHostElement | null;

    onBridgeReadyRef.current?.(null);
    bridgeRef.current = null;
    lastAppliedSourceRef.current = null;
    lastEmittedSourceRef.current = null;
    lastDocumentPathRef.current = null;
    onSelectionStateChangeRef.current?.(null);
    if (host) {
      host.__notesEditorView = undefined;
    }
    viewRef.current.destroy();
    viewRef.current = null;
  }, [editorMode]);

  useEffect(() => {
    if (document || !viewRef.current) {
      return;
    }

    const host = hostRef.current as NotesEditorHostElement | null;

    onBridgeReadyRef.current?.(null);
    bridgeRef.current = null;
    lastAppliedSourceRef.current = null;
    lastEmittedSourceRef.current = null;
    lastDocumentPathRef.current = null;
    onSelectionStateChangeRef.current?.(null);
    if (host) {
      host.__notesEditorView = undefined;
    }
    viewRef.current.destroy();
    viewRef.current = null;
  }, [document, editorMode]);

  useEffect(() => {
    const host = hostRef.current as NotesEditorHostElement | null;

    return () => {
      onBridgeReadyRef.current?.(null);
      bridgeRef.current = null;
      lastAppliedSourceRef.current = null;
      lastEmittedSourceRef.current = null;
      lastDocumentPathRef.current = null;
      onSelectionStateChangeRef.current?.(null);
      if (host) {
        host.__notesEditorView = undefined;
      }
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, []);

  if (!document) {
    return (
      <section className="notes-v2__editor-pane">
        <p className="notes-v2__empty-copy">{NOTES_UI_COPY.emptyEditor}</p>
      </section>
    );
  }

  return (
    <section
      className="notes-v2__editor-pane"
      data-mode={editorMode}
      data-focus-mode={viewPreferences.focusMode ? "true" : "false"}
      data-read-only={viewPreferences.readOnly ? "true" : "false"}
      data-typewriter-mode={viewPreferences.typewriterMode ? "true" : "false"}
    >
      <div className="notes-v2__editor-heading notes-v2__document-meta">
        <div className="notes-v2__editor-heading-stack">
          <p className="notes-v2__document-path">{document.path}</p>
          {editorMode !== "wysiwyg" && !isStructured ? (
            <input
              aria-label="Note title"
              className="notes-v2__virtual-title-input"
              disabled={viewPreferences.readOnly}
              onChange={(event) => handleSourceTitleChange(event.target.value)}
              placeholder=""
              type="text"
              value={sourceTitleDraft}
            />
          ) : null}
        </div>
        {format.id === "markdown" ? (
          <button
            aria-expanded={isLintOpen}
            aria-label={`Markdown lint: ${lintIssues.length} issues`}
            className="notes-v2__lint-summary"
            data-has-errors={lintIssues.some(
              (issue) => issue.severity === "error",
            )}
            onClick={() => setIsLintOpen((current) => !current)}
            title={lintIssues
              .map((issue) => `L${issue.line}: ${issue.message}`)
              .join("\n")}
            type="button"
          >
            Lint {lintIssues.length}
          </button>
        ) : null}
      </div>
      {isLintOpen && format.id === "markdown" ? (
        <section
          aria-label="Markdown lint diagnostics"
          className="notes-v2__lint-diagnostics"
          role="region"
        >
          {lintIssues.length > 0 ? (
            <ul>
              {lintIssues.map((issue, index) => (
                <li key={`${issue.line}-${issue.message}-${index}`}>
                  <button
                    data-severity={issue.severity}
                    onClick={() => {
                      bridgeRef.current?.revealLine(Math.max(issue.line - 1, 0));
                      setIsLintOpen(false);
                    }}
                    type="button"
                  >
                    {`L${issue.line}: ${issue.message}`}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="notes-v2__empty-copy">Markdown lint 已通过。</p>
          )}
        </section>
      ) : null}
      {editorMode !== "wysiwyg" && (isFindOpen || findQuery || replaceText) ? (
        <div
          className="notes-v2__find-replace"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setIsFindOpen(false);
              viewRef.current?.focus();
            }
          }}
        >
          <label className="notes-v2__find-replace-field">
            <span>查找</span>
            <input
              aria-label="查找"
              onChange={(event) => handleFindQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (event.shiftKey) {
                    handleFindPrevious();
                  } else {
                    handleFindNext();
                  }
                }
              }}
              placeholder="输入要查找的文本"
              ref={findInputRef}
              type="search"
              value={findQuery}
            />
          </label>
          {!viewPreferences.readOnly ? (
            <label className="notes-v2__find-replace-field">
              <span>替换</span>
              <input
                aria-label="替换"
                onChange={(event) => handleReplaceTextChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleReplaceNext();
                  }
                }}
                placeholder="输入替换文本"
                type="text"
                value={replaceText}
              />
            </label>
          ) : null}
          <div className="notes-v2__find-replace-actions">
            <button onClick={handleFindPrevious} type="button">
              上一个
            </button>
            <button onClick={handleFindNext} type="button">
              下一个
            </button>
            {!viewPreferences.readOnly ? (
              <>
                <button onClick={handleReplaceNext} type="button">
                  替换当前
                </button>
                <button onClick={handleReplaceAll} type="button">
                  全部替换
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
      {editorMode === "wysiwyg" ? (
        <NotesRichEditorPane
          document={document}
          documents={documents}
          onActiveLineChange={onActiveLineChange}
          onBridgeReady={handleRichBridgeReady}
          onDocumentChange={onDocumentChange}
          onEnsureWikiLinkNote={onEnsureWikiLinkNote}
          onOpenWikiLink={onOpenWikiLink}
          onSelectionStateChange={onSelectionStateChange}
          focusMode={viewPreferences.focusMode}
          readOnly={viewPreferences.readOnly}
          typewriterMode={viewPreferences.typewriterMode}
        />
      ) : editorMode === "split" ? (
        <div className="notes-v2__markdown-split" data-testid="notes-markdown-split">
          <div
            className="notes-v2__editor-surface notes-v2__markdown-split-source"
            onContextMenu={handleSourceContextMenu}
            onKeyDownCapture={handleSourceEditorKeyDownCapture}
            onMouseDownCapture={handleSourceEditorMouseDownCapture}
          >
            <div
              className="notes-v2__editor-host"
              data-testid="notes-codemirror-host"
              ref={hostRef}
            />
          </div>
          <div
            className="notes-v2__markdown-split-preview"
            ref={splitPreviewRef}
          >
            {isStructured ? (
              <StructuredDataPreview
                format={format.id as StructuredDataFormat}
                path={document.path}
                source={document.rawSource}
              />
            ) : (
              <NotesWechatPreview
                markdown={splitPreviewSource}
                notePath={document.path}
                resolveImageSource={resolveWechatImageSource}
              />
            )}
          </div>
        </div>
      ) : (
        <div
          className="notes-v2__editor-surface"
          onContextMenu={handleSourceContextMenu}
          onKeyDownCapture={handleSourceEditorKeyDownCapture}
          onMouseDownCapture={handleSourceEditorMouseDownCapture}
        >
          <div
            className="notes-v2__editor-host"
            data-testid="notes-codemirror-host"
            ref={hostRef}
          />
        </div>
      )}
      {contextMenuTarget ? (
        <NotesEditorContextMenu
          onAddWikiLink={handleAddWikiLink}
          onClose={handleCloseContextMenu}
          target={contextMenuTarget}
        />
      ) : null}
    </section>
  );
}
