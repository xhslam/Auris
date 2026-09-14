"use client";

import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import type { NotesDirectoryInfo } from "@/features/notes/note-types";

type NotesWorkbenchHeaderProps = {
  activeDocument: NoteDocument | null;
  directoryInfo?: NotesDirectoryInfo;
  indexRebuildMessage?: string | null;
  isRebuildingIndex?: boolean;
  onCreateNote?: () => void;
  onDeleteActiveNote?: () => void;
  onExportActiveDocumentHtml?: () => void;
  onExportActiveDocumentPdf?: () => void;
  onExportVault?: () => void;
  onOpenCommandPaletteChange?: (open: boolean) => void;
  onRebuildIndex?: () => void;
  onRefresh?: () => void;
  onRenameActiveNote?: () => void;
};

export function NotesWorkbenchHeader({
  activeDocument,
  directoryInfo,
  indexRebuildMessage = null,
  isRebuildingIndex = false,
  onCreateNote,
  onDeleteActiveNote,
  onExportActiveDocumentHtml,
  onExportActiveDocumentPdf,
  onExportVault,
  onOpenCommandPaletteChange,
  onRebuildIndex,
  onRefresh,
  onRenameActiveNote,
}: NotesWorkbenchHeaderProps) {
  return (
    <div className="notes-v2__chrome">
      <div className="notes-v2__workspace-copy">
        <p className="notes-v2__workspace-label">
          {NOTES_UI_COPY.workspace.label}
        </p>
        <p className="notes-v2__workspace-path">
          {directoryInfo?.vaultPath ??
            directoryInfo?.directoryName ??
            NOTES_UI_COPY.workspace.sourceFirstFallback}
        </p>
        {indexRebuildMessage ? (
          <p className="notes-v2__index-status" role="status">
            {indexRebuildMessage}
          </p>
        ) : null}
      </div>

      <div className="notes-v2__actions">
        <button onClick={() => onCreateNote?.()} type="button">
          {NOTES_UI_COPY.headerActions.newNote}
        </button>
        <button onClick={() => onRenameActiveNote?.()} type="button">
          {NOTES_UI_COPY.headerActions.rename}
        </button>
        <button
          disabled={!activeDocument}
          onClick={() => onDeleteActiveNote?.()}
          type="button"
        >
          {NOTES_UI_COPY.headerActions.delete}
        </button>
        <button onClick={() => onRefresh?.()} type="button">
          {NOTES_UI_COPY.headerActions.refresh}
        </button>
        <button onClick={() => onExportVault?.()} type="button">
          {NOTES_UI_COPY.headerActions.exportVault}
        </button>
        <button
          disabled={!activeDocument}
          onClick={() => onExportActiveDocumentHtml?.()}
          type="button"
        >
          {NOTES_UI_COPY.headerActions.exportHtml}
        </button>
        <button
          disabled={!activeDocument}
          onClick={() => onExportActiveDocumentPdf?.()}
          type="button"
        >
          {NOTES_UI_COPY.headerActions.exportPdf}
        </button>
        <button
          disabled={isRebuildingIndex}
          onClick={() => onRebuildIndex?.()}
          type="button"
        >
          {NOTES_UI_COPY.headerActions.rebuildIndex}
        </button>
        <button
          onClick={() => onOpenCommandPaletteChange?.(true)}
          type="button"
        >
          {NOTES_UI_COPY.headerActions.command}
        </button>
      </div>
    </div>
  );
}
