/**
 * Undo integrity — no plugin may rewrite the document an undo or redo restores.
 *
 * Purpose: an undo must restore the document it recorded, and leave the rest
 * of the history applicable to the result.
 *
 * prosemirror-history files a transaction APPENDED to an undo in the redo
 * branch without remapping what remains in the undo branch. Any
 * `appendTransaction` that changes the document in response to an undo
 * therefore leaves the next undo replaying steps recorded for a document that
 * no longer exists (RangeError: Position out of range).
 */
import { isHistoryTransaction } from "prosemirror-history";
import { Plugin, PluginKey, type Transaction } from "prosemirror-state";

export const notesUndoIntegrityKey = new PluginKey("notesUndoIntegrity");

export interface NotesUndoIntegrityController {
  plugin: Plugin;
  dispatch(
    transaction: Transaction,
    applyAndDispatch: (tr: Transaction) => void,
  ): void;
  isApplyingHistory(): boolean;
}

export function createNotesUndoIntegrityPlugin(): NotesUndoIntegrityController {
  let activeHistoryRoot: Transaction | null = null;

  const plugin = new Plugin({
    key: notesUndoIntegrityKey,
    filterTransaction(transaction) {
      if (activeHistoryRoot === null) return true;
      if (transaction === activeHistoryRoot) return true;
      // Refuse any document modification appended to an undo or redo
      return !transaction.docChanged;
    },
  });

  return {
    plugin,
    dispatch(transaction, applyAndDispatch) {
      const outer = activeHistoryRoot;
      activeHistoryRoot = isHistoryTransaction(transaction) ? transaction : null;
      try {
        applyAndDispatch(transaction);
      } finally {
        activeHistoryRoot = outer;
      }
    },
    isApplyingHistory() {
      return activeHistoryRoot !== null;
    },
  };
}
