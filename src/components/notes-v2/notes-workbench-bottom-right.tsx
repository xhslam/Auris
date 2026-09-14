"use client";

import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { NotesBacklinksPanel } from "@/components/notes-v2/notes-backlinks-panel";
import { NotesGraphPanel } from "@/components/notes-v2/notes-graph-panel";
import { NotesOutlinePanel } from "@/components/notes-v2/notes-outline-panel";
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
import {
  DEFAULT_NOTES_VIEW_PREFERENCES,
  type NotesViewPreferences,
} from "@/features/notes/editor/notes-view-preferences";

type RightPopover =
  | "backlinks"
  | "dependency-review"
  | "graph"
  | "history"
  | "library"
  | "outline"
  | "overflow"
  | "tags";

type NotesWorkbenchBottomRightProps = {
  activeDocument: NoteDocument | null;
  backlinks: NoteDocument[];
  documentSaveState?: NotesDocumentSaveState;
  documents: NoteDocument[];
  graphDocuments?: NoteDocument[];
  editorMode: NotesEditorMode;
  indexRebuildMessage?: string | null;
  isRebuildingIndex?: boolean;
  isTerminalSplitOpen: boolean;
  learningDependencyNeedsReview?: boolean;
  learningQuery: string;
  learningSnippets: LearningSnippet[];
  noteOpenStrategy?: NoteOpenStrategy | null;
  historyVersions?: NotesHistoryVersion[];
  onDeleteActiveNote?: () => void;
  onResolveLearningDependencyReview?: () => void;
  onEditorModeChange?: (mode: NotesEditorMode) => void;
  onExportActiveDocumentHtml?: () => void;
  onExportActiveDocumentPdf?: () => void;
  onExportVault?: () => void;
  onFormatCjk?: () => void;
  onInsertSnippet?: (snippet: string) => void;
  onEnsureGraphDocuments?: () => Promise<void>;
  onRestoreHistoryVersion?: (version: NotesHistoryVersion) => void;
  onLearningQueryChange?: (value: string) => void;
  onOpenSourcePeek?: () => void;
  onJumpToHeading?: (line: number) => void;
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
  viewPreferences?: NotesViewPreferences;
  onViewPreferencesChange?: (preferences: NotesViewPreferences) => void;
};

export function NotesWorkbenchBottomRight({
  activeDocument,
  backlinks,
  documentSaveState = "saved",
  documents,
  graphDocuments = documents,
  editorMode,
  indexRebuildMessage = null,
  isRebuildingIndex = false,
  isTerminalSplitOpen,
  historyVersions = [],
  learningDependencyNeedsReview = false,
  onDeleteActiveNote,
  onEditorModeChange,
  onResolveLearningDependencyReview,
  onExportActiveDocumentHtml,
  onExportActiveDocumentPdf,
  onExportVault,
  onFormatCjk,
  onEnsureGraphDocuments,
  onRestoreHistoryVersion,
  onOpenSourcePeek,
  onJumpToHeading,
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
  viewPreferences = DEFAULT_NOTES_VIEW_PREFERENCES,
  onViewPreferencesChange,
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
  const isSplitMode = editorMode === "split";
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
      {learningDependencyNeedsReview ? (
        <button
          aria-expanded={openPopover === "dependency-review"}
          aria-label="学习依赖待复核"
          className="notes-v2__corner-stat"
          data-attention="true"
          onClick={() => togglePopover("dependency-review")}
          title="来源已变化，学习笔记需要复核"
          type="button"
        >
          待复核
        </button>
      ) : null}

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
        aria-expanded={openPopover === "graph"}
        aria-label={NOTES_UI_COPY.rightRail.graph.open}
        className="notes-v2__corner-icon"
        data-active={openPopover === "graph" ? "true" : "false"}
        onClick={() => togglePopover("graph")}
        title={NOTES_UI_COPY.rightRail.graph.open}
        type="button"
      >
        <span aria-hidden="true">⁂</span>
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
        aria-expanded={openPopover === "outline"}
        aria-label="大纲"
        className="notes-v2__corner-icon"
        disabled={!activeDocument}
        data-active={openPopover === "outline" ? "true" : "false"}
        onClick={() => togglePopover("outline")}
        title="大纲（Ctrl + Shift + 1）"
        type="button"
      >
        <span aria-hidden="true">☷</span>
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
        aria-label={NOTES_UI_COPY.toolbar.wechatSplit.label}
        aria-pressed={isSplitMode}
        className="notes-v2__corner-icon"
        data-active={isSplitMode ? "true" : "false"}
        onClick={() => onEditorModeChange?.(isSplitMode ? "wysiwyg" : "split")}
        title={NOTES_UI_COPY.toolbar.wechatSplit.title}
        type="button"
      >
        <span aria-hidden="true">◫</span>
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
        labelledBy="notes-v2-dependency-review-popover-title"
        onClose={closePopover}
        open={openPopover === "dependency-review"}
        size="sm"
      >
        <p className="notes-v2__popover-title" id="notes-v2-dependency-review-popover-title">
          学习依赖待复核
        </p>
        <p className="notes-v2__empty-copy">
          这份学习笔记引用的来源已变化。确认内容已检查后，将以当前来源刷新复核基线。
        </p>
        <div className="notes-v2__overflow-menu">
          <button
            onClick={() => {
              onResolveLearningDependencyReview?.();
              closePopover();
            }}
            type="button"
          >
            确认已复核
          </button>
        </div>
      </NotesWorkbenchPopover>

      <NotesWorkbenchPopover
        anchor="bottom-right"
        labelledBy="notes-v2-outline-popover-title"
        onClose={closePopover}
        open={openPopover === "outline"}
        size="md"
      >
        <p className="notes-v2__popover-title" id="notes-v2-outline-popover-title">
          大纲
        </p>
        <NotesOutlinePanel
          activeLine={selectionState?.line}
          document={activeDocument}
          onJumpToHeading={(line) => {
            onJumpToHeading?.(line);
            closePopover();
          }}
        />
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
        labelledBy="notes-v2-graph-popover-title"
        onClose={closePopover}
        open={openPopover === "graph"}
        size="graph"
      >
        <p className="notes-v2__popover-title" id="notes-v2-graph-popover-title">
          {NOTES_UI_COPY.panels.graph.title}
        </p>
        {/* 只在 popover 打开时挂载：图的 chunk 与 dagre 布局都不该为一个没人看的
            面板付代价，xyflow 的 ResizeObserver 也不该在零尺寸容器里空转。 */}
        {openPopover === "graph" ? (
          <NotesGraphPanel
            activePath={activeDocument?.path ?? null}
            documents={graphDocuments}
            onEnsureDocuments={onEnsureGraphDocuments}
            onOpenPath={(path) => {
              onOpenPath(path);
              closePopover();
            }}
          />
        ) : null}
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
          <button
            aria-pressed={viewPreferences.readOnly}
            onClick={() => onViewPreferencesChange?.({
              ...viewPreferences,
              readOnly: !viewPreferences.readOnly,
            })}
            type="button"
          >
            {viewPreferences.readOnly ? "退出只读" : "只读模式"}
          </button>
          <button
            aria-pressed={viewPreferences.focusMode}
            onClick={() => onViewPreferencesChange?.({
              ...viewPreferences,
              focusMode: !viewPreferences.focusMode,
            })}
            type="button"
          >
            {viewPreferences.focusMode ? "退出聚焦" : "聚焦模式"}
          </button>
          <button
            aria-pressed={viewPreferences.typewriterMode}
            onClick={() => onViewPreferencesChange?.({
              ...viewPreferences,
              typewriterMode: !viewPreferences.typewriterMode,
            })}
            type="button"
          >
            {viewPreferences.typewriterMode ? "退出打字机" : "打字机模式"}
          </button>
          <button
            onClick={() => {
              onEditorModeChange?.(editorMode === "source" ? "wysiwyg" : "source");
              closePopover();
            }}
            type="button"
          >
            {editorMode === "source" ? "返回所见即所得" : "完整源码编辑"}
          </button>
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
