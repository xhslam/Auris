"use client";

import { useCallback, useEffect, useState } from "react";
import { Toaster, toast } from "sonner";
import { DesktopAppFrame } from "@/components/desktop/desktop-app-frame";
import { NotesWorkbench } from "@/components/notes-v2/notes-workbench";
import { useNotesWorkbench } from "@/components/notes-v2/use-notes-workbench";
import { useNotesDialog } from "@/components/notes-v2/use-notes-dialog";
import { NotesWelcomeScreen } from "@/components/notes-v2/notes-welcome-screen";
import { useAppReadingTheme } from "@/features/notes/workbench/use-app-reading-theme";

type NotesPageClientProps = {
  resumeNoteId?: string | null;
};

export function NotesPageClient({ resumeNoteId = null }: NotesPageClientProps) {
  const [hasEnteredWorkbench, setHasEnteredWorkbench] = useState(false);
  const theme = useAppReadingTheme();
  const { promptFn, confirmFn, renderDialogs } = useNotesDialog();
  const workbench = useNotesWorkbench({
    resumeNoteId,
    promptFn,
    confirmFn,
  });

  // Surface workbench errors as non-blocking toast notifications.
  useEffect(() => {
    if (workbench.errorMessage) {
      toast.error(workbench.errorMessage, { duration: 5000 });
    }
  }, [workbench.errorMessage]);

  const handleCreateFile = useCallback(async () => {
    if (!workbench.directoryInfo.isConfigured) {
      const directory = await workbench.handlePickDirectory();
      if (!directory?.isConfigured) return;
    }
    await workbench.handleCreateNote();
    setHasEnteredWorkbench(true);
  }, [workbench]);

  const handleOpenFile = useCallback(async () => {
    const selectedPath = await workbench.handlePickFile();
    if (selectedPath) setHasEnteredWorkbench(true);
  }, [workbench]);

  const handleOpenFolder = useCallback(async () => {
    const directory = await workbench.handlePickDirectory();
    if (directory?.isConfigured) setHasEnteredWorkbench(true);
  }, [workbench]);

  const handleOpenRecent = useCallback((path: string) => {
    workbench.handleOpenPath(path);
    setHasEnteredWorkbench(true);
  }, [workbench]);

  return (
    <DesktopAppFrame activeNavId="notes" activeWorkspace="notes" subtitle="笔记工作区" title="笔记">
      <div
        className="notes-v2-page"
        data-entry-view={hasEnteredWorkbench ? "workbench" : "welcome"}
        data-testid="notes-page-frame"
      >
        {hasEnteredWorkbench ? <NotesWorkbench
          activePath={workbench.activePath}
          backlinks={workbench.backlinks}
          commandPaletteItems={workbench.commandPaletteItems}
          desktopCommands={workbench.desktopCommands}
          desktopTerminal={workbench.desktopTerminal}
          directoryInfo={workbench.directoryInfo}
          dirtyPaths={workbench.dirtyPaths}
          documents={workbench.documents}
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
          onCreateNote={workbench.handleCreateNote}
          onCreateNoteInPath={workbench.handleCreateNoteInPath}
          onCreateFolderInPath={workbench.handleCreateFolderInPath}
          onDeleteActiveNote={workbench.handleDeleteActiveNote}
          onDeletePath={workbench.handleDeletePath}
          onRenamePath={workbench.handleRenamePath}
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
          openTabs={workbench.openTabs}
          pendingMcpEdit={workbench.pendingMcpEdit}
          recentFiles={workbench.recentFiles}
          rightSidebarCollapsed={workbench.rightSidebarCollapsed}
          rightSidebarMode={workbench.rightSidebarMode}
          searchQuery={workbench.searchQuery}
          searchResults={workbench.searchResults}
          onReloadWriteConflict={workbench.handleReloadWriteConflict}
          writeConflict={workbench.writeConflict}
        /> : <NotesWelcomeScreen
          documents={workbench.documents}
          recentFiles={workbench.recentFiles}
          theme={theme}
          onCreateFile={handleCreateFile}
          onOpenFile={handleOpenFile}
          onOpenFolder={handleOpenFolder}
          onOpenRecent={handleOpenRecent}
        />}
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
