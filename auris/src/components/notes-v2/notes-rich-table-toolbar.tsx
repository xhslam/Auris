"use client";

import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import type {
  NotesRichTableToolbarAction,
  NotesRichTableToolbarState,
} from "@/features/notes/editor/editor-table-toolbar";

type NotesRichTableToolbarProps = {
  state: NotesRichTableToolbarState | null;
  onAction: (action: NotesRichTableToolbarAction) => void;
};

export function NotesRichTableToolbar({
  state,
  onAction,
}: NotesRichTableToolbarProps) {
  if (!state?.visible) {
    return null;
  }

  return (
    <div
      aria-label={NOTES_UI_COPY.toolbar.table.toolbarLabel}
      className="notes-v2__table-toolbar"
      role="toolbar"
    >
      <span className="notes-v2__table-toolbar-label">
        {NOTES_UI_COPY.toolbar.table.label}
      </span>

      <div className="notes-v2__table-toolbar-actions">
        <button
          aria-pressed={state.headerRowActive}
          data-active={state.headerRowActive ? "true" : "false"}
          disabled={!state.canToggleHeaderRow}
          onClick={() => onAction("toggleHeaderRow")}
          type="button"
        >
          {NOTES_UI_COPY.toolbar.table.headerRow}
        </button>
        <button
          aria-pressed={state.headerColumnActive}
          data-active={state.headerColumnActive ? "true" : "false"}
          disabled={!state.canToggleHeaderColumn}
          onClick={() => onAction("toggleHeaderColumn")}
          type="button"
        >
          {NOTES_UI_COPY.toolbar.table.headerColumn}
        </button>
        <button
          aria-pressed={state.headerCellActive}
          data-active={state.headerCellActive ? "true" : "false"}
          disabled={!state.canToggleHeaderCell}
          onClick={() => onAction("toggleHeaderCell")}
          type="button"
        >
          {NOTES_UI_COPY.toolbar.table.headerCell}
        </button>
        <button
          disabled={!state.canAddRowBefore}
          onClick={() => onAction("addRowBefore")}
          type="button"
        >
          {NOTES_UI_COPY.toolbar.table.addRowBefore}
        </button>
        <button
          disabled={!state.canAddRowAfter}
          onClick={() => onAction("addRowAfter")}
          type="button"
        >
          {NOTES_UI_COPY.toolbar.table.addRowAfter}
        </button>
        <button
          disabled={!state.canAddColumnBefore}
          onClick={() => onAction("addColumnBefore")}
          type="button"
        >
          {NOTES_UI_COPY.toolbar.table.addColumnBefore}
        </button>
        <button
          disabled={!state.canAddColumnAfter}
          onClick={() => onAction("addColumnAfter")}
          type="button"
        >
          {NOTES_UI_COPY.toolbar.table.addColumnAfter}
        </button>
        <button
          disabled={!state.canMergeCells}
          onClick={() => onAction("mergeCells")}
          type="button"
        >
          {NOTES_UI_COPY.toolbar.table.mergeCells}
        </button>
        <button
          disabled={!state.canSplitCell}
          onClick={() => onAction("splitCell")}
          type="button"
        >
          {NOTES_UI_COPY.toolbar.table.splitCell}
        </button>
        <button
          disabled={!state.canDeleteRow}
          onClick={() => onAction("deleteRow")}
          type="button"
        >
          {NOTES_UI_COPY.toolbar.table.deleteRow}
        </button>
        <button
          disabled={!state.canDeleteColumn}
          onClick={() => onAction("deleteColumn")}
          type="button"
        >
          {NOTES_UI_COPY.toolbar.table.deleteColumn}
        </button>
        <button
          disabled={!state.canDeleteTable}
          onClick={() => onAction("deleteTable")}
          type="button"
        >
          {NOTES_UI_COPY.toolbar.table.deleteTable}
        </button>
      </div>
    </div>
  );
}
