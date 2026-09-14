"use client";

import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import type { VaultWriteConflict } from "@/features/notes/vault/vault-write-conflict";

type NotesWriteConflictDialogProps = {
  conflict: VaultWriteConflict;
  onCopyDiff: () => void;
  onKeepLocalVersion: () => void;
  onReload: () => void;
};

export function NotesWriteConflictDialog({
  conflict,
  onCopyDiff,
  onKeepLocalVersion,
  onReload,
}: NotesWriteConflictDialogProps) {
  return (
    <div className="notes-v2__conflict-backdrop" role="presentation">
      <section
        aria-label={NOTES_UI_COPY.dialogs.externalEditorConflict.title}
        className="notes-v2__conflict-dialog"
        role="dialog"
      >
        <div className="notes-v2__conflict-header">
          <div>
            <p className="notes-v2__conflict-eyebrow">
              {NOTES_UI_COPY.dialogs.externalEditorConflict.eyebrow}
            </p>
            <h2>{NOTES_UI_COPY.dialogs.externalEditorConflict.title}</h2>
          </div>
          <p className="notes-v2__conflict-path">{conflict.path}</p>
        </div>

        <p className="notes-v2__conflict-copy">
          {NOTES_UI_COPY.dialogs.externalEditorConflict.description}
        </p>

        <div className="notes-v2__conflict-actions">
          <button onClick={onReload} type="button">
            {NOTES_UI_COPY.dialogs.externalEditorConflict.reload}
          </button>
          <button onClick={onKeepLocalVersion} type="button">
            {NOTES_UI_COPY.dialogs.externalEditorConflict.keepLocalVersion}
          </button>
          <button onClick={onCopyDiff} type="button">
            {NOTES_UI_COPY.dialogs.externalEditorConflict.copyDiff}
          </button>
        </div>
      </section>
    </div>
  );
}
