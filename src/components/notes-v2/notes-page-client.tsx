"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import { DesktopAppFrame } from "@/components/desktop/desktop-app-frame";
import { createNoteDocument } from "@/features/notes/documents/document-repository";
import { setNoteTags } from "@/features/notes/documents/note-tags";
import { formatMarkdownChecked } from "@/features/notes/formatting/cjk-formatter";
import { loadCjkFormattingSettings } from "@/features/notes/formatting/cjk-formatting-store";
import { buildNoteHtmlExport } from "@/features/notes/export/note-export";
import { sanitizeNoteFileName } from "@/features/notes/note-model";
import type { DesktopExternalMarkdownFile } from "@/platform/desktop/desktop-bridge";
import { getDesktopBridge } from "@/platform/desktop/desktop-runtime";
import { getFileExportService } from "@/platform/services";
import { NotesFolderBrowser } from "@/components/notes-v2/notes-folder-browser";
import {
  folderFromDirectoryInfo,
  getInitialNotesLocation,
  getNotesRootLocation,
  isNotesFolderNavigateEvent,
  NOTES_FOLDER_NAVIGATE_EVENT,
  NOTES_LANDING_VISITED_SESSION_KEY,
  NOTES_ROOT_NAVIGATE_EVENT,
  type NotesFolderLocation,
  type NotesLocation,
  writeLastNotesFolder,
  writeSessionValue,
} from "@/components/notes-v2/notes-navigation";
import { NotesWorkbench } from "@/components/notes-v2/notes-workbench";
import { useNotesWorkbench } from "@/components/notes-v2/use-notes-workbench";
import { useNotesDialog } from "@/components/notes-v2/use-notes-dialog";
import { NotesWelcomeScreen } from "@/components/notes-v2/notes-welcome-screen";
import { useAppReadingTheme } from "@/features/notes/workbench/use-app-reading-theme";
import { useAppWindowPreferences } from "@/features/appearance/use-app-window-preferences";

type NotesPageClientProps = {
  resumeNoteId?: string | null;
};

type ExternalMarkdownSessionFile = DesktopExternalMarkdownFile & {
  bufferSyncSource: string;
  conflicted: boolean;
  conflictDiskHash: string | null;
  saveError: string | null;
  failedSource: string | null;
};

function getExternalMarkdownConflictHash(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/EXTERNAL_MARKDOWN_FILE_CHANGED_ON_DISK(?::([a-f\d]{64}))?/i);
  return match?.[1] ?? null;
}

export function NotesPageClient({ resumeNoteId = null }: NotesPageClientProps) {
  const theme = useAppReadingTheme();
  const windowPreferences = useAppWindowPreferences();
  const { promptFn, confirmFn, renderDialogs } = useNotesDialog();
  const workbench = useNotesWorkbench({
    resumeNoteId,
    promptFn,
    confirmFn,
  });
  const {
    activePath: workbenchActivePath,
    directoryInfo: workbenchDirectoryInfo,
    handleClosePath: closeInternalPath,
    handleDeleteActiveNote: deleteInternalActiveNote,
    handleDocumentChange: changeInternalDocument,
    handleEnsureWikiLinkNote: ensureInternalWikiLinkNote,
    handleExportActiveDocumentHtml: exportInternalActiveDocumentHtml,
    handleExportActiveDocumentPdf: exportInternalActiveDocumentPdf,
    handleFormatActiveCjk: formatInternalActiveCjk,
    handleGoBack: goBackInternal,
    handleGoForward: goForwardInternal,
    handleOpenPath: openInternalPath,
    handleOpenWikiLink: openInternalWikiLink,
    handleRenameActiveNote: renameInternalActiveNote,
    handleRevealPath: revealInternalPath,
    handleSaveActiveDocument: saveInternalActiveDocument,
    handleSaveAllDocuments: saveAllInternalDocuments,
    handleUpdateActiveTags: updateInternalActiveTags,
  } = workbench;
  const desktopBridge = getDesktopBridge();
  const externalMarkdownBridge = desktopBridge?.externalMarkdown;
  const directoryInfoRef = useRef(workbench.directoryInfo);
  directoryInfoRef.current = workbench.directoryInfo;
  const [externalFiles, setExternalFiles] = useState<ExternalMarkdownSessionFile[]>([]);
  const externalFilesRef = useRef<ExternalMarkdownSessionFile[]>([]);
  const externalSaveInFlightRef = useRef(new Set<string>());
  const [activeExternalFileId, setActiveExternalFileId] = useState<string | null>(null);
  const [location, setLocation] = useState<NotesLocation>(() =>
    getInitialNotesLocation({ hasResumeNote: Boolean(resumeNoteId) }),
  );

  const updateExternalFiles = useCallback(
    (update: (previous: ExternalMarkdownSessionFile[]) => ExternalMarkdownSessionFile[]) => {
      const next = update(externalFilesRef.current);
      externalFilesRef.current = next;
      setExternalFiles(next);
    },
    [],
  );

  const activeExternalFile = useMemo(
    () => externalFiles.find((file) => file.id === activeExternalFileId) ?? null,
    [activeExternalFileId, externalFiles],
  );

  const externalDocuments = useMemo(
    () =>
      externalFiles.map((file) =>
        createNoteDocument({
          mtime: file.mtime,
          path: file.path,
          rawSource: file.rawSource,
        }),
      ),
    [externalFiles],
  );
  const activeExternalDocument = useMemo(
    () =>
      externalDocuments.find((document) => document.path === activeExternalFile?.path) ?? null,
    [activeExternalFile?.path, externalDocuments],
  );

  const activeFolder = useMemo<NotesFolderLocation | null>(() => {
    if (location.type === "landing") return null;
    return location.folder;
  }, [location]);

  const handleExternalFileOpen = useCallback(
    (file: DesktopExternalMarkdownFile) => {
      const existing = externalFilesRef.current.find((item) => item.path === file.path);
      const selected = existing?.id ?? file.id;
      if (!existing) {
        const nextFile: ExternalMarkdownSessionFile = {
          ...file,
          bufferSyncSource: file.rawSource,
          conflicted: false,
          conflictDiskHash: null,
          failedSource: null,
          saveError: null,
        };
        updateExternalFiles((previous) => [...previous, nextFile]);
      } else if (existing.rawSource === existing.savedSource) {
        updateExternalFiles((previous) =>
          previous.map((item) =>
            item.id === existing.id
              ? {
                  ...item,
                  ...file,
                  bufferSyncSource: file.rawSource,
                  conflicted: false,
                  conflictDiskHash: null,
                  failedSource: null,
                  saveError: null,
                }
              : item,
          ),
        );
      }
      setActiveExternalFileId(selected);
      setLocation({
        type: "note",
        folder: folderFromDirectoryInfo(directoryInfoRef.current),
      });
    },
    [updateExternalFiles],
  );

  const saveExternalFile = useCallback(
    async (fileId: string, rawSource: string, allowOverwritePrompt = false) => {
      if (!externalMarkdownBridge || externalSaveInFlightRef.current.has(fileId)) {
        return false;
      }

      externalSaveInFlightRef.current.add(fileId);
      try {
        let overwriteExternalChanges = false;
        const previous = externalFilesRef.current.find((file) => file.id === fileId);
        let expectedDiskHash = previous?.conflictDiskHash ?? null;
        if (previous?.conflicted && allowOverwritePrompt) {
          overwriteExternalChanges = await confirmFn(
            "这个 Markdown 文件已在其他应用中修改。确认后，Auris 当前内容会覆盖磁盘版本。",
            "覆盖磁盘版本",
          );
          if (!overwriteExternalChanges) return false;
        }

        let result: { mtime: string };
        try {
          result = await externalMarkdownBridge.save(
            fileId,
            rawSource,
            overwriteExternalChanges,
            expectedDiskHash ?? undefined,
          );
        } catch (error) {
          const conflictHash = getExternalMarkdownConflictHash(error);
          if (
            !allowOverwritePrompt ||
            overwriteExternalChanges ||
            !conflictHash
          ) {
            throw error;
          }
          expectedDiskHash = conflictHash;

          updateExternalFiles((current) =>
            current.map((file) =>
              file.id === fileId
                ? {
                    ...file,
                    conflicted: true,
                    conflictDiskHash: conflictHash,
                    saveError: "文件已在其他应用中修改。再次保存时可以确认是否覆盖磁盘版本。",
                  }
                : file,
            ),
          );
          const confirmed = await confirmFn(
            "这个 Markdown 文件已在其他应用中修改。确认后，Auris 当前内容会覆盖磁盘版本。",
            "覆盖磁盘版本",
          );
          if (!confirmed) return false;
          result = await externalMarkdownBridge.save(fileId, rawSource, true, expectedDiskHash);
        }

        updateExternalFiles((previous) =>
          previous.map((file) =>
            file.id === fileId
              ? {
                  ...file,
                  bufferSyncSource: rawSource,
                  conflicted: false,
                  failedSource: null,
                  mtime: result.mtime,
                  saveError: null,
                  savedSource: rawSource,
                }
              : file,
          ),
        );
        return true;
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : String(error);
        const conflictHash = getExternalMarkdownConflictHash(error);
        const isDiskConflict = Boolean(conflictHash);
        const message = isDiskConflict
          ? "文件已在其他应用中修改，Auris 没有覆盖磁盘版本。点击保存可选择是否用 Auris 当前内容覆盖。"
          : `保存 Markdown 文件失败：${rawMessage}`;
        updateExternalFiles((previous) =>
          previous.map((file) =>
            file.id === fileId
              ? {
                  ...file,
                  conflicted: isDiskConflict || file.conflicted,
                  conflictDiskHash: conflictHash ?? file.conflictDiskHash,
                  failedSource: isDiskConflict ? null : rawSource,
                  saveError: message,
                }
              : file,
          ),
        );
        toast.error(message, { duration: 7000 });
        return false;
      } finally {
        externalSaveInFlightRef.current.delete(fileId);
      }
    },
    [confirmFn, externalMarkdownBridge, updateExternalFiles],
  );

  const handleExternalDocumentChange = useCallback(
    (fileId: string, rawSource: string) => {
      updateExternalFiles((previous) =>
        previous.map((file) =>
          file.id === fileId
            ? { ...file, failedSource: null, rawSource, saveError: null }
            : file,
        ),
      );
    },
    [updateExternalFiles],
  );

  useEffect(() => {
    if (!externalMarkdownBridge) return undefined;
    return externalMarkdownBridge.onOpen(handleExternalFileOpen);
  }, [externalMarkdownBridge, handleExternalFileOpen]);

  useEffect(() => {
    if (!externalMarkdownBridge) return undefined;
    const timers = externalFiles
      .filter((file) => file.rawSource !== file.bufferSyncSource)
      .map((file) =>
        window.setTimeout(() => {
          const source = file.rawSource;
          void externalMarkdownBridge
            .updateBuffer(file.id, source)
            .then(() => {
              updateExternalFiles((previous) =>
                previous.map((item) =>
                  item.id === file.id && item.rawSource === source
                    ? { ...item, bufferSyncSource: source }
                    : item,
                ),
              );
            })
            .catch(() => undefined);
        }, 120),
      );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [externalFiles, externalMarkdownBridge, updateExternalFiles]);

  useEffect(() => {
    const timers = externalFiles
      .filter(
        (file) =>
          file.rawSource !== file.savedSource &&
          file.failedSource !== file.rawSource &&
          !file.conflicted,
      )
      .map((file) =>
        window.setTimeout(() => {
          void saveExternalFile(file.id, file.rawSource);
        }, 1800),
      );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [externalFiles, saveExternalFile]);

  useEffect(() => {
    if (!externalFiles.some((file) => file.rawSource !== file.savedSource)) {
      return undefined;
    }
    const preventUnintendedClose = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventUnintendedClose);
    return () => window.removeEventListener("beforeunload", preventUnintendedClose);
  }, [externalFiles]);

  useEffect(() => {
    if (workbench.errorMessage) {
      toast.error(workbench.errorMessage, { duration: 5000 });
    }
  }, [workbench.errorMessage]);

  useEffect(() => {
    if (location.type !== "landing") return;
    writeSessionValue(NOTES_LANDING_VISITED_SESSION_KEY, "true");
  }, [location.type]);

  useEffect(() => {
    if (!activeFolder) return;
    writeLastNotesFolder(activeFolder);
  }, [activeFolder]);

  useEffect(() => {
    const handleFolderNavigate = (event: Event) => {
      if (!isNotesFolderNavigateEvent(event)) return;
      setActiveExternalFileId(null);
      setLocation({ type: "folder", folder: event.detail.folder });
    };
    const handleRootNavigate = () => {
      setActiveExternalFileId(null);
      setLocation(getNotesRootLocation());
    };

    window.addEventListener(NOTES_FOLDER_NAVIGATE_EVENT, handleFolderNavigate);
    window.addEventListener(NOTES_ROOT_NAVIGATE_EVENT, handleRootNavigate);
    return () => {
      window.removeEventListener(
        NOTES_FOLDER_NAVIGATE_EVENT,
        handleFolderNavigate,
      );
      window.removeEventListener(NOTES_ROOT_NAVIGATE_EVENT, handleRootNavigate);
    };
  }, []);

  const openFolder = useCallback((folder: NotesFolderLocation) => {
    setLocation({ type: "folder", folder });
  }, []);

  const openNote = useCallback(
    (path: string, folder = activeFolder) => {
      setActiveExternalFileId(null);
      workbench.handleOpenPath(path);
      setLocation({ type: "note", folder });
    },
    [activeFolder, workbench],
  );

  const handleCreateFile = useCallback(async () => {
    let folder = folderFromDirectoryInfo(workbench.directoryInfo);
    if (!workbench.directoryInfo.isConfigured) {
      const directory = await workbench.handlePickDirectory();
      if (!directory?.isConfigured) return;
      folder = folderFromDirectoryInfo(directory);
    }

    await workbench.handleCreateNote();
    setLocation({ type: "note", folder });
  }, [workbench]);

  const handleOpenFile = useCallback(async () => {
    if (externalMarkdownBridge) {
      try {
        const selectedFile = await externalMarkdownBridge.pick();
        if (selectedFile) handleExternalFileOpen(selectedFile);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "打开 Markdown 文件失败。");
      }
      return;
    }
    const selectedPath = await workbench.handlePickFile();
    if (!selectedPath) return;
    setLocation({
      type: "note",
      folder: folderFromDirectoryInfo(workbench.directoryInfo),
    });
  }, [externalMarkdownBridge, handleExternalFileOpen, workbench]);

  const handleOpenFolder = useCallback(async () => {
    const directory = await workbench.handlePickDirectory();
    const folder = folderFromDirectoryInfo(directory);
    if (folder) openFolder(folder);
  }, [openFolder, workbench]);

  const handleOpenRecent = useCallback(
    (path: string) => openNote(path, folderFromDirectoryInfo(workbench.directoryInfo)),
    [openNote, workbench.directoryInfo],
  );

  const handleCreateInFolder = useCallback(async () => {
    await workbench.handleCreateNoteInPath("");
    setLocation({ type: "note", folder: activeFolder });
  }, [activeFolder, workbench]);

  const handleReturnToFolder = useCallback(() => {
    setActiveExternalFileId(null);
    const folder = activeFolder ?? folderFromDirectoryInfo(workbench.directoryInfo);
    if (folder) {
      openFolder(folder);
      return;
    }
    setLocation({ type: "landing" });
  }, [activeFolder, openFolder, workbench.directoryInfo]);

  const handleOpenWorkbenchPath = useCallback(
    (path: string) => {
      const external = externalFilesRef.current.find((file) => file.path === path);
      if (external) {
        setActiveExternalFileId(external.id);
        setLocation((current) => ({
          type: "note",
          folder: current.type === "landing" ? folderFromDirectoryInfo(workbenchDirectoryInfo) : current.folder,
        }));
        return;
      }
      setActiveExternalFileId(null);
      openInternalPath(path);
    },
    [openInternalPath, workbenchDirectoryInfo],
  );

  const handleCloseWorkbenchPath = useCallback(
    async (path: string) => {
      const external = externalFilesRef.current.find((file) => file.path === path);
      if (!external) {
        closeInternalPath(path);
        return;
      }
      if (
        external.rawSource !== external.savedSource &&
        !(await confirmFn("这个 Markdown 文件还有未保存修改。关闭并丢弃这些修改吗？", "关闭并丢弃"))
      ) {
        return;
      }

      await externalMarkdownBridge?.close(external.id).catch(() => undefined);
      const remaining = externalFilesRef.current.filter((file) => file.id !== external.id);
      updateExternalFiles(() => remaining);
      if (activeExternalFileId === external.id) {
        const nextExternal = remaining.at(-1);
        setActiveExternalFileId(nextExternal?.id ?? null);
        if (!nextExternal && !workbenchActivePath) handleReturnToFolder();
      }
    },
    [activeExternalFileId, closeInternalPath, confirmFn, externalMarkdownBridge, handleReturnToFolder, updateExternalFiles, workbenchActivePath],
  );

  const handleExternalSaveActiveDocument = useCallback(() => {
    if (!activeExternalFile) {
      void saveInternalActiveDocument();
      return;
    }
    void saveExternalFile(activeExternalFile.id, activeExternalFile.rawSource, true);
  }, [activeExternalFile, saveExternalFile, saveInternalActiveDocument]);

  const handleExternalSaveAllDocuments = useCallback(() => {
    void (async () => {
      await saveAllInternalDocuments();
      for (const file of externalFilesRef.current.filter((item) => item.rawSource !== item.savedSource)) {
        await saveExternalFile(file.id, file.rawSource, true);
      }
    })();
  }, [saveAllInternalDocuments, saveExternalFile]);

  const handleExternalHtmlExport = useCallback(async () => {
    if (!activeExternalDocument) {
      await exportInternalActiveDocumentHtml();
      return;
    }
    try {
      const html = buildNoteHtmlExport(activeExternalDocument);
      const baseName = sanitizeNoteFileName(activeExternalDocument.basename || "note");
      await getFileExportService().exportText(`${baseName}.html`, html, "text/html;charset=utf-8");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导出 HTML 失败。");
    }
  }, [activeExternalDocument, exportInternalActiveDocumentHtml]);

  const handleExternalPdfExport = useCallback(async () => {
    if (!activeExternalDocument) {
      await exportInternalActiveDocumentPdf();
      return;
    }
    try {
      const html = buildNoteHtmlExport(activeExternalDocument);
      const baseName = sanitizeNoteFileName(activeExternalDocument.basename || "note");
      await getFileExportService().exportPdf(`${baseName}.pdf`, html);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导出 PDF 失败。");
    }
  }, [activeExternalDocument, exportInternalActiveDocumentPdf]);

  const handleExternalDocumentSourceChange = useCallback(
    (path: string, rawSource: string) => {
      const external = externalFilesRef.current.find((file) => file.path === path);
      if (external) {
        handleExternalDocumentChange(external.id, rawSource);
        return;
      }
      changeInternalDocument(path, rawSource);
    },
    [changeInternalDocument, handleExternalDocumentChange],
  );

  const handleExternalTagsUpdate = useCallback(
    (tags: string[]) => {
      if (!activeExternalDocument || !activeExternalFile) {
        updateInternalActiveTags(tags);
        return;
      }
      handleExternalDocumentChange(
        activeExternalFile.id,
        setNoteTags(activeExternalFile.rawSource, tags),
      );
    },
    [activeExternalDocument, activeExternalFile, handleExternalDocumentChange, updateInternalActiveTags],
  );

  const handleExternalFormatCjk = useCallback(() => {
    if (!activeExternalFile || !activeExternalDocument) {
      formatInternalActiveCjk();
      return;
    }
    const result = formatMarkdownChecked(
      activeExternalFile.rawSource,
      loadCjkFormattingSettings(),
      { preserveTwoSpaceHardBreaks: true },
    );
    if (result.refused) {
      toast.error("中文排版未应用：内容完整性检查未通过。");
      return;
    }
    if (result.text !== activeExternalFile.rawSource) {
      handleExternalDocumentChange(activeExternalFile.id, result.text);
    }
  }, [activeExternalDocument, activeExternalFile, formatInternalActiveCjk, handleExternalDocumentChange]);

  const handleExternalRevealPath = useCallback(
    (path: string) => {
      const external = externalFilesRef.current.find((file) => file.path === path);
      if (external) {
        void externalMarkdownBridge?.reveal(external.id);
        return;
      }
      revealInternalPath(path);
    },
    [externalMarkdownBridge, revealInternalPath],
  );

  const handleExternalWikiLink = useCallback(
    (target: string) => {
      if (!activeExternalFile) openInternalWikiLink(target);
    },
    [activeExternalFile, openInternalWikiLink],
  );

  const handleExternalEnsureWikiLinkNote = useCallback(
    (target: string, sourcePath?: string) => {
      if (!activeExternalFile) ensureInternalWikiLinkNote(target, sourcePath);
    },
    [activeExternalFile, ensureInternalWikiLinkNote],
  );

  const handleExternalRenameActiveNote = useCallback(() => {
    if (!activeExternalFile) renameInternalActiveNote();
  }, [activeExternalFile, renameInternalActiveNote]);

  const handleExternalDeleteActiveNote = useCallback(() => {
    if (!activeExternalFile) deleteInternalActiveNote();
  }, [activeExternalFile, deleteInternalActiveNote]);

  const handleExternalBack = useCallback(() => {
    setActiveExternalFileId(null);
    goBackInternal();
  }, [goBackInternal]);

  const handleExternalForward = useCallback(() => {
    setActiveExternalFileId(null);
    goForwardInternal();
  }, [goForwardInternal]);

  const isCurrentFolder =
    location.type === "folder" &&
    location.folder.path === workbench.directoryInfo.vaultPath;
  const documents = useMemo(
    () => [
      ...workbench.documents.filter(
        (document) => !externalDocuments.some((external) => external.path === document.path),
      ),
      ...externalDocuments,
    ],
    [externalDocuments, workbench.documents],
  );
  const activePath = activeExternalDocument?.path ?? workbench.activePath;
  const graphDocuments = useMemo(
    () => [
      ...workbench.graphDocuments.filter(
        (document) => !externalDocuments.some((external) => external.path === document.path),
      ),
      ...externalDocuments,
    ],
    [externalDocuments, workbench.graphDocuments],
  );
  const activeDocument = useMemo(
    () => documents.find((document) => document.path === activePath) ?? null,
    [activePath, documents],
  );
  const openTabs = useMemo(
    () => Array.from(new Set([...workbench.openTabs, ...externalDocuments.map((document) => document.path)])),
    [externalDocuments, workbench.openTabs],
  );
  const dirtyPaths = useMemo(
    () => ({
      ...workbench.dirtyPaths,
      ...Object.fromEntries(
        externalFiles
          .filter((file) => file.rawSource !== file.savedSource)
          .map((file) => [file.path, true]),
      ),
    }),
    [externalFiles, workbench.dirtyPaths],
  );
  const windowTitle =
    windowPreferences.titlebarName && location.type === "note"
      ? activeDocument?.fileName ?? null
      : null;

  return (
    <DesktopAppFrame activeNavId="notes" activeWorkspace="notes" subtitle="笔记工作区" title="笔记" windowTitle={windowTitle}>
      <div
        className="notes-v2-page"
        data-entry-view={location.type}
        data-testid="notes-page-frame"
      >
        {location.type === "landing" ? (
          <NotesWelcomeScreen
            documents={workbench.documents}
            recentFiles={workbench.recentFiles}
            theme={theme}
            onCreateFile={handleCreateFile}
            onOpenFile={handleOpenFile}
            onOpenFolder={handleOpenFolder}
            onOpenRecent={handleOpenRecent}
          />
        ) : location.type === "folder" ? (
          <NotesFolderBrowser
            documents={graphDocuments}
            errorMessage={workbench.errorMessage}
            folder={location.folder}
            isLoading={workbench.isLoading}
            isReady={isCurrentFolder}
            onCreateNote={handleCreateInFolder}
            onEnsureDocuments={workbench.ensureGraphDocuments}
            onOpenNote={(path) => openNote(path, location.folder)}
            theme={theme}
          />
        ) : (
          <NotesWorkbench
            activePath={activePath}
            backlinks={activeExternalFile ? [] : workbench.backlinks}
            commandPaletteItems={activeExternalFile ? [] : workbench.commandPaletteItems}
            desktopCommands={workbench.desktopCommands}
            desktopTerminal={workbench.desktopTerminal}
            directoryInfo={workbench.directoryInfo}
            dirtyPaths={dirtyPaths}
            documents={documents}
            graphDocuments={graphDocuments}
            editorMode={workbench.editorMode}
            entries={workbench.entries}
            errorMessage={activeExternalFile?.saveError ?? workbench.errorMessage}
            canGoBack={workbench.canGoBack}
            canGoForward={workbench.canGoForward}
            indexRebuildMessage={workbench.indexRebuildMessage}
            isCommandPaletteOpen={workbench.isCommandPaletteOpen}
            isDesktopBridgeAvailable={workbench.isDesktopBridgeAvailable}
            isLoading={workbench.isLoading}
            isRebuildingIndex={workbench.isRebuildingIndex}
            leftSidebarCollapsed={workbench.leftSidebarCollapsed}
            leftSidebarMode={workbench.leftSidebarMode}
            lastRunCommandTitle={workbench.lastRunCommandTitle}
            learningQuery={workbench.learningQuery}
            learningSnippets={workbench.learningSnippets}
            onCopyWriteConflictDiff={activeExternalFile ? undefined : workbench.handleCopyWriteConflictDiff}
            onClosePath={handleCloseWorkbenchPath}
            onCopyPath={workbench.handleCopyPath}
            onCreateNote={workbench.handleCreateNote}
            onCreateNoteInPath={workbench.handleCreateNoteInPath}
            onCreateFolderInPath={workbench.handleCreateFolderInPath}
            onDeleteActiveNote={handleExternalDeleteActiveNote}
            onDeletePath={workbench.handleDeletePath}
            onRenamePath={workbench.handleRenamePath}
            onRevealPath={handleExternalRevealPath}
            onMovePath={workbench.handleMovePath}
            onDocumentChange={handleExternalDocumentSourceChange}
            onEditorActiveLineChange={workbench.setEditorActiveLine}
            onEditorBridgeReady={workbench.setEditorBridge}
            onEditorModeChange={workbench.setEditorMode}
            onInsertSnippet={workbench.handleInsertSnippet}
            onRequestNiaContext={activeExternalFile ? undefined : workbench.handleRequestNiaContext}
            onApplyNiaProposal={activeExternalFile ? undefined : workbench.handleApplyNiaProposal}
            onLeftSidebarCollapsedChange={workbench.handleSetLeftSidebarCollapsed}
            onLeftSidebarModeChange={workbench.handleSetLeftSidebarMode}
            onLearningQueryChange={workbench.setLearningQuery}
            onOpenCommandPaletteChange={workbench.setCommandPaletteOpen}
            onEnsureWikiLinkNote={handleExternalEnsureWikiLinkNote}
            onEnsureGraphDocuments={workbench.ensureGraphDocuments}
            onOpenPath={handleOpenWorkbenchPath}
            onOpenWikiLink={handleExternalWikiLink}
            onExportActiveDocumentHtml={handleExternalHtmlExport}
            onExportActiveDocumentPdf={handleExternalPdfExport}
            onExportVault={workbench.handleExportVault}
            onFormatCjk={handleExternalFormatCjk}
            onPickDirectory={workbench.handlePickDirectory}
            onRebuildIndex={workbench.rebuildIndex}
            onRefresh={workbench.refreshSnapshot}
            onRefreshDesktopCommands={workbench.refreshDesktopCommands}
            onRenameActiveNote={handleExternalRenameActiveNote}
            onRightSidebarCollapsedChange={workbench.handleSetRightSidebarCollapsed}
            onRightSidebarModeChange={workbench.handleSetRightSidebarMode}
            onRunDesktopCommand={workbench.handleRunDesktopCommand}
            onSaveActiveDocument={handleExternalSaveActiveDocument}
            onSaveAllDocuments={handleExternalSaveAllDocuments}
            onUpdateTags={handleExternalTagsUpdate}
            onSearchQueryChange={workbench.setSearchQuery}
            onAcceptPendingMcpEdit={workbench.handleAcceptPendingMcpEdit}
            onKeepWriteConflict={activeExternalFile ? undefined : workbench.handleKeepWriteConflict}
            onGoBack={handleExternalBack}
            onGoForward={handleExternalForward}
            onRejectPendingMcpEdit={workbench.handleRejectPendingMcpEdit}
            onRestoreLastDeleted={workbench.handleRestoreLastDeleted}
            onReturnToFolder={handleReturnToFolder}
            returnFolderName={activeFolder?.name ?? workbench.directoryInfo.directoryName}
            openTabs={openTabs}
            pendingMcpEdit={workbench.pendingMcpEdit}
            recentFiles={workbench.recentFiles}
            rightSidebarCollapsed={workbench.rightSidebarCollapsed}
            rightSidebarMode={workbench.rightSidebarMode}
            searchQuery={workbench.searchQuery}
            searchResults={workbench.searchResults}
            onReloadWriteConflict={activeExternalFile ? undefined : workbench.handleReloadWriteConflict}
            writeConflict={activeExternalFile ? null : workbench.writeConflict}
          />
        )}
      </div>
      {renderDialogs()}
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: {
            background: "var(--notes-surface, #fff)",
            border: "1px solid var(--notes-line, #e0e0e0)",
            color: "var(--notes-text, #1f2d26)",
            fontFamily: '"Aptos", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
            fontSize: "13px",
          },
        }}
      />
    </DesktopAppFrame>
  );
}
