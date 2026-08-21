"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Toaster, toast } from "sonner";
import { DesktopAppFrame } from "@/components/desktop/desktop-app-frame";
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

type NotesPageClientProps = {
  resumeNoteId?: string | null;
};

export function NotesPageClient({ resumeNoteId = null }: NotesPageClientProps) {
  const theme = useAppReadingTheme();
  const { promptFn, confirmFn, renderDialogs } = useNotesDialog();
  const workbench = useNotesWorkbench({
    resumeNoteId,
    promptFn,
    confirmFn,
  });
  const [location, setLocation] = useState<NotesLocation>(() =>
    getInitialNotesLocation({ hasResumeNote: Boolean(resumeNoteId) }),
  );

  const activeFolder = useMemo<NotesFolderLocation | null>(() => {
    if (location.type === "landing") return null;
    return location.folder;
  }, [location]);

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
      setLocation({ type: "folder", folder: event.detail.folder });
    };
    const handleRootNavigate = () => setLocation(getNotesRootLocation());

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
    const selectedPath = await workbench.handlePickFile();
    if (!selectedPath) return;
    setLocation({
      type: "note",
      folder: folderFromDirectoryInfo(workbench.directoryInfo),
    });
  }, [workbench]);

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
    const folder = activeFolder ?? folderFromDirectoryInfo(workbench.directoryInfo);
    if (folder) {
      openFolder(folder);
      return;
    }
    setLocation({ type: "landing" });
  }, [activeFolder, openFolder, workbench.directoryInfo]);

  const isCurrentFolder =
    location.type === "folder" &&
    location.folder.path === workbench.directoryInfo.vaultPath;

  return (
    <DesktopAppFrame activeNavId="notes" activeWorkspace="notes" subtitle="笔记工作区" title="笔记">
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
            activePath={workbench.activePath}
            documents={workbench.graphDocuments}
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
            activePath={workbench.activePath}
            backlinks={workbench.backlinks}
            commandPaletteItems={workbench.commandPaletteItems}
            desktopCommands={workbench.desktopCommands}
            desktopTerminal={workbench.desktopTerminal}
            directoryInfo={workbench.directoryInfo}
            dirtyPaths={workbench.dirtyPaths}
            documents={workbench.documents}
            graphDocuments={workbench.graphDocuments}
            editorMode={workbench.editorMode}
            entries={workbench.entries}
            errorMessage={workbench.errorMessage}
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
            onCopyWriteConflictDiff={workbench.handleCopyWriteConflictDiff}
            onClosePath={workbench.handleClosePath}
            onCopyPath={workbench.handleCopyPath}
            onCreateNote={workbench.handleCreateNote}
            onCreateNoteInPath={workbench.handleCreateNoteInPath}
            onCreateFolderInPath={workbench.handleCreateFolderInPath}
            onDeleteActiveNote={workbench.handleDeleteActiveNote}
            onDeletePath={workbench.handleDeletePath}
            onRenamePath={workbench.handleRenamePath}
            onRevealPath={workbench.handleRevealPath}
            onMovePath={workbench.handleMovePath}
            onDocumentChange={workbench.handleDocumentChange}
            onEditorActiveLineChange={workbench.setEditorActiveLine}
            onEditorBridgeReady={workbench.setEditorBridge}
            onEditorModeChange={workbench.setEditorMode}
            onInsertSnippet={workbench.handleInsertSnippet}
            onRequestNiaContext={workbench.handleRequestNiaContext}
            onApplyNiaProposal={workbench.handleApplyNiaProposal}
            onLeftSidebarCollapsedChange={workbench.handleSetLeftSidebarCollapsed}
            onLeftSidebarModeChange={workbench.handleSetLeftSidebarMode}
            onLearningQueryChange={workbench.setLearningQuery}
            onOpenCommandPaletteChange={workbench.setCommandPaletteOpen}
            onEnsureWikiLinkNote={workbench.handleEnsureWikiLinkNote}
            onEnsureGraphDocuments={workbench.ensureGraphDocuments}
            onOpenPath={workbench.handleOpenPath}
            onOpenWikiLink={workbench.handleOpenWikiLink}
            onExportActiveDocumentHtml={workbench.handleExportActiveDocumentHtml}
            onExportActiveDocumentPdf={workbench.handleExportActiveDocumentPdf}
            onExportVault={workbench.handleExportVault}
            onFormatCjk={workbench.handleFormatActiveCjk}
            onPickDirectory={workbench.handlePickDirectory}
            onRebuildIndex={workbench.rebuildIndex}
            onRefresh={workbench.refreshSnapshot}
            onRefreshDesktopCommands={workbench.refreshDesktopCommands}
            onRenameActiveNote={workbench.handleRenameActiveNote}
            onRightSidebarCollapsedChange={workbench.handleSetRightSidebarCollapsed}
            onRightSidebarModeChange={workbench.handleSetRightSidebarMode}
            onRunDesktopCommand={workbench.handleRunDesktopCommand}
            onSaveActiveDocument={workbench.handleSaveActiveDocument}
            onSaveAllDocuments={workbench.handleSaveAllDocuments}
            onUpdateTags={workbench.handleUpdateActiveTags}
            onSearchQueryChange={workbench.setSearchQuery}
            onAcceptPendingMcpEdit={workbench.handleAcceptPendingMcpEdit}
            onKeepWriteConflict={workbench.handleKeepWriteConflict}
            onGoBack={workbench.handleGoBack}
            onGoForward={workbench.handleGoForward}
            onRejectPendingMcpEdit={workbench.handleRejectPendingMcpEdit}
            onRestoreLastDeleted={workbench.handleRestoreLastDeleted}
            onReturnToFolder={handleReturnToFolder}
            returnFolderName={activeFolder?.name ?? workbench.directoryInfo.directoryName}
            openTabs={workbench.openTabs}
            pendingMcpEdit={workbench.pendingMcpEdit}
            recentFiles={workbench.recentFiles}
            rightSidebarCollapsed={workbench.rightSidebarCollapsed}
            rightSidebarMode={workbench.rightSidebarMode}
            searchQuery={workbench.searchQuery}
            searchResults={workbench.searchResults}
            onReloadWriteConflict={workbench.handleReloadWriteConflict}
            writeConflict={workbench.writeConflict}
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
