"use client";

import { useCallback } from "react";
import { NotesFileTree } from "@/components/notes-v2/notes-file-tree";
import { NotesWorkbenchPopover } from "@/components/notes-v2/notes-workbench-popover";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import type { NotesDirectoryInfo } from "@/features/notes/note-types";
import type { VaultEntry } from "@/features/notes/vault/vault-types";

type NotesWorkbenchBottomLeftProps = {
  activeDocument: NoteDocument | null;
  activePath: string | null;
  canGoBack?: boolean;
  canGoForward?: boolean;
  directoryInfo?: NotesDirectoryInfo;
  entries: VaultEntry[];
  onCreateNote?: () => void;
  onCreateNoteInPath?: (folderPath: string) => void;
  onCreateFolderInPath?: (parentPath: string) => void;
  onDeletePath?: (path: string, kind: "directory" | "file") => void;
  onGoBack?: () => void;
  onGoForward?: () => void;
  onRenamePath?: (path: string, kind: "directory" | "file") => void;
  onMovePath?: (sourcePath: string, targetFolderPath: string) => void;
  onOpenPath: (path: string) => void;
  onPickDirectory?: () => void;
  openPopover: "workspace" | null;
  setOpenPopover: (popover: "workspace" | null) => void;
};

function getDocumentTitle(document: NoteDocument | null) {
  return document?.parsed.title ?? document?.fileName ?? "Untitled-1";
}

export function NotesWorkbenchBottomLeft({
  activeDocument,
  activePath,
  canGoBack = false,
  canGoForward = false,
  directoryInfo,
  entries,
  onCreateNote,
  onCreateNoteInPath,
  onCreateFolderInPath,
  onDeletePath,
  onGoBack,
  onGoForward,
  onRenamePath,
  onMovePath,
  onOpenPath,
  onPickDirectory,
  openPopover,
  setOpenPopover,
}: NotesWorkbenchBottomLeftProps) {
  const closePopover = useCallback(() => setOpenPopover(null), [setOpenPopover]);

  return (
    <div className="notes-v2__corner-cluster notes-v2__corner-cluster--left">
      <button
        aria-label="返回上一个打开的文件"
        className="notes-v2__corner-icon"
        disabled={!canGoBack}
        onClick={() => onGoBack?.()}
        title="返回上一个打开的文件 (Alt + ←)"
        type="button"
      >
        <span aria-hidden="true">←</span>
      </button>
      <button
        aria-label="前进到下一个打开的文件"
        className="notes-v2__corner-icon"
        disabled={!canGoForward}
        onClick={() => onGoForward?.()}
        title="前进到下一个打开的文件 (Alt + →)"
        type="button"
      >
        <span aria-hidden="true">→</span>
      </button>
      <button
        aria-label={`Open workspace switcher for ${getDocumentTitle(activeDocument)}`}
        className="notes-v2__active-note-pill"
        onClick={() =>
          setOpenPopover(openPopover === "workspace" ? null : "workspace")
        }
        suppressHydrationWarning
        title={activeDocument?.path ?? directoryInfo?.vaultPath ?? undefined}
        type="button"
      >
        {getDocumentTitle(activeDocument)}
      </button>
      <button
        aria-label={NOTES_UI_COPY.headerActions.newNote}
        className="notes-v2__corner-icon"
        onClick={() => onCreateNote?.()}
        title={NOTES_UI_COPY.headerActions.newNote}
        type="button"
      >
        <span aria-hidden="true">+</span>
      </button>

      <NotesWorkbenchPopover
        anchor="bottom-left"
        labelledBy="notes-v2-workspace-popover-title"
        onClose={closePopover}
        open={openPopover === "workspace"}
        size="md"
      >
        <p className="notes-v2__sr-only" id="notes-v2-workspace-popover-title">
          Workspace
        </p>
        {directoryInfo?.isConfigured === false && onPickDirectory ? (
          <div className="notes-v2__popover-header">
            <button onClick={() => onPickDirectory()} type="button">
              {NOTES_UI_COPY.leftPane.files.chooseFolder}
            </button>
          </div>
        ) : null}
        <div className="notes-v2__workspace-popover-files notes-v2__workspace-popover-files--single">
          <NotesFileTree
            activePath={activePath}
            collapseAllByDefault
            entries={entries}
            onOpenPath={(path) => {
              onOpenPath(path);
              closePopover();
            }}
            onCreateNoteInPath={onCreateNoteInPath}
            onCreateFolderInPath={onCreateFolderInPath}
            onDeletePath={onDeletePath}
            onRenamePath={onRenamePath}
            onMovePath={onMovePath}
            variant="obsidian"
          />
        </div>
      </NotesWorkbenchPopover>
    </div>
  );
}
