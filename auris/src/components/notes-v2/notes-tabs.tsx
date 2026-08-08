"use client";

import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import type { NoteDocument } from "@/features/notes/documents/document-types";

type NotesTabsProps = {
  activePath: string | null;
  documents: NoteDocument[];
  onClosePath?: (path: string) => void;
  onOpenPath: (path: string) => void;
};

export function NotesTabs({
  activePath,
  documents,
  onClosePath,
  onOpenPath,
}: NotesTabsProps) {
  return (
    <div
      aria-label={NOTES_UI_COPY.tabs.openTabs}
      className="notes-v2__tabs"
      role="tablist"
    >
      {documents.map((document) => (
        <div className="notes-v2__tab-shell" key={document.path}>
          <button
            aria-selected={activePath === document.path}
            className="notes-v2__tab"
            data-active={activePath === document.path ? "true" : "false"}
            onClick={() => onOpenPath(document.path)}
            role="tab"
            type="button"
          >
            {document.parsed.title ?? document.fileName}
          </button>

          {onClosePath ? (
            <button
              aria-label={`${NOTES_UI_COPY.tabs.closePrefix} ${document.parsed.title ?? document.fileName}`}
              className="notes-v2__tab-close"
              onClick={() => onClosePath(document.path)}
              type="button"
            >
              x
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
