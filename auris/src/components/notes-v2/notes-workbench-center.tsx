"use client";

import type { ReactNode } from "react";
import { NotesEditorPane } from "@/components/notes-v2/notes-editor-pane";
import { NotesTabs } from "@/components/notes-v2/notes-tabs";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import type {
  NotesEditorBridge,
  NotesEditorMode,
  NotesEditorSelectionState,
} from "@/features/notes/editor/editor-types";
import type { NotesViewPreferences } from "@/features/notes/editor/notes-view-preferences";

type NotesWorkbenchCenterProps = {
  activeDocument: NoteDocument | null;
  activePath: string | null;
  documents: NoteDocument[];
  errorMessage: string | null;
  isLoading: boolean;
  editorMode: NotesEditorMode;
  minimalChrome?: boolean;
  onClosePath?: (path: string) => void;
  onDocumentChange:
    | ((nextSource: string) => void)
    | ((path: string, nextSource: string) => void);
  onEditorActiveLineChange?: (line: number) => void;
  onEditorBridgeReady?: (bridge: NotesEditorBridge | null) => void;
  onEditorSelectionStateChange?: (
    selection: NotesEditorSelectionState | null,
  ) => void;
  onEnsureWikiLinkNote?: (target: string, sourcePath?: string) => void;
  onOpenPath: (path: string) => void;
  onOpenWikiLink?: (target: string) => void;
  openDocuments: NoteDocument[];
  rightToolbarActions: ReactNode;
  viewPreferences?: NotesViewPreferences;
};

export function NotesWorkbenchCenter({
  activeDocument,
  activePath,
  documents,
  errorMessage,
  isLoading,
  editorMode,
  minimalChrome = false,
  onClosePath,
  onDocumentChange,
  onEditorActiveLineChange,
  onEditorBridgeReady,
  onEditorSelectionStateChange,
  onEnsureWikiLinkNote,
  onOpenPath,
  onOpenWikiLink,
  openDocuments,
  rightToolbarActions,
  viewPreferences,
}: NotesWorkbenchCenterProps) {
  const shouldShowLoadingState = isLoading && !activeDocument;

  return (
    <div className="notes-v2__center-stack">
      {!minimalChrome ? (
        <div className="notes-v2__document-toolbar">
          <NotesTabs
            activePath={activePath}
            documents={openDocuments}
            onClosePath={onClosePath}
            onOpenPath={onOpenPath}
          />
          {rightToolbarActions}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="notes-v2__banner notes-v2__banner--error">
          {errorMessage}
        </div>
      ) : null}
      {isLoading && !shouldShowLoadingState ? (
        <div className="notes-v2__banner">{NOTES_UI_COPY.banners.loading}</div>
      ) : null}

      {shouldShowLoadingState ? (
        <section
          aria-live="polite"
          className="notes-v2__loading-state"
          data-testid="notes-v2-loading-state"
          role="status"
        >
          <span>{NOTES_UI_COPY.banners.loading}</span>
        </section>
      ) : (
        <NotesEditorPane
          document={activeDocument}
          documents={documents}
          editorMode={editorMode}
          onActiveLineChange={onEditorActiveLineChange}
          onBridgeReady={onEditorBridgeReady}
          onEnsureWikiLinkNote={onEnsureWikiLinkNote}
          onOpenWikiLink={onOpenWikiLink}
          onDocumentChange={(nextSource) => {
            if (!activeDocument) {
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
          }}
          onSelectionStateChange={onEditorSelectionStateChange}
          viewPreferences={viewPreferences}
        />
      )}
    </div>
  );
}
