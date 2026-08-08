import { type EditorState, type Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  columnIsHeader,
  deleteColumn,
  deleteRow,
  deleteTable,
  mergeCells,
  rowIsHeader,
  selectedRect,
  splitCell,
  tableNodeTypes,
  toggleHeaderCell,
  toggleHeaderColumn,
  toggleHeaderRow,
  isInTable,
} from "prosemirror-tables";

export type NotesRichTableToolbarAction =
  | "addRowBefore"
  | "addRowAfter"
  | "addColumnBefore"
  | "addColumnAfter"
  | "deleteRow"
  | "deleteColumn"
  | "deleteTable"
  | "mergeCells"
  | "splitCell"
  | "toggleHeaderRow"
  | "toggleHeaderColumn"
  | "toggleHeaderCell";

export type NotesRichTableToolbarState = {
  canAddColumnAfter: boolean;
  canAddColumnBefore: boolean;
  canAddRowAfter: boolean;
  canAddRowBefore: boolean;
  canDeleteColumn: boolean;
  canDeleteRow: boolean;
  canDeleteTable: boolean;
  canMergeCells: boolean;
  canSplitCell: boolean;
  canToggleHeaderCell: boolean;
  canToggleHeaderColumn: boolean;
  canToggleHeaderRow: boolean;
  headerCellActive: boolean;
  headerColumnActive: boolean;
  headerRowActive: boolean;
  visible: boolean;
};

export type NotesRichTableToolbarView = Pick<
  EditorView,
  "dispatch" | "focus" | "state"
>;

const TABLE_COMMANDS: Record<
  NotesRichTableToolbarAction,
  (state: EditorState, dispatch?: ((tr: Transaction) => void) | undefined) => boolean
> = {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  deleteTable,
  mergeCells,
  splitCell,
  toggleHeaderCell,
  toggleHeaderColumn,
  toggleHeaderRow,
};

function canRunTableCommand(
  state: EditorState,
  command: (state: EditorState, dispatch?: ((tr: Transaction) => void) | undefined) => boolean,
) {
  return command(state, undefined);
}

function getHeaderCellActive(state: EditorState) {
  if (!isInTable(state)) {
    return false;
  }

  const rect = selectedRect(state);
  const headerCellType = tableNodeTypes(state.schema).header_cell;

  return rect.map
    .cellsInRect(rect)
    .every((cellPos) => rect.table.nodeAt(cellPos)?.type === headerCellType);
}

export function getNotesRichTableToolbarState(
  state: EditorState,
): NotesRichTableToolbarState {
  const visible = isInTable(state);

  if (!visible) {
    return {
      canAddColumnAfter: false,
      canAddColumnBefore: false,
      canAddRowAfter: false,
      canAddRowBefore: false,
      canDeleteColumn: false,
      canDeleteRow: false,
      canDeleteTable: false,
      canMergeCells: false,
      canSplitCell: false,
      canToggleHeaderCell: false,
      canToggleHeaderColumn: false,
      canToggleHeaderRow: false,
      headerCellActive: false,
      headerColumnActive: false,
      headerRowActive: false,
      visible: false,
    };
  }

  const rect = selectedRect(state);

  return {
    canAddColumnAfter: canRunTableCommand(state, addColumnAfter),
    canAddColumnBefore: canRunTableCommand(state, addColumnBefore),
    canAddRowAfter: canRunTableCommand(state, addRowAfter),
    canAddRowBefore: canRunTableCommand(state, addRowBefore),
    canDeleteColumn: canRunTableCommand(state, deleteColumn),
    canDeleteRow: canRunTableCommand(state, deleteRow),
    canDeleteTable: canRunTableCommand(state, deleteTable),
    canMergeCells: canRunTableCommand(state, mergeCells),
    canSplitCell: canRunTableCommand(state, splitCell),
    canToggleHeaderCell: canRunTableCommand(state, toggleHeaderCell),
    canToggleHeaderColumn: canRunTableCommand(state, toggleHeaderColumn),
    canToggleHeaderRow: canRunTableCommand(state, toggleHeaderRow),
    headerCellActive: getHeaderCellActive(state),
    headerColumnActive: columnIsHeader(rect.map, rect.table, rect.left),
    headerRowActive: rowIsHeader(rect.map, rect.table, rect.top),
    visible: true,
  };
}

export function runNotesRichTableToolbarAction(
  view: NotesRichTableToolbarView,
  action: NotesRichTableToolbarAction,
) {
  const command = TABLE_COMMANDS[action];
  const didRun = command(view.state, (tr) => view.dispatch(tr));

  if (didRun) {
    view.focus();
  }

  return didRun;
}
