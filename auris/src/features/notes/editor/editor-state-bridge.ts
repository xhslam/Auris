import { EditorSelection, EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { createNotesEditorExtensions } from "@/features/notes/editor/editor-extensions";
import type {
  NotesEditorBridge,
  NotesEditorChangeHandler,
  NotesEditorEnvironment,
} from "@/features/notes/editor/editor-types";
import {
  loadNotesEditorBehavior,
  type NotesEditorBehaviorSettings,
} from "@/features/notes/formatting/notes-editor-behavior";

export function createNotesEditorState(
  rawSource: string,
  onDocumentChange: NotesEditorChangeHandler,
  environment?: NotesEditorEnvironment,
  behavior: NotesEditorBehaviorSettings = loadNotesEditorBehavior(),
) {
  return EditorState.create({
    doc: rawSource,
    extensions: createNotesEditorExtensions(
      onDocumentChange,
      environment,
      behavior,
    ),
  });
}

export function createNotesEditorBridge(
  view: EditorView | null,
): NotesEditorBridge {
  return {
    focus() {
      view?.focus();
    },
    getActiveLine() {
      if (!view) {
        return 0;
      }

      return view.state.doc.lineAt(view.state.selection.main.head).number - 1;
    },
    getSelection() {
      if (!view) {
        return null;
      }

      const selection = view.state.selection.main;
      const selectedText = view.state.doc.sliceString(selection.from, selection.to);

      return {
        from: selection.from,
        line: view.state.doc.lineAt(selection.head).number - 1,
        text: selectedText,
        to: selection.to,
      };
    },
    getSource() {
      return view?.state.doc.toString() ?? "";
    },
    insertSnippet(snippet: string) {
      if (!view) {
        return;
      }

      const selection = view.state.selection.main;
      const insertion = snippet.trim();

      view.dispatch({
        changes: {
          from: selection.from,
          insert: insertion,
          to: selection.to,
        },
        selection: EditorSelection.cursor(selection.from + insertion.length),
      });
      view.focus();
    },
    setSelection(from: number, to: number) {
      if (!view) {
        return;
      }

      const docLength = view.state.doc.length;
      const start = Math.min(Math.max(Math.min(from, to), 0), docLength);
      const end = Math.min(Math.max(Math.max(from, to), 0), docLength);

      view.dispatch({
        selection: EditorSelection.range(start, end),
        scrollIntoView: true,
      });
      view.focus();
    },
    revealLine(line: number) {
      if (!view) {
        return;
      }

      const targetLine = view.state.doc.line(
        Math.min(Math.max(line + 1, 1), view.state.doc.lines),
      );

      view.dispatch({
        selection: EditorSelection.cursor(targetLine.from),
        scrollIntoView: true,
      });
      view.focus();
    },
    view,
  };
}
