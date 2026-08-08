"use client";

import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { NotesBacklinksPanel } from "@/components/notes-v2/notes-backlinks-panel";
import {
  NotesLibraryNavigatorPanel,
} from "@/components/notes-v2/notes-library-navigator-panel";
import { NotesTagEditor } from "@/components/notes-v2/notes-tag-editor";
import { NotesWorkbenchPopover } from "@/components/notes-v2/notes-workbench-popover";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import type { NoteOpenStrategy } from "@/features/notes/documents/note-open-strategy";
import type {
  NotesEditorMode,
  NotesEditorSelectionState,
} from "@/features/notes/editor/editor-types";
import { getNotesTextMetrics } from "@/features/notes/editor/notes-text-metrics";
import type { LearningSnippet } from "@/features/notes/integrations/learning-snippets";
import type { NotesHistoryVersion } from "@/features/notes/persistence/notes-recovery-store";
import type { NotesDocumentSaveState } from "@/features/notes/workbench/notes-document-save-state";

type RightPopover = "backlinks" | "history" | "library" | "overflow" | "tags";

type NotesWorkbenchBottomRightProps = {
  activeDocument: NoteDocument | null;
  backlinks: NoteDocument[];
  documentSaveState?: NotesDocumentSaveState;
  documents: NoteDocument[];
  editorMode: NotesEditorMode;
  indexRebuildMessage?: string | null;
  isRebuildingIndex?: boolean;
  isTerminalSplitOpen: boolean;
  learningQuery: string;
  learningSnippets: LearningSnippet[];
  noteOpenStrategy?: NoteOpenStrategy | null;
  historyVersions?: NotesHistoryVersion[];
  onDeleteActiveNote?: () => void;
  onEditorModeChange?: (mode: NotesEditorMode) => void;
  onExportActiveDocumentHtml?: () => void;
  onExportActiveDocumentPdf?: () => void;
  onExportVault?: () => void;
  onFormatCjk?: () => void;
  onInsertSnippet?: (snippet: string) => void;
  onRestoreHistoryVersion?: (version: NotesHistoryVersion) => void;
  onLearningQueryChange?: (value: string) => void;
  onOpenSourcePeek?: () => void;
  onOpenPath: (path: string) => void;
  onRebuildIndex?: () => void;
  onRefresh?: () => void;
  onRestoreLastDeleted?: () => void;
  onRenameActiveNote?: () => void;
  onSearchQueryChange?: (value: string) => void;
  onTerminalSplitToggle: () => void;
  onUpdateTags?: (tags: string[]) => void;
  recentDocuments: NoteDocument[];
  searchQuery: string;
  searchResults: NoteDocument[];
  selectionState?: NotesEditorSelectionState | null;
};

export function NotesWorkbenchBottomRight({
  activeDocument,
  backlinks,
  documentSaveState = "saved",
  documents,
  editorMode,
  indexRebuildMessage = null,
  isRebuildingIndex = false,
  isTerminalSplitOpen,
  historyVersions = [],
  onDeleteActiveNote,
  onEditorModeChange,
  onExportActiveDocumentHtml,
  onExportActiveDocumentPdf,
  onExportVault,
  onFormatCjk,
  onRestoreHistoryVersion,
  onOpenSourcePeek,
  onOpenPath,
  onRebuildIndex,
  onRefresh,
  onRestoreLastDeleted,
  onRenameActiveNote,
  onSearchQueryChange,
  onTerminalSplitToggle,
  onUpdateTags,
  recentDocuments,
  searchQuery,
  searchResults,
  selectionState,
}: NotesWorkbenchBottomRightProps) {
  const [openPopover, setOpenPopover] = useState<RightPopover | null>(null);
  const deferredSource = useDeferredValue(activeDocument?.rawSource ?? "");
  const metrics = useMemo(
    () => getNotesTextMetrics(deferredSource),
    [deferredSource],
  );
  const selectionLength = selectionState
    ? Math.abs(selectionState.to - selectionState.from)
    : 0;
  const closePopover = useCallback(() => setOpenPopover(null), []);
  const togglePopover = useCallback((popover: RightPopover) => {
    setOpenPopover((current) => (current === popover ? null : popover));
  }, []);
  const isSourceMode = editorMode === "source";
  const editorToggleLabel = isSourceMode
    ? NOTES_UI_COPY.toolbar.displayEditing
    : NOTES_UI_COPY.toolbar.source;
  const saveStateLabel = {
    conflict: "保存冲突",
    saved: "已保存",
    saving: "保存中…",
  }[documentSaveState];

  return (
    <div className="notes-v2__corner-cluster notes-v2__corner-cluster--right">
      <span
        className="notes-v2__corner-stat"
        data-save-state={documentSaveState}
      >
        {saveStateLabel}
      </span>
      <span className="notes-v2__corner-stat">{metrics.words} 词</span>
      <span className="notes-v2__corner-stat">{metrics.characters} 字符</span>

      <button
        aria-expanded={openPopover === "history"}
        aria-label="历史版本"
        className="notes-v2__corner-icon"
        onClick={() => togglePopover("history")}
        title="历史版本"
        type="button"
      >
        <span aria-hidden="true">◷</span>
      </button>
      <button
        aria-expanded={openPopover === "backlinks"}
        aria-label={NOTES_UI_COPY.rightRail.backlinks.open}
        className="notes-v2__corner-icon"
        onClick={() => togglePopover("backlinks")}
        title={NOTES_UI_COPY.rightRail.backlinks.open}
        type="button"
      >
        <span aria-hidden="true">↶</span>
      </button>
      <button
        aria-expanded={openPopover === "tags"}
        aria-label="标签"
        className="notes-v2__corner-icon"
        disabled={!activeDocument}
        onClick={() => togglePopover("tags")}
        title="标签（仅用于检索）"
        type="button"
      >
        <span aria-hidden="true">#</span>
      </button>
      <button
        aria-pressed={isTerminalSplitOpen}
        aria-label={NOTES_UI_COPY.rightRail.terminal.open}
        className="notes-v2__corner-icon"
        data-active={isTerminalSplitOpen ? "true" : "false"}
        onClick={onTerminalSplitToggle}
        title={NOTES_UI_COPY.rightRail.terminal.open}
        type="button"
      >
        <span aria-hidden="true">›_</span>
      </button>
      <button
        aria-label={editorToggleLabel}
        aria-pressed={isSourceMode}
        className="notes-v2__corner-icon"
        data-active={isSourceMode ? "true" : "false"}
        onClick={() => {
          if (isSourceMode) {
            onEditorModeChange?.("wysiwyg");
            return;
          }

          onOpenSourcePeek?.();
        }}
        title={editorToggleLabel}
        type="button"
      >
        <span aria-hidden="true">T</span>
      </button>
      <button
        aria-expanded={openPopover === "library"}
        aria-label={NOTES_UI_COPY.rightRail.library.open}
        className="notes-v2__corner-icon"
        onClick={() => togglePopover("library")}
        title={NOTES_UI_COPY.rightRail.library.open}
        type="button"
      >
        <span aria-hidden="true">≡</span>
      </button>
      <button
        aria-expanded={openPopover === "overflow"}
        aria-label="More note actions"
        className="notes-v2__corner-icon"
        onClick={() => togglePopover("overflow")}
        title="More note actions"
        type="button"
      >
        <span aria-hidden="true">…</span>
      </button>

      <NotesWorkbenchPopover
        anchor="bottom-right"
        labelledBy="notes-v2-history-popover-title"
        onClose={closePopover}
        open={openPopover === "history"}
        size="sm"
      >
        <p className="notes-v2__popover-title" id="notes-v2-history-popover-title">
          历史版本
        </p>
        <div className="notes-v2__overflow-menu">
          {historyVersions.length === 0 ? (
            <p className="notes-v2__empty-copy">保存后会在这里生成版本。</p>
          ) : (
            historyVersions.map((version) => (
              <button
                key={version.id}
                onClick={() => {
                  onRestoreHistoryVersion?.(version);
                  closePopover();
                }}
                type="button"
              >
                恢复 {new Date(version.savedAt).toLocaleString()}
              </button>
            ))
          )}
        </div>
      </NotesWorkbenchPopover>

      <NotesWorkbenchPopover
        anchor="bottom-right"
        labelledBy="notes-v2-backlinks-popover-title"
        onClose={closePopover}
        open={openPopover === "backlinks"}
        size="md"
      >
        <p className="notes-v2__popover-title" id="notes-v2-backlinks-popover-title">
          {NOTES_UI_COPY.rightDock.backlinks.label}
        </p>
        <NotesBacklinksPanel
          activeDocument={activeDocument}
          backlinks={backlinks}
          documents={documents}
          onOpenPath={onOpenPath}
        />
      </NotesWorkbenchPopover>

      <NotesWorkbenchPopover
        anchor="bottom-right"
        labelledBy="notes-v2-tags-popover-title"
        onClose={closePopover}
        open={openPopover === "tags"}
        size="sm"
      >
        <p className="notes-v2__popover-title" id="notes-v2-tags-popover-title">
          标签
        </p>
        <NotesTagEditor
          disabled={!activeDocument}
          onChange={(tags) => onUpdateTags?.(tags)}
          tags={activeDocument?.parsed.tags ?? []}
        />
      </NotesWorkbenchPopover>

      <NotesWorkbenchPopover
        anchor="bottom-right"
        labelledBy="notes-v2-library-popover-title"
        onClose={closePopover}
        open={openPopover === "library"}
        size="md"
      >
        <p className="notes-v2__popover-title" id="notes-v2-library-popover-title">
          {NOTES_UI_COPY.panels.library.title}
        </p>
        <NotesLibraryNavigatorPanel
          documents={documents}
          onClose={closePopover}
          onOpenPath={onOpenPath}
          onSearchQueryChange={onSearchQueryChange}
          recentDocuments={recentDocuments}
          searchQuery={searchQuery}
          searchResults={searchResults}
        />
      </NotesWorkbenchPopover>

      <NotesWorkbenchPopover
        anchor="bottom-right"
        labelledBy="notes-v2-overflow-popover-title"
        onClose={closePopover}
        open={openPopover === "overflow"}
        size="sm"
      >
        <p className="notes-v2__popover-title" id="notes-v2-overflow-popover-title">
          More
        </p>
        <dl className="notes-v2__overflow-stats">
          <div className="notes-v2__overflow-stat-row">
            <dt>状态</dt>
            <dd data-save-state={documentSaveState}>{saveStateLabel}</dd>
          </div>
          <div className="notes-v2__overflow-stat-row">
            <dt>反向链接</dt>
            <dd>{backlinks.length} 条</dd>
          </div>
          {selectionState ? (
            <div className="notes-v2__overflow-stat-row">
              <dt>{selectionLength > 0 ? "选中" : "光标"}</dt>
              <dd>
                {selectionLength > 0
                  ? `${selectionLength} 字`
                  : `行 ${selectionState.line + 1}`}
              </dd>
            </div>
          ) : null}
        </dl>
        <div className="notes-v2__overflow-menu">
          <button onClick={() => onRenameActiveNote?.()} type="button">
            {NOTES_UI_COPY.headerActions.rename}
          </button>
          <button onClick={() => onRefresh?.()} type="button">
            {NOTES_UI_COPY.headerActions.refresh}
          </button>
          <button onClick={() => onRestoreLastDeleted?.()} type="button">
            恢复最近删除
          </button>
          <button
            disabled={isRebuildingIndex}
            onClick={() => onRebuildIndex?.()}
            type="button"
          >
            {NOTES_UI_COPY.headerActions.rebuildIndex}
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
            disabled={!activeDocument}
            onClick={() => onFormatCjk?.()}
            type="button"
          >
            {NOTES_UI_COPY.headerActions.formatCjk}
          </button>
          <button
            className="notes-v2__overflow-danger"
            disabled={!activeDocument}
            onClick={() => onDeleteActiveNote?.()}
            type="button"
          >
            {NOTES_UI_COPY.headerActions.delete}
          </button>
        </div>
        {indexRebuildMessage ? (
          <p className="notes-v2__overflow-status" role="status">
            {indexRebuildMessage}
          </p>
        ) : null}
      </NotesWorkbenchPopover>
    </div>
  );
}
