"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NotesEditorBridge } from "@/features/notes/editor/editor-types";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import { formatMarkdown } from "@/features/notes/formatting/cjk-formatter";
import { getFormatDescriptor } from "@/features/notes/formats/format-registry";
import { loadNoteDocument } from "@/features/notes/documents/document-repository";
import {
  VAULT_READ_CONCURRENCY,
  mapWithConcurrency,
} from "@/features/notes/vault/map-with-concurrency";
import { loadCjkFormattingSettings } from "@/features/notes/formatting/cjk-formatting-store";
import { buildNoteHtmlExport } from "@/features/notes/export/note-export";
import { buildLearningPanelModel } from "@/features/notes/integrations/learning-panel-model";
import { setNoteTags } from "@/features/notes/documents/note-tags";
import { slugifyNoteFileName } from "@/features/notes/documents/rename-note-plan";
import { NEW_NOTE_BODY_PLACEHOLDER } from "@/features/notes/documents/note-editing-source";
import { sanitizeNoteFileName } from "@/features/notes/note-model";
import { getFileExportService } from "@/platform/services";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import { useNotesActions } from "@/features/notes/workbench/use-notes-actions";
import {
  buildNotesCommandPalette,
} from "@/features/notes/workbench/build-notes-command-palette";
import { executeNotesMcpRequest } from "@/features/notes/workbench/notes-mcp-request-handler";
import { executeNotesMcpWorkspaceRequest } from "@/features/notes/workbench/notes-mcp-workspace-handler";
import type {
  NotesMcpPendingEdit,
  NotesMcpPendingEditInput,
} from "@/features/notes/workbench/notes-mcp-edit-review";
import { useNotesDocuments } from "@/features/notes/workbench/use-notes-documents";
import { useNotesRuntime } from "@/features/notes/workbench/use-notes-runtime";
import { useNotesSidebarState } from "@/features/notes/workbench/use-notes-sidebar-state";
import { selectOpenDocuments } from "@/features/notes/workspace/workspace-selectors";
import {
  createNotesDocumentContext,
  createNotesSelectionContext,
  validateNiaApplyProposal,
  type NiaApplyProposal,
  type NiaContext,
} from "@/features/nia/nia-context";

// How long after a note settles (saved, no longer dirty) before its file name
// is renamed to match the title. Short enough to feel immediate, long enough to
// avoid churning the file while the user is still finishing the title.
const TITLE_FILENAME_SYNC_DEBOUNCE_MS = 500;

export type UseNotesWorkbenchOptions = {
  resumeNoteId?: string | null;
  promptFn?: (
    title: string,
    defaultValue?: string,
    placeholder?: string,
  ) => Promise<string | null>;
  confirmFn?: (message: string, confirmLabel?: string) => Promise<boolean>;
};

export function useNotesWorkbenchFacade(options?: UseNotesWorkbenchOptions) {
  const editorBridgeRef = useRef<NotesEditorBridge | null>(null);
  const [pendingMcpEdit, setPendingMcpEdit] =
    useState<NotesMcpPendingEdit | null>(null);

  const {
    client,
    desktopBridge,
    desktopCommands,
    directoryInfo,
    errorMessage,
    ensureDocuments,
    indexRebuildMessage,
    isLoading,
    isRebuildingIndex,
    handleExportVault,
    rebuildIndex,
    refreshDesktopCommands,
    refreshSnapshot,
    sentences,
    setDirectoryInfo,
    setErrorMessage,
    snapshot,
    vaultStore,
    words,
  } = useNotesRuntime();
  const {
    editorActiveLine,
    editorMode,
    canGoBack,
    canGoForward,
    handleClosePath,
    handleCommand,
    handleGoBack,
    handleGoForward,
    handleOpenPath,
    handleSetEditorMode,
    handleSetLeftSidebarCollapsed,
    handleSetLeftSidebarMode,
    handleSetRightSidebarCollapsed,
    handleSetRightSidebarMode,
    isCommandPaletteOpen,
    learningQuery,
    searchQuery,
    setCommandPaletteOpen,
    setEditorActiveLine,
    setLearningQuery,
    setSearchQuery,
    setWorkspace,
    workspace,
  } = useNotesSidebarState(client.rootPath);
  const {
    activeDocument,
    backlinks,
    clearLocalDocumentState,
    handleCopyWriteConflictDiff,
    handleKeepWriteConflict,
    handleReloadWriteConflict,
    clearPendingDerivation,
    clearPendingSave,
    dirtyPaths,
    documents,
    handleDocumentChange,
    handleSaveActiveDocument,
    handleSaveAllDocuments,
    writeConflict,
    searchResults,
  } = useNotesDocuments({
    client,
    ensureDocuments,
    resumeNoteId: options?.resumeNoteId,
    searchQuery,
    setErrorMessage,
    setWorkspace,
    refreshSnapshot,
    snapshot,
    workspace,
  });

  // 关系图的全库数据是按需、临时的独立缓存，不能塞进 vaultStore 的编辑器缓存。
  // 后者会在每次 refresh 时重读所有缓存路径；若图谱加载过全库，就会让本会话
  // 之后每次 autosave / 外部变更都退化成 O(整库) 磁盘读取。
  const graphLiveDocumentsRef = useRef(documents);
  useEffect(() => {
    graphLiveDocumentsRef.current = documents;
  }, [documents]);

  type GraphSnapshot = {
    source: typeof snapshot;
    documents: NoteDocument[];
  };
  const [graphSnapshot, setGraphSnapshot] = useState<GraphSnapshot | null>(null);
  const graphSnapshotRef = useRef<GraphSnapshot | null>(null);
  useEffect(() => {
    graphSnapshotRef.current = graphSnapshot;
  }, [graphSnapshot]);

  const graphRequestRef = useRef<{
    source: typeof snapshot;
    token: object;
    promise: Promise<void>;
  } | null>(null);

  const ensureGraphDocuments = useCallback(() => {
    const source = snapshot;
    if (graphSnapshotRef.current?.source === source) {
      return Promise.resolve();
    }
    if (graphRequestRef.current?.source === source) {
      return graphRequestRef.current.promise;
    }

    // 串行化并合并连续 refresh：新一代请求会排在旧请求后面，旧请求开始读取前
    // 若已被更新一代取代就直接跳过，避免同时启动多组 16 路全库读取。
    const previous = graphRequestRef.current?.promise ?? Promise.resolve();
    const token = {};
    const promise = previous
      .catch(() => undefined)
      .then(async () => {
        if (graphRequestRef.current?.token !== token) return;

        const entries = source.entries.filter(
          (entry) =>
            entry.kind === "file" && getFormatDescriptor(entry.path).canEdit,
        );
        const liveByPath = new Map(
          graphLiveDocumentsRef.current.map((document) => [document.path, document]),
        );
        const loadedDocuments = await mapWithConcurrency(
          entries,
          VAULT_READ_CONCURRENCY,
          async (entry) => {
            const live = liveByPath.get(entry.path);
            if (live) return live;

            const loaded = await loadNoteDocument(client, entry);
            if (!loaded) {
              throw new Error(`Unable to load graph document: ${entry.path}`);
            }
            return loaded;
          },
        );

        // 只有仍为最新请求的结果可以提交；被 vault refresh 取代的结果直接丢弃。
        if (graphRequestRef.current?.token === token) {
          setGraphSnapshot({ documents: loadedDocuments, source });
        }
      })
      .finally(() => {
        if (graphRequestRef.current?.token === token) {
          graphRequestRef.current = null;
        }
      });
    graphRequestRef.current = { promise, source, token };
    return promise;
  }, [client, snapshot]);

  const graphDocuments = useMemo(() => {
    const cached = graphSnapshot?.source === snapshot ? graphSnapshot.documents : [];
    const byPath = new Map(cached.map((document) => [document.path, document]));
    // 当前内存文档最后覆盖磁盘快照，保证未保存编辑立即反映到图中。
    documents.forEach((document) => byPath.set(document.path, document));
    return snapshot.entries
      .map((entry) => byPath.get(entry.path) ?? null)
      .filter((document): document is NoteDocument => document !== null);
  }, [documents, graphSnapshot, snapshot]);

  // Fallback no-op fns so callers don't need to guard against undefined
  const fallbackPrompt = useCallback(
    async (_title: string, _defaultValue?: string): Promise<string | null> => {
      return window.prompt(_title, _defaultValue) ?? null;
    },
    [],
  );
  const fallbackConfirm = useCallback(
    async (message: string): Promise<boolean> => {
      return window.confirm(message);
    },
    [],
  );

  const {
    handleCopyPath,
    handleCreateNote,
    handleCreateNoteInPath,
    handleCreateFolderInPath,
    handleDeleteActiveNote,
    handleDeletePath,
    handleEnsureWikiLinkNote,
    handleMovePath,
    handleRevealPath,
    handleRestoreLastDeleted,
    handleOpenWikiLink,
    handlePickDirectory,
    handlePickFile,
    handleRenameActiveNote,
    handleRenameNoteToTitle,
    handleRenamePath,
    handleRunDesktopCommand,
    lastRunCommandTitle,
  } = useNotesActions({
    activeDocument,
    clearLocalDocumentState,
    clearPendingDerivation,
    clearPendingSave,
    client,
    desktopBridge,
    desktopCommands,
    documents,
    promptFn: options?.promptFn ?? fallbackPrompt,
    confirmFn: options?.confirmFn ?? fallbackConfirm,
    refreshSnapshot,
    setDirectoryInfo,
    setErrorMessage,
    setWorkspace,
    vaultStore,
  });
  const activeDocumentRef = useRef(activeDocument);
  const documentsRef = useRef(documents);
  const editorModeRef = useRef(editorMode);
  const dirtyPathsRef = useRef(dirtyPaths);
  const workspaceRef = useRef(workspace);

  useEffect(() => {
    activeDocumentRef.current = activeDocument;
  }, [activeDocument]);

  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);

  useEffect(() => {
    editorModeRef.current = editorMode;
  }, [editorMode]);

  useEffect(() => {
    dirtyPathsRef.current = dirtyPaths;
  }, [dirtyPaths]);

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  // ── Keep the file name in sync with the note title ────────────────────────
  // Once a note has fully saved (no longer dirty), if its title now maps to a
  // different file name than the file currently has, rename the file to match
  // and cascade every wiki link. Gated on !dirty so it only fires after the
  // user stops typing — never mid-keystroke — and a short debounce smooths out
  // the final settle. Empty/placeholder titles and case-only differences are
  // skipped; collisions are refused inside handleRenameNoteToTitle. After a
  // successful rename the new file name equals the slug, so this never loops.
  const lastAttemptedTitleSyncRef = useRef<{ path: string; title: string } | null>(
    null,
  );
  // Only auto-rename notes the user has actually edited this session. Without
  // this, merely *opening* a legacy note whose file name never matched its
  // title would rewrite it (and every link to it) — browsing must never mutate
  // files. A note enters this set synchronously the moment its content changes
  // (see handleDocumentChangeWithEditTracking) rather than by observing the
  // dirty flag, which can toggle true→false too fast for an effect to catch.
  const editedSinceOpenRef = useRef<Set<string>>(new Set());

  // Any content edit (typing, tag edits, MCP writes) marks the note as edited so
  // the title→filename sync may act on it. Wrapping here keeps the marking in
  // lock-step with the change itself.
  const handleDocumentChangeWithEditTracking = useCallback(
    (path: string, rawSource: string) => {
      editedSinceOpenRef.current.add(path);
      handleDocumentChange(path, rawSource);
    },
    [handleDocumentChange],
  );

  const handlePendingMcpEdit = useCallback((edit: NotesMcpPendingEditInput) => {
    const pendingEdit = {
      ...edit,
      createdAt: new Date().toISOString(),
      id: `mcp-edit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };

    setPendingMcpEdit(pendingEdit);
    return { id: pendingEdit.id };
  }, []);

  const handleRejectPendingMcpEdit = useCallback(() => {
    setPendingMcpEdit(null);
  }, []);

  const handleAcceptPendingMcpEdit = useCallback(() => {
    if (!pendingMcpEdit) {
      return;
    }

    if (pendingMcpEdit.kind === "document") {
      handleDocumentChangeWithEditTracking(
        pendingMcpEdit.path,
        pendingMcpEdit.afterSource,
      );
      setPendingMcpEdit(null);
      return;
    }

    if (workspaceRef.current.activePath !== pendingMcpEdit.path) {
      setErrorMessage("Open the target note before applying this MCP selection edit.");
      return;
    }

    if (pendingMcpEdit.selection) {
      editorBridgeRef.current?.setSelection(
        pendingMcpEdit.selection.from,
        pendingMcpEdit.selection.to,
      );
    }
    editorBridgeRef.current?.insertSnippet(pendingMcpEdit.content);
    setPendingMcpEdit(null);
  }, [handleDocumentChangeWithEditTracking, pendingMcpEdit, setErrorMessage]);

  useEffect(() => {
    const document = activeDocument;

    if (!document) {
      return;
    }

    const path = document.path;

    if (dirtyPaths[path] || !editedSinceOpenRef.current.has(path)) {
      return;
    }

    const title = document.parsed.title?.trim() ?? "";

    if (!title || title === NEW_NOTE_BODY_PLACEHOLDER) {
      return;
    }

    const targetSlug = slugifyNoteFileName(title);

    if (targetSlug.toLowerCase() === document.basename.toLowerCase()) {
      return;
    }

    // Don't retry the exact same (path, title) we just attempted — e.g. when a
    // name collision blocked the rename — or we'd spin every render.
    if (
      lastAttemptedTitleSyncRef.current?.path === path &&
      lastAttemptedTitleSyncRef.current?.title === title
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      lastAttemptedTitleSyncRef.current = { path, title };
      void handleRenameNoteToTitle(path, title);
    }, TITLE_FILENAME_SYNC_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [activeDocument, dirtyPaths, handleRenameNoteToTitle]);

  const learningSnippets = useMemo(
    () =>
      buildLearningPanelModel({
        query: learningQuery,
        sentences,
        words,
      }),
    [learningQuery, sentences, words],
  );

  const handleInsertSnippet = useCallback((snippet: string) => {
    editorBridgeRef.current?.insertSnippet(`\n\n${snippet}\n`);
  }, []);

  const handleEditorBridgeReady = useCallback(
    (bridge: NotesEditorBridge | null) => {
      editorBridgeRef.current = bridge;
    },
    [],
  );

  const handleRequestNiaContext = useCallback((kind: "selection" | "document" | "browser"): NiaContext | null => {
    if (kind === "browser") return null;
    const document = activeDocumentRef.current;
    if (!document) return null;
    if (kind === "selection") {
      return createNotesSelectionContext({
        path: document.path,
        source: document.rawSource,
        selection: editorBridgeRef.current?.getSelection() ?? null,
      });
    }
    return createNotesDocumentContext({ path: document.path, source: document.rawSource });
  }, []);

  const handleApplyNiaProposal = useCallback((proposal: NiaApplyProposal) => {
    const document = activeDocumentRef.current;
    const bridge = editorBridgeRef.current;
    if (!document || !bridge) {
      return { ok: false, reason: "Open the target note before applying." };
    }
    const validation = validateNiaApplyProposal(proposal, {
      path: document.path,
      source: document.rawSource,
      selection: bridge.getSelection(),
    });
    if (!validation.ok) {
      setErrorMessage(validation.reason);
      return validation;
    }
    if (proposal.mode === "replace_document") {
      handleDocumentChangeWithEditTracking(document.path, proposal.content);
    } else {
      if (proposal.mode === "replace_selection" && proposal.context.kind === "notes_selection") {
        bridge.setSelection(proposal.context.selection.from, proposal.context.selection.to);
      }
      bridge.insertSnippet(proposal.content);
    }
    setErrorMessage(null);
    return { ok: true as const };
  }, [handleDocumentChangeWithEditTracking, setErrorMessage]);

  const handleExportActiveDocumentHtml = useCallback(async () => {
    if (!activeDocument) {
      return;
    }

    try {
      const exportService = getFileExportService();
      const html = buildNoteHtmlExport(activeDocument);
      const baseName = sanitizeNoteFileName(activeDocument.basename || "note");

      await exportService.exportText(
        `${baseName}.html`,
        html,
        "text/html;charset=utf-8",
      );
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : NOTES_UI_COPY.errors.exportNote,
      );
    }
  }, [activeDocument, setErrorMessage]);

  const handleExportActiveDocumentPdf = useCallback(async () => {
    if (!activeDocument) {
      return;
    }

    try {
      const exportService = getFileExportService();
      const html = buildNoteHtmlExport(activeDocument);
      const baseName = sanitizeNoteFileName(activeDocument.basename || "note");

      await exportService.exportPdf(`${baseName}.pdf`, html);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : NOTES_UI_COPY.errors.exportNote,
      );
    }
  }, [activeDocument, setErrorMessage]);

  const handleUpdateActiveTags = useCallback(
    (tags: string[]) => {
      if (
        !activeDocument ||
        getFormatDescriptor(activeDocument.path).id !== "markdown"
      ) {
        return;
      }
      const nextSource = setNoteTags(activeDocument.rawSource, tags);
      if (nextSource === activeDocument.rawSource) {
        return;
      }
      handleDocumentChangeWithEditTracking(activeDocument.path, nextSource);
    },
    [activeDocument, handleDocumentChangeWithEditTracking],
  );

  // 纯排版变换：走原始 handleDocumentChange（不打"已编辑"标记），
  // 避免仅因排版就触发"文件名同步标题"的自动重命名。
  // 配置在调用时从 localStorage 读取，始终反映「设置 → 语言」里的最新开关。
  const handleFormatActiveCjk = useCallback(() => {
    if (
      !activeDocument ||
      getFormatDescriptor(activeDocument.path).id !== "markdown"
    ) {
      return;
    }
    const nextSource = formatMarkdown(
      activeDocument.rawSource,
      loadCjkFormattingSettings(),
    );
    if (nextSource === activeDocument.rawSource) {
      return;
    }
    handleDocumentChange(activeDocument.path, nextSource);
  }, [activeDocument, handleDocumentChange]);

  useEffect(() => {
    const notesMcpBridge = desktopBridge?.notesMcp;

    if (!notesMcpBridge) {
      return undefined;
    }

    let isDisposed = false;

    void notesMcpBridge.getServerInfo().catch((error: unknown) => {
      if (isDisposed) {
        return;
      }

      setErrorMessage(
        error instanceof Error
          ? `Notes MCP Bridge 启动失败：${error.message}`
          : "Notes MCP Bridge 启动失败。",
      );
    });

    const unsubscribe = notesMcpBridge.onRequest(async (request) => {
      const serverInfo = await notesMcpBridge.getServerInfo();
      const autoApproveEdits = serverInfo.policy.autoApproveEdits;

      if (
        request.method === "notes.mcp.document" ||
        request.method === "notes.mcp.session" ||
        request.method === "notes.mcp.workspace"
      ) {
        return executeNotesMcpWorkspaceRequest(request as Parameters<typeof executeNotesMcpWorkspaceRequest>[0], {
          autoApproveEdits,
          client: { rootPath: client.rootPath, writeFile: client.writeFile },
          dirtyPaths: dirtyPathsRef.current,
          documents: documentsRef.current,
          onDocumentChange: handleDocumentChangeWithEditTracking,
          onPendingEdit: handlePendingMcpEdit,
          setWorkspace,
          workspace: workspaceRef.current,
        });
      }

      return executeNotesMcpRequest(request, {
        activeDocument: activeDocumentRef.current,
        autoApproveEdits,
        bridge: editorBridgeRef.current,
        editorMode: editorModeRef.current,
        onPendingEdit: handlePendingMcpEdit,
      });
    });

    return () => {
      isDisposed = true;
      unsubscribe();
    };
  }, [client.rootPath, client.writeFile, desktopBridge?.notesMcp, handleDocumentChangeWithEditTracking, handlePendingMcpEdit, setErrorMessage, setWorkspace]);

  const commandPaletteItems = useMemo(
    () =>
    buildNotesCommandPalette({
      documents,
      onCreateNote: () => void handleCreateNote(),
      onDeleteActiveNote: () => void handleDeleteActiveNote(),
      onExportVault: () => void handleExportVault(),
      onFormatCjk: handleFormatActiveCjk,
      onOpenPath: handleOpenPath,
      onRecordCommand: handleCommand,
      onRefresh: () => void refreshSnapshot(),
      onRenameActiveNote: () => void handleRenameActiveNote(),
      onSaveActiveNote: () => void handleSaveActiveDocument(),
      onSaveAllNotes: () => void handleSaveAllDocuments(),
      recentFiles: workspace.recentFiles,
      }),
    [
      documents,
      handleCommand,
      handleCreateNote,
      handleDeleteActiveNote,
      handleExportVault,
      handleFormatActiveCjk,
      handleOpenPath,
      handleRenameActiveNote,
      handleSaveActiveDocument,
      handleSaveAllDocuments,
      refreshSnapshot,
      workspace.recentFiles,
    ],
  );

  return {
    activeDocument,
    activePath: workspace.activePath,
    backlinks,
    commandPaletteItems,
    desktopCommands,
    desktopTerminal: desktopBridge?.terminal ?? null,
    directoryInfo,
    documents,
    graphDocuments,
    ensureGraphDocuments,
    dirtyPaths,
    editorActiveLine,
    entries: snapshot.entries,
    errorMessage,
    canGoBack,
    canGoForward,
    handleClosePath,
    handleCopyPath,
    handleCreateNote,
    handleCreateNoteInPath,
    handleCreateFolderInPath,
    handleDeleteActiveNote,
    handleDeletePath,
    handleRenamePath,
    handleExportActiveDocumentHtml,
    handleExportActiveDocumentPdf,
    handleExportVault,
    handleFormatActiveCjk,
    handleCopyWriteConflictDiff,
    handleDocumentChange: handleDocumentChangeWithEditTracking,
    handleEnsureWikiLinkNote,
    handleInsertSnippet,
    handleRequestNiaContext,
    handleApplyNiaProposal,
    handleKeepWriteConflict,
    handleGoBack,
    handleGoForward,
    handleMovePath,
    handleRevealPath,
    handleRestoreLastDeleted,
    handleOpenPath,
    handleOpenWikiLink,
    handleAcceptPendingMcpEdit,
    handlePickDirectory,
    handlePickFile,
    handleRejectPendingMcpEdit,
    handleReloadWriteConflict,
    handleSetLeftSidebarCollapsed,
    handleSetLeftSidebarMode,
    handleRenameActiveNote,
    handleRunDesktopCommand,
    handleSaveActiveDocument,
    handleSaveAllDocuments,
    handleSetRightSidebarCollapsed,
    handleSetRightSidebarMode,
    handleUpdateActiveTags,
    isCommandPaletteOpen,
    isLoading,
    isRebuildingIndex,
    isDesktopBridgeAvailable: Boolean(desktopBridge),
    indexRebuildMessage,
    lastRunCommandTitle,
    leftSidebarCollapsed: workspace.leftSidebarCollapsed,
    leftSidebarMode: workspace.leftSidebarMode,
    editorMode,
    learningQuery,
    learningSnippets,
    openDocuments: selectOpenDocuments(documents, workspace),
    openTabs: workspace.openTabs,
    pendingMcpEdit,
    refreshDesktopCommands,
    refreshSnapshot,
    rebuildIndex,
    recentFiles: workspace.recentFiles,
    rightSidebarCollapsed: workspace.rightSidebarCollapsed,
    rightSidebarMode: workspace.rightSidebarMode,
    searchQuery,
    searchResults,
    setCommandPaletteOpen,
    setEditorBridge: handleEditorBridgeReady,
    setEditorActiveLine,
    setEditorMode: handleSetEditorMode,
    setLearningQuery,
    setSearchQuery,
    snapshot,
    writeConflict,
  };
}
