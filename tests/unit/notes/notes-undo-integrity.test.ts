import { describe, expect, it } from "vitest";
import { EditorState, Plugin, type Transaction } from "prosemirror-state";
import { schema as basicSchema } from "prosemirror-schema-basic";
import { history, undo } from "prosemirror-history";
import { createNotesUndoIntegrityPlugin } from "@/features/notes/editor/notes-undo-integrity";

describe("notes-undo-integrity", () => {
  it("permits normal user edits and document changes", () => {
    const undoIntegrity = createNotesUndoIntegrityPlugin();
    const state = EditorState.create({
      schema: basicSchema,
      plugins: [history(), undoIntegrity.plugin],
    });

    const tr = state.tr.insertText("Hello world", 1);
    let appliedState = state;
    undoIntegrity.dispatch(tr, (t) => {
      appliedState = state.apply(t);
    });

    expect(appliedState.doc.textContent).toBe("Hello world");
  });

  it("blocks appended document changes during an undo transaction while allowing the undo itself", () => {
    const undoIntegrity = createNotesUndoIntegrityPlugin();

    let attemptedAppendCount = 0;
    // Simulate a normalizer plugin (like footnote cleanup or table repair) that tries to append a doc modification
    const rogueNormalizer = new Plugin({
      appendTransaction(transactions, oldState, newState) {
        if (transactions.some((t) => t.docChanged)) {
          attemptedAppendCount += 1;
          // Attempt to modify the document further
          return newState.tr.insertText(" [normalized]", newState.doc.content.size - 1);
        }
        return null;
      },
    });

    let state = EditorState.create({
      schema: basicSchema,
      plugins: [history(), undoIntegrity.plugin, rogueNormalizer],
    });

    // Step 1: user types "A"
    const tr1 = state.tr.insertText("A", 1);
    undoIntegrity.dispatch(tr1, (t) => {
      state = state.apply(t);
    });
    // Normalizer appended during user edit
    expect(state.doc.textContent).toBe("A [normalized]");
    expect(attemptedAppendCount).toBe(1);

    // Step 2: user triggers Undo
    let undoTr: Transaction | null = null;
    undo(state, (t) => {
      undoTr = t;
    });
    expect(undoTr).not.toBeNull();

    // Dispatch the undo transaction through undoIntegrity
    undoIntegrity.dispatch(undoTr!, (t) => {
      state = state.apply(t);
    });

    // The undo restored the empty document, and the normalizer's appended change was rejected!
    expect(state.doc.textContent).toBe("");
  });
});
