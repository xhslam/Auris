"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { NotesBreadcrumbBar } from "@/components/notes-v2/notes-breadcrumb-bar";
import {
  NotesCommandPalette,
  type NotesCommandPaletteItem,
} from "@/components/notes-v2/notes-command-palette";
import { NotesWorkbenchCenter } from "@/components/notes-v2/notes-workbench-center";
import { NotesEmbeddedBrowser } from "@/components/notes-v2/notes-embedded-browser";
import { NotesWriteConflictDialog } from "@/components/notes-v2/notes-write-conflict-dialog";
import { NotesMcpEditReviewDialog } from "@/components/notes-v2/notes-mcp-edit-review-dialog";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import { useNotesCommandInfrastructure } from "@/components/notes-v2/use-notes-command-infrastructure";
import { NotesWorkbenchBottomLeft } from "@/components/notes-v2/notes-workbench-bottom-left";
import { NotesWorkbenchBottomRight } from "@/components/notes-v2/notes-workbench-bottom-right";
import { getNotesDocumentSaveState } from "@/features/notes/workbench/notes-document-save-state";
import { applyLearningDependencyReviewToDocument } from "@/features/learning-memory/learning-dependency-note-update";
import { readLearningDependencySnapshot } from "@/features/learning-memory/learning-dependency-sync";
import { useAppTheme } from "@/features/appearance/use-app-theme";
import {
  DEFAULT_NOTES_TYPOGRAPHY,
  NOTES_TYPOGRAPHY_EVENT,
  loadNotesTypography,
  notesTypographyCssVars,
  type NotesTypographySettings,
} from "@/features/notes/formatting/notes-typography";
import {
  DEFAULT_NOTES_MARKDOWN_LAYOUT,
  NOTES_MARKDOWN_LAYOUT_EVENT,
  loadNotesMarkdownLayout,
  notesMarkdownLayoutCssVars,
  type NotesMarkdownLayout,
} from "@/features/notes/formatting/notes-markdown-layout";
import { NotesTerminalPanel } from "@/components/notes-v2/notes-terminal-panel";
import {
  clampBrowserSidePaneWidth,
  clampRightSidebarWidth,
  getDefaultRightSidebarWidth,
  NOTES_BROWSER_SIDEPANE_DEFAULT_WIDTH,
  NOTES_CENTER_FALLBACK_WIDTH,
  NOTES_SPLITTER_KEYBOARD_STEP,
} from "@/components/notes-v2/notes-layout-resize";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import { getNoteOpenStrategy } from "@/features/notes/documents/note-open-strategy";
import type {
  NotesEditorBridge,
  NotesEditorMode,
  NotesEditorSelectionState,
} from "@/features/notes/editor/editor-types";
import {
  DEFAULT_NOTES_VIEW_PREFERENCES,
  loadNotesViewPreferences,
  saveNotesViewPreferences,
  type NotesViewPreferences,
} from "@/features/notes/editor/notes-view-preferences";
import type { LearningSnippet } from "@/features/notes/integrations/learning-snippets";
import type { NotesDirectoryInfo } from "@/features/notes/note-types";
import type { VaultEntry } from "@/features/notes/vault/vault-types";
import type { VaultWriteConflict } from "@/features/notes/vault/vault-write-conflict";
import type { NotesMcpPendingEdit } from "@/features/notes/workbench/notes-mcp-edit-review";
import {
  listNotesHistoryVersions,
  type NotesHistoryVersion,
} from "@/features/notes/persistence/notes-recovery-store";
import type {
  NotesLeftSidebarMode,
  NotesRightSidebarMode,
} from "@/features/notes/workspace/workspace-types";
import type {
  DesktopCommandRecord,
  DesktopTerminalBridge,
} from "@/platform/desktop/desktop-bridge";
import { NiaPanel, type NiaContextRequest } from "@/components/nia/nia-panel";
import type { NiaApplyProposal, NiaContext } from "@/features/nia/nia-context";
import { useNotesLocale } from "@/features/notes/i18n/notes-locale";
import { NotesNiaPicker } from "@/components/notes-v2/notes-nia-picker";
import { useNiaPickerStore } from "@/features/nia/nia-picker-store";

export type NotesWorkbenchProps = {
  activePath: string | null;
  backlinks?: NoteDocument[];
  commandPaletteItems?: NotesCommandPaletteItem[];
  desktopCommands?: DesktopCommandRecord[];
  desktopTerminal?: DesktopTerminalBridge | null;
  directoryInfo?: NotesDirectoryInfo;
  dirtyPaths?: Record<string, boolean>;
  documents: NoteDocument[];
  graphDocuments?: NoteDocument[];
  entries: VaultEntry[];
  errorMessage?: string | null;
  editorMode?: NotesEditorMode;
  indexRebuildMessage?: string | null;
  isCommandPaletteOpen?: boolean;
  canGoBack?: boolean;
  canGoForward?: boolean;
  isDesktopBridgeAvailable?: boolean;
  isLoading?: boolean;
  isRebuildingIndex?: boolean;
  lastRunCommandTitle?: string | null;
  leftSidebarCollapsed?: boolean;
  leftSidebarMode?: NotesLeftSidebarMode;
  learningQuery?: string;
  learningSnippets?: LearningSnippet[];
  onClosePath?: (path: string) => void;
  onCopyPath?: (path: string) => void;
  onCreateNote?: () => void;
  onCreateNoteInPath?: (folderPath: string) => void;
  onCreateFolderInPath?: (parentPath: string) => void;
  onMovePath?: (sourcePath: string, targetFolderPath: string) => void;
  onDeleteActiveNote?: () => void;
  onDeletePath?: (path: string, kind: "directory" | "file") => void;
  onRenamePath?: (path: string, kind: "directory" | "file") => void;
  onRevealPath?: (path: string) => void;
  onDocumentChange:
    | ((nextSource: string) => void)
    | ((path: string, nextSource: string) => void);
  onEditorActiveLineChange?: (line: number) => void;
  onEditorBridgeReady?: (bridge: NotesEditorBridge | null) => void;
  onEditorModeChange?: (mode: NotesEditorMode) => void;
  onInsertSnippet?: (snippet: string) => void;
  onRequestNiaContext?: (kind: NiaContextRequest) => NiaContext | null;
  onApplyNiaProposal?: (
    proposal: NiaApplyProposal,
  ) => { ok: boolean; reason?: string } | void;
  onLeftSidebarCollapsedChange?: (collapsed: boolean) => void;
  onLeftSidebarModeChange?: (mode: NotesLeftSidebarMode) => void;
  onLearningQueryChange?: (value: string) => void;
  onEnsureWikiLinkNote?: (target: string, sourcePath?: string) => void;
  onEnsureGraphDocuments?: () => Promise<void>;
  onOpenCommandPaletteChange?: (open: boolean) => void;
  onOpenPath: (path: string) => void;
  onOpenWikiLink?: (target: string) => void;
  onPickDirectory?: () => void;
  onRebuildIndex?: () => void;
  onRefresh?: () => void;
  onRefreshDesktopCommands?: () => void;
  onRenameActiveNote?: () => void;
  onRightSidebarCollapsedChange?: (collapsed: boolean) => void;
  onRightSidebarModeChange?: (mode: NotesRightSidebarMode) => void;
  onRunDesktopCommand?: (commandId: string) => void;
  onSaveActiveDocument?: () => void;
  onSaveAllDocuments?: () => void;
  onSearchQueryChange?: (value: string) => void;
  onUpdateTags?: (tags: string[]) => void;
  onCopyWriteConflictDiff?: () => void;
  onExportActiveDocumentHtml?: () => void;
  onExportActiveDocumentPdf?: () => void;
  onExportVault?: () => void;
  onFormatCjk?: () => void;
  onKeepWriteConflict?: () => void;
  onAcceptPendingMcpEdit?: () => void;
  onGoBack?: () => void;
  onGoForward?: () => void;
  onRejectPendingMcpEdit?: () => void;
  onReloadWriteConflict?: () => void;
  onRestoreLastDeleted?: () => void;
  onReturnToFolder?: () => void;
  openTabs: string[];
  returnFolderName?: string | null;
  recentFiles?: string[];
  rightSidebarCollapsed?: boolean;
  rightSidebarMode?: NotesRightSidebarMode;
  searchQuery?: string;
  searchResults?: NoteDocument[];
  pendingMcpEdit?: NotesMcpPendingEdit | null;
  writeConflict?: VaultWriteConflict | null;
};

function getActiveDocument(
  documents: NoteDocument[],
  activePath: string | null,
) {
  return documents.find((document) => document.path === activePath) ?? null;
}

function getRecentDocuments(documents: NoteDocument[], recentFiles: string[]) {
  return recentFiles
    .map((path) => documents.find((document) => document.path === path) ?? null)
    .filter((document): document is NoteDocument => document !== null);
}

export function NotesWorkbench({
  activePath,
  backlinks = [],
  commandPaletteItems = [],
  desktopCommands = [],
  desktopTerminal = null,
  directoryInfo,
  dirtyPaths = {},
  documents,
  graphDocuments = documents,
  editorMode = "wysiwyg",
  entries,
  errorMessage = null,
  indexRebuildMessage = null,
  isCommandPaletteOpen = false,
  canGoBack = false,
  canGoForward = false,
  isDesktopBridgeAvailable = false,
  isLoading = false,
  isRebuildingIndex = false,
  lastRunCommandTitle = null,
  learningQuery = "",
  learningSnippets = [],
  onClosePath,
  onCopyPath,
  onCreateNote,
  onCreateNoteInPath,
  onCreateFolderInPath,
  onDeleteActiveNote,
  onDeletePath,
  onMovePath,
  onRenamePath,
  onRevealPath,
  onDocumentChange,
  onEditorActiveLineChange,
  onEditorBridgeReady,
  onEditorModeChange,
  onInsertSnippet,
  onRequestNiaContext,
  onApplyNiaProposal,
  onLearningQueryChange,
  onEnsureWikiLinkNote,
  onEnsureGraphDocuments,
  onOpenCommandPaletteChange,
  onOpenPath,
  onOpenWikiLink,
  onPickDirectory,
  onRebuildIndex,
  onRefresh,
  onRefreshDesktopCommands,
  onRenameActiveNote,
  onRunDesktopCommand,
  onSaveActiveDocument,
  onSaveAllDocuments,
  onSearchQueryChange,
  onUpdateTags,
  onCopyWriteConflictDiff,
  onExportActiveDocumentHtml,
  onExportActiveDocumentPdf,
  onExportVault,
  onFormatCjk,
  onKeepWriteConflict,
  onAcceptPendingMcpEdit,
  onGoBack,
  onGoForward,
  onRejectPendingMcpEdit,
  onReloadWriteConflict,
  onRestoreLastDeleted,
  onReturnToFolder,
  openTabs,
  returnFolderName = null,
  recentFiles = [],
  rightSidebarCollapsed = false,
  rightSidebarMode = "properties",
  searchQuery = "",
  searchResults = [],
  pendingMcpEdit = null,
  writeConflict = null,
}: NotesWorkbenchProps) {
  const notesLocale = useNotesLocale();
  const shellRef = useRef<HTMLElement | null>(null);
  const editorBridgeRef = useRef<NotesEditorBridge | null>(null);
  const terminalDragStateRef = useRef<{
    startWidth: number;
    startX: number;
  } | null>(null);
  const browserPaneDragStateRef = useRef<{
    startWidth: number;
    startX: number;
  } | null>(null);
  const [selectionState, setSelectionState] =
    useState<NotesEditorSelectionState | null>(null);
  const [viewPreferences, setViewPreferences] = useState<NotesViewPreferences>(
    DEFAULT_NOTES_VIEW_PREFERENCES,
  );
  useEffect(() => {
    setViewPreferences(loadNotesViewPreferences());
  }, []);
  const handleViewPreferencesChange = useCallback(
    (next: NotesViewPreferences) => {
      setViewPreferences(saveNotesViewPreferences(next));
    },
    [],
  );
  useEffect(() => {
    const onViewKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey)
        return;
      const key = event.key.toLowerCase();
      if (!["f", "r", "t"].includes(key)) return;
      event.preventDefault();
      handleViewPreferencesChange({
        ...viewPreferences,
        ...(key === "f"
          ? { focusMode: !viewPreferences.focusMode }
          : key === "r"
            ? { readOnly: !viewPreferences.readOnly }
            : { typewriterMode: !viewPreferences.typewriterMode }),
      });
    };
    window.addEventListener("keydown", onViewKeyDown);
    return () => window.removeEventListener("keydown", onViewKeyDown);
  }, [handleViewPreferencesChange, viewPreferences]);
  const [openLeftPopover, setOpenLeftPopover] = useState<"workspace" | null>(
    null,
  );
  const [isTerminalSplitOpen, setIsTerminalSplitOpen] = useState(false);
  const [isBrowserPaneOpen, setIsBrowserPaneOpen] = useState(false);
  const [isTerminalResizing, setIsTerminalResizing] = useState(false);
  const [isBrowserPaneResizing, setIsBrowserPaneResizing] = useState(false);
  // 打开选择器那一刻的内容快照。不在渲染时现取：用户打开选择器后光标可能移动
  // （点击列表就会移出编辑器），现取会让「改进选区」拿到一段空选区。
  const [niaPickerContent, setNiaPickerContent] = useState<{
    content: string;
    hasSelection: boolean;
  }>({ content: "", hasSelection: false });
  // 选择器合成好的提示词，交给 NiaPanel 的既有 session 发出。
  //
  // 为什么不让选择器自己持有一个 session：`useNiaSession` 认领事件的方式是
  // 「看到第一个 started 事件且自己有 start 在飞」，两个并存的 session 会认领
  // 同一个 runId，选择器的回复会同时流进面板的消息列表。started 事件不带任何
  // 能对上具体 start() 调用的关联标识，加判断绕不过去。所以全应用只有一个
  // session，选择器把提示词交给它。
  const [pendingNiaPrompt, setPendingNiaPrompt] = useState<string | null>(null);
  const [shellWidth, setShellWidth] = useState(NOTES_CENTER_FALLBACK_WIDTH);
  const [terminalWidth, setTerminalWidth] = useState(
    getDefaultRightSidebarWidth("terminal"),
  );
  const [browserPaneWidth, setBrowserPaneWidth] = useState(
    NOTES_BROWSER_SIDEPANE_DEFAULT_WIDTH,
  );
  // 主题由设置页的单一应用偏好提供；Notes 只在根节点消费该值。
  const readingTheme = useAppTheme();

  // 编辑器排版（字号/行高/块间距/字间距/宽度）：同样在「设置」里改，这里读取并应用。
  const [typography, setTypography] = useState<NotesTypographySettings>(
    DEFAULT_NOTES_TYPOGRAPHY,
  );
  useEffect(() => {
    setTypography(loadNotesTypography());

    const onTypographyEvent = (event: Event) => {
      const detail = (event as CustomEvent<NotesTypographySettings>).detail;
      if (detail) {
        setTypography(detail);
      }
    };
    const onStorage = () => setTypography(loadNotesTypography());

    window.addEventListener(NOTES_TYPOGRAPHY_EVENT, onTypographyEvent);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(NOTES_TYPOGRAPHY_EVENT, onTypographyEvent);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Markdown 渲染布局（块字号/标题对齐/图片边框）：同样在「设置」里改，这里读取并应用。
  const [markdownLayout, setMarkdownLayout] = useState<NotesMarkdownLayout>(
    DEFAULT_NOTES_MARKDOWN_LAYOUT,
  );
  useEffect(() => {
    setMarkdownLayout(loadNotesMarkdownLayout());

    const onLayoutEvent = (event: Event) => {
      const detail = (event as CustomEvent<NotesMarkdownLayout>).detail;
      if (detail) {
        setMarkdownLayout(detail);
      }
    };
    const onStorage = () => setMarkdownLayout(loadNotesMarkdownLayout());

    window.addEventListener(NOTES_MARKDOWN_LAYOUT_EVENT, onLayoutEvent);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(NOTES_MARKDOWN_LAYOUT_EVENT, onLayoutEvent);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  const activeDocument = getActiveDocument(documents, activePath);
  const openDocuments = openTabs
    .map((path) => documents.find((document) => document.path === path) ?? null)
    .filter((document): document is NoteDocument => document !== null);
  const recentDocuments = getRecentDocuments(documents, recentFiles);
  const activeOpenStrategy = activeDocument
    ? getNoteOpenStrategy(activeDocument.rawSource.length)
    : null;
  const activeDocumentSaveState = getNotesDocumentSaveState({
    activePath,
    dirtyPaths,
    writeConflictPath: writeConflict?.path ?? null,
  });
  const activeDocumentPath = activeDocument?.path ?? null;
  const activeLearningDependencyNeedsReview =
    readLearningDependencySnapshot(activeDocument?.frontmatter)?.status === "needs-review";
  const [historyVersions, setHistoryVersions] = useState<NotesHistoryVersion[]>(
    [],
  );
  useEffect(() => {
    let cancelled = false;
    if (!activeDocumentPath) {
      setHistoryVersions([]);
      return;
    }
    void listNotesHistoryVersions(
      activeDocumentPath,
      directoryInfo?.vaultPath ?? null,
    )
      .then((versions) => {
        if (!cancelled) setHistoryVersions(versions);
      })
      .catch(() => {
        if (!cancelled) setHistoryVersions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeDocumentPath, activeDocumentSaveState, directoryInfo?.vaultPath]);

  const handleResolveLearningDependencyReview = useCallback(() => {
    if (!activeDocument) {
      return;
    }

    const nextSource = applyLearningDependencyReviewToDocument(
      activeDocument,
      documents,
      {
        at: new Date().toISOString(),
        decision: "reviewed",
      },
    );
    if (nextSource === activeDocument.rawSource) {
      return;
    }

    if (onDocumentChange.length >= 2) {
      (onDocumentChange as (path: string, nextSource: string) => void)(
        activeDocument.path,
        nextSource,
      );
      return;
    }
    (onDocumentChange as (nextSource: string) => void)(nextSource);
  }, [activeDocument, documents, onDocumentChange]);

  const handleRestoreHistoryVersion = useCallback(
    (version: NotesHistoryVersion) => {
      if (!activeDocument || version.path !== activeDocument.path) {
        return;
      }
      if (onDocumentChange.length >= 2) {
        (onDocumentChange as (path: string, nextSource: string) => void)(
          activeDocument.path,
          version.rawSource,
        );
        return;
      }
      (onDocumentChange as (nextSource: string) => void)(version.rawSource);
    },
    [activeDocument, onDocumentChange],
  );
  // 打开选择器的那一刻就把内容定格。不在渲染期重新取：用户在选择器里打字时
  // 编辑器已经失焦，选区可能已经塌陷，再取一次会拿到空串——动作就套用到了空内容上。
  const handleOpenNiaPicker = useCallback(() => {
    const selectionContext = onRequestNiaContext?.("selection") ?? null;
    const documentContext = selectionContext
      ? null
      : (onRequestNiaContext?.("document") ?? null);
    const resolved = selectionContext ?? documentContext;
    const text =
      resolved && "text" in resolved && typeof resolved.text === "string"
        ? resolved.text
        : "";

    // content 与 hasSelection 成对走 prop：它们是同一个快照的两半。默认范围由
    // 选择器从 hasSelection 推导，不再额外经由 store 传一次——那会把这一对拆成
    // 两条通道，然后在某次改动里悄悄发散。
    setNiaPickerContent({
      content: text,
      hasSelection: Boolean(selectionContext),
    });
    useNiaPickerStore.getState().openPicker();
  }, [onRequestNiaContext, setNiaPickerContent]);

  const commandInfrastructure = useNotesCommandInfrastructure({
    editorMode,
    hasActiveDocument: Boolean(activeDocument),
    onOpenBrowser: () => {
      setIsTerminalSplitOpen(false);
      setIsBrowserPaneOpen(true);
    },
    onOpenNiaPicker: handleOpenNiaPicker,
    onOpenPalette: () => onOpenCommandPaletteChange?.(true),
    onSave: onSaveActiveDocument,
    onSaveAll: onSaveAllDocuments,
    onSetEditorMode: onEditorModeChange,
    onToggleTerminal: () => {
      setIsBrowserPaneOpen(false);
      setIsTerminalSplitOpen((current) => !current);
    },
  });
  const resolvedCommandPaletteItems = useMemo(() => {
    const existingIds = new Set(commandPaletteItems.map((item) => item.id));
    return [
      ...commandPaletteItems,
      ...commandInfrastructure.commands
        .filter((command) => !existingIds.has(command.id))
        .map((command) => ({
          id: command.id,
          title: command.title,
          onSelect: () => {
            void commandInfrastructure.bus.execute(command.id, {
              activeSurface: "global",
              editorMode,
              hasActiveDocument: Boolean(activeDocument),
            });
          },
        })),
    ];
  }, [activeDocument, commandInfrastructure, commandPaletteItems, editorMode]);

  const resolvedTerminalWidth = useMemo(
    () => clampRightSidebarWidth(terminalWidth, shellWidth, "terminal"),
    [shellWidth, terminalWidth],
  );

  const resolvedBrowserPaneWidth = useMemo(
    () => clampBrowserSidePaneWidth(browserPaneWidth, shellWidth),
    [browserPaneWidth, shellWidth],
  );

  const browserLayoutVersion = [
    shellWidth,
    isBrowserPaneOpen ? resolvedBrowserPaneWidth : 0,
    isBrowserPaneOpen ? "browser" : isTerminalSplitOpen ? resolvedTerminalWidth : 0,
    rightSidebarCollapsed ? "collapsed" : rightSidebarMode,
  ].join(":");

  const updateTerminalWidth = useCallback(
    (nextWidth: number) => {
      setTerminalWidth(
        clampRightSidebarWidth(nextWidth, shellWidth, "terminal"),
      );
    },
    [setTerminalWidth, shellWidth],
  );

  const updateBrowserPaneWidth = useCallback(
    (nextWidth: number) => {
      setBrowserPaneWidth(clampBrowserSidePaneWidth(nextWidth, shellWidth));
    },
    [setBrowserPaneWidth, shellWidth],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) {
        return;
      }

      if (event.key === "ArrowLeft" && canGoBack) {
        event.preventDefault();
        onGoBack?.();
      }

      if (event.key === "ArrowRight" && canGoForward) {
        event.preventDefault();
        onGoForward?.();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canGoBack, canGoForward, onGoBack, onGoForward]);

  useEffect(() => {
    const element = shellRef.current;

    if (!element || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      const nextWidth =
        entries[0]?.contentRect.width ?? element.clientWidth ?? shellWidth;

      if (nextWidth > 0) {
        setShellWidth(nextWidth);
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [shellWidth]);

  useEffect(() => {
    if (!isTerminalSplitOpen) {
      return;
    }

    if (resolvedTerminalWidth !== terminalWidth) {
      setTerminalWidth(resolvedTerminalWidth);
    }
  }, [isTerminalSplitOpen, resolvedTerminalWidth, terminalWidth]);

  useEffect(() => {
    if (!isBrowserPaneOpen) {
      return;
    }

    if (resolvedBrowserPaneWidth !== browserPaneWidth) {
      setBrowserPaneWidth(resolvedBrowserPaneWidth);
    }
  }, [browserPaneWidth, isBrowserPaneOpen, resolvedBrowserPaneWidth]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const dragState = terminalDragStateRef.current;

      if (!dragState) {
        return;
      }

      updateTerminalWidth(
        dragState.startWidth + (dragState.startX - event.clientX),
      );
    };

    const handleMouseUp = () => {
      if (!terminalDragStateRef.current) {
        return;
      }

      terminalDragStateRef.current = null;
      setIsTerminalResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [updateTerminalWidth]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const dragState = browserPaneDragStateRef.current;

      if (!dragState) {
        return;
      }

      updateBrowserPaneWidth(
        dragState.startWidth + (dragState.startX - event.clientX),
      );
    };

    const handleMouseUp = () => {
      if (!browserPaneDragStateRef.current) {
        return;
      }

      browserPaneDragStateRef.current = null;
      setIsBrowserPaneResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [updateBrowserPaneWidth]);

  const handleBridgeReady = useCallback(
    (bridge: NotesEditorBridge | null) => {
      editorBridgeRef.current = bridge;
      onEditorBridgeReady?.(bridge);
      setSelectionState(bridge?.getSelection() ?? null);
    },
    [onEditorBridgeReady, setSelectionState],
  );

  const handleOpenSourcePeek = useCallback(() => {
    editorBridgeRef.current?.openSourcePeek?.();
  }, []);

  const handleTerminalResizeStart = useCallback(
    (clientX: number) => {
      terminalDragStateRef.current = {
        startWidth: resolvedTerminalWidth,
        startX: clientX,
      };
      setIsTerminalResizing(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [resolvedTerminalWidth, setIsTerminalResizing],
  );

  const handleTerminalSplitterKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        updateTerminalWidth(
          resolvedTerminalWidth + NOTES_SPLITTER_KEYBOARD_STEP,
        );
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        updateTerminalWidth(
          resolvedTerminalWidth - NOTES_SPLITTER_KEYBOARD_STEP,
        );
      }
    },
    [resolvedTerminalWidth, updateTerminalWidth],
  );

  const handleBrowserPaneResizeStart = useCallback(
    (clientX: number) => {
      browserPaneDragStateRef.current = {
        startWidth: resolvedBrowserPaneWidth,
        startX: clientX,
      };
      setIsBrowserPaneResizing(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [resolvedBrowserPaneWidth, setIsBrowserPaneResizing],
  );

  const handleBrowserPaneSplitterKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        updateBrowserPaneWidth(
          resolvedBrowserPaneWidth + NOTES_SPLITTER_KEYBOARD_STEP,
        );
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        updateBrowserPaneWidth(
          resolvedBrowserPaneWidth - NOTES_SPLITTER_KEYBOARD_STEP,
        );
      }
    },
    [resolvedBrowserPaneWidth, updateBrowserPaneWidth],
  );

  return (
    <>
      <section
        className="notes-v2 notes-v2--minimal"
        data-notes-theme={readingTheme}
        data-focus-mode={viewPreferences.focusMode ? "true" : "false"}
        data-read-only={viewPreferences.readOnly ? "true" : "false"}
        data-typewriter-mode={viewPreferences.typewriterMode ? "true" : "false"}
        lang={notesLocale}
        data-shortcut-conflicts={commandInfrastructure.conflicts.length}
        data-active-surface={isBrowserPaneOpen ? "note-browser" : "note"}
        data-browser-pane-open={isBrowserPaneOpen ? "true" : "false"}
        data-terminal-open={
          !isBrowserPaneOpen && isTerminalSplitOpen ? "true" : "false"
        }
        ref={shellRef}
        style={
          {
            "--notes-browser-pane-width": `${resolvedBrowserPaneWidth}px`,
            "--notes-terminal-width": `${resolvedTerminalWidth}px`,
            ...notesTypographyCssVars(typography),
            ...notesMarkdownLayoutCssVars(markdownLayout),
          } as CSSProperties
        }
      >
        <div className="notes-v2__minimal-workspace">
          <main className="notes-v2__minimal-canvas">
            <div className="notes-v2__editor-navigation">
              {onReturnToFolder ? (
                <button
                  aria-label={`返回 ${returnFolderName ?? "文件夹"}`}
                  className="notes-v2__return-to-folder"
                  onClick={onReturnToFolder}
                  type="button"
                >
                  <span aria-hidden="true">←</span>
                  <span>返回 {returnFolderName ?? "文件夹"}</span>
                </button>
              ) : null}
              <NotesBreadcrumbBar
                path={activeDocument?.path ?? null}
                vaultName={directoryInfo?.directoryName}
              />
            </div>
            <NotesWorkbenchCenter
              activeDocument={activeDocument}
              activePath={activePath}
              editorMode={editorMode}
              documents={documents}
              errorMessage={errorMessage}
              isLoading={isLoading}
              minimalChrome
              onClosePath={onClosePath}
              onDocumentChange={onDocumentChange}
              onEditorActiveLineChange={onEditorActiveLineChange}
              onEditorBridgeReady={handleBridgeReady}
              onEditorSelectionStateChange={setSelectionState}
              onEnsureWikiLinkNote={onEnsureWikiLinkNote}
              onOpenPath={onOpenPath}
              onOpenWikiLink={onOpenWikiLink}
              openDocuments={openDocuments}
              rightToolbarActions={null}
              viewPreferences={viewPreferences}
            />
          </main>
          {isBrowserPaneOpen ? (
            <>
              <div
                aria-label="调整浏览器宽度"
                aria-orientation="vertical"
                aria-valuenow={resolvedBrowserPaneWidth}
                className="notes-v2__minimal-browser-splitter"
                data-active={isBrowserPaneResizing ? "true" : "false"}
                onKeyDown={handleBrowserPaneSplitterKeyDown}
                onMouseDown={(event) => {
                  event.preventDefault();
                  handleBrowserPaneResizeStart(event.clientX);
                }}
                role="separator"
                tabIndex={0}
              />
              <aside
                aria-label="笔记侧边受管浏览器"
                className="notes-v2__minimal-browser-pane"
                role="region"
                style={{ width: `${resolvedBrowserPaneWidth}px` }}
              >
                <NotesEmbeddedBrowser
                  layoutVersion={browserLayoutVersion}
                  onClose={() => setIsBrowserPaneOpen(false)}
                  theme={readingTheme}
                />
              </aside>
            </>
          ) : null}
          {!isBrowserPaneOpen &&
          !rightSidebarCollapsed &&
          rightSidebarMode === "properties" ? (
            <aside
              aria-label={NOTES_UI_COPY.rightDock.properties.label}
              className="notes-v2__minimal-properties-pane"
              role="region"
            >
              <span>{NOTES_UI_COPY.rightDock.properties.label}</span>
            </aside>
          ) : null}

          {!isBrowserPaneOpen && isTerminalSplitOpen ? (
            <>
              <div
                aria-label="调整终端宽度"
                aria-orientation="vertical"
                aria-valuenow={resolvedTerminalWidth}
                className="notes-v2__minimal-terminal-splitter"
                data-active={isTerminalResizing ? "true" : "false"}
                onKeyDown={handleTerminalSplitterKeyDown}
                onMouseDown={(event) => {
                  event.preventDefault();
                  handleTerminalResizeStart(event.clientX);
                }}
                role="separator"
                tabIndex={0}
              />
              <aside
                className="notes-v2__minimal-terminal-pane"
                style={{ width: `${resolvedTerminalWidth}px` }}
              >
                <NotesTerminalPanel
                  commands={desktopCommands}
                  compactChrome
                  isDesktopBridgeAvailable={isDesktopBridgeAvailable}
                  lastRunCommandTitle={lastRunCommandTitle}
                  onRefreshCommands={onRefreshDesktopCommands}
                  onRunCommand={onRunDesktopCommand}
                  terminalBridge={desktopTerminal}
                  terminalCwd={directoryInfo?.vaultPath ?? null}
                />
              </aside>
            </>
          ) : null}
        </div>

        <NotesWorkbenchBottomLeft
          activeDocument={activeDocument}
          activePath={activePath}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          directoryInfo={directoryInfo}
          entries={entries}
          onCopyPath={onCopyPath}
          onCreateNote={onCreateNote}
          onCreateNoteInPath={onCreateNoteInPath}
          onCreateFolderInPath={onCreateFolderInPath}
          onDeletePath={onDeletePath}
          onGoBack={onGoBack}
          onGoForward={onGoForward}
          onRenamePath={onRenamePath}
          onRevealPath={onRevealPath}
          onMovePath={onMovePath}
          onOpenBrowser={() => {
            setOpenLeftPopover(null);
            setIsTerminalSplitOpen(false);
            setIsBrowserPaneOpen(true);
          }}
          onOpenPath={onOpenPath}
          onPickDirectory={onPickDirectory}
          openPopover={openLeftPopover}
          setOpenPopover={setOpenLeftPopover}
        />

        <NotesWorkbenchBottomRight
          activeDocument={activeDocument}
          backlinks={backlinks}
          documentSaveState={activeDocumentSaveState}
          documents={documents}
          graphDocuments={graphDocuments}
          editorMode={editorMode}
          indexRebuildMessage={indexRebuildMessage}
          isRebuildingIndex={isRebuildingIndex}
          isTerminalSplitOpen={isTerminalSplitOpen}
          historyVersions={historyVersions}
          learningDependencyNeedsReview={activeLearningDependencyNeedsReview}
          learningQuery={learningQuery}
          learningSnippets={learningSnippets}
          noteOpenStrategy={activeOpenStrategy}
          onDeleteActiveNote={onDeleteActiveNote}
          onEditorModeChange={onEditorModeChange}
          onExportActiveDocumentHtml={onExportActiveDocumentHtml}
          onExportActiveDocumentPdf={onExportActiveDocumentPdf}
          onExportVault={onExportVault}
          onFormatCjk={onFormatCjk}
          onInsertSnippet={onInsertSnippet}
          onResolveLearningDependencyReview={handleResolveLearningDependencyReview}
          onEnsureGraphDocuments={onEnsureGraphDocuments}
          onRestoreHistoryVersion={handleRestoreHistoryVersion}
          onLearningQueryChange={onLearningQueryChange}
          onOpenSourcePeek={handleOpenSourcePeek}
          onJumpToHeading={(line) => editorBridgeRef.current?.revealLine(line)}
          onOpenPath={onOpenPath}
          onRebuildIndex={onRebuildIndex}
          onRefresh={onRefresh}
          onRestoreLastDeleted={onRestoreLastDeleted}
          onRenameActiveNote={onRenameActiveNote}
          onSearchQueryChange={onSearchQueryChange}
          onUpdateTags={onUpdateTags}
          onTerminalSplitToggle={() => {
            setOpenLeftPopover(null);
            setIsBrowserPaneOpen(false);
            setIsTerminalSplitOpen((current) => !current);
          }}
          recentDocuments={recentDocuments}
          searchQuery={searchQuery}
          searchResults={searchResults}
          selectionState={selectionState}
          viewPreferences={viewPreferences}
          onViewPreferencesChange={handleViewPreferencesChange}
        />
      </section>
      <NiaPanel
        onApplyProposal={onApplyNiaProposal}
        onExternalPromptConsumed={() => setPendingNiaPrompt(null)}
        onRequestContext={onRequestNiaContext}
        externalPrompt={pendingNiaPrompt}
        supportedContexts={["selection", "document"]}
      />
      {/* 选择器只负责挑动作与合成提示词；提交走面板那一个 session。
          绝不能在这里再挂一个 `useNiaSession`——两个并存的 session 会认领同一个
          `started` 事件（它不带任何能对上具体 start() 调用的标识），选择器的回复
          会同时流进面板的消息列表。 */}
      <NotesNiaPicker
        content={niaPickerContent.content}
        hasSelection={niaPickerContent.hasSelection}
        onSubmit={(submission) => setPendingNiaPrompt(submission.prompt)}
      />
      <NotesCommandPalette
        isOpen={isCommandPaletteOpen}
        items={resolvedCommandPaletteItems}
        onOpenChange={(open) => onOpenCommandPaletteChange?.(open)}
      />
      {writeConflict ? (
        <NotesWriteConflictDialog
          conflict={writeConflict}
          onCopyDiff={() => onCopyWriteConflictDiff?.()}
          onKeepLocalVersion={() => onKeepWriteConflict?.()}
          onReload={() => onReloadWriteConflict?.()}
        />
      ) : null}
      {pendingMcpEdit ? (
        <NotesMcpEditReviewDialog
          edit={pendingMcpEdit}
          onAccept={() => onAcceptPendingMcpEdit?.()}
          onReject={() => onRejectPendingMcpEdit?.()}
        />
      ) : null}
      <div className="notes-v2__sr-only" data-testid="notes-workbench" />
    </>
  );
}
