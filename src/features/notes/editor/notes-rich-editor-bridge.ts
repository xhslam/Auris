import {
  Selection,
  TextSelection,
  type EditorState,
} from "prosemirror-state";
import { Slice } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import { cancelNotesScrollRestore } from "@/features/notes/editor/notes-scroll-memory";
import { parseNotesRichMarkdown, serializeNotesRichMarkdown } from "@/features/notes/editor/notes-rich-markdown";
import type {
  NotesEditorBridge,
  NotesEditorSelectionState,
} from "@/features/notes/editor/editor-types";

function clampPosition(state: EditorState, value: number) {
  return Math.min(Math.max(Math.round(value), 0), state.doc.content.size);
}

function getLineAndColumnFromPosition(state: EditorState, position: number) {
  const prefix = state.doc.textBetween(0, clampPosition(state, position), "\n");

  if (!prefix) {
    return { column: 0, line: 0 };
  }

  const lines = prefix.split("\n");
  const line = lines.length - 1;
  const column = lines[line].length;

  return { column, line };
}

function getLineFromPosition(state: EditorState, position: number) {
  return getLineAndColumnFromPosition(state, position).line;
}

function getSelectionState(view: EditorView): NotesEditorSelectionState {
  const selection = view.state.selection;
  const { from, to } = selection;
  const selectedText = view.state.doc.textBetween(from, to, "\n");
  const { line, column } = getLineAndColumnFromPosition(view.state, selection.head);

  return {
    column,
    from,
    line,
    text: selectedText,
    to,
  };
}

function createSelection(state: EditorState, from: number, to: number) {
  const start = clampPosition(state, Math.min(from, to));
  const end = clampPosition(state, Math.max(from, to));

  if (start === end) {
    return TextSelection.create(state.doc, start);
  }

  return TextSelection.create(state.doc, start, end);
}

function findApproximatePositionForLine(state: EditorState, line: number) {
  const targetLine = Math.max(0, Math.floor(line));
  let currentLine = 0;
  let targetPosition = 0;
  let found = false;

  state.doc.forEach((node, offset) => {
    if (found) {
      return;
    }

    const lineCount = Math.max(1, node.textContent.split(/\r?\n/).length);

    if (currentLine + lineCount > targetLine) {
      targetPosition = offset + 1;
      found = true;
      return;
    }

    currentLine += lineCount;
    targetPosition = offset + node.nodeSize;
  });

  return targetPosition;
}

export function createNotesRichEditorBridge(
  view: EditorView | null,
  openSourcePeek?: () => boolean,
  isReadOnly: () => boolean = () => false,
): NotesEditorBridge {
  return {
    focus() {
      view?.focus();
    },
    getActiveLine() {
      if (!view) {
        return 0;
      }

      return getLineFromPosition(view.state, view.state.selection.head);
    },
    getSelection() {
      if (!view) {
        return null;
      }

      return getSelectionState(view);
    },
    getSource() {
      return view ? serializeNotesRichMarkdown(view.state.doc) : "";
    },
    insertSnippet(snippet: string) {
      if (!view || isReadOnly()) {
        return;
      }

      const insertion = snippet.trim();

      if (!insertion) {
        return;
      }

      const parsedSnippet = parseNotesRichMarkdown(insertion);
      const tr = view.state.tr
        .replaceSelection(new Slice(parsedSnippet.content, 0, 0))
        .scrollIntoView();

      view.dispatch(tr);
      view.focus();
    },
    openSourcePeek: () => !isReadOnly() && Boolean(openSourcePeek?.()),
    revealLine(line: number) {
      if (!view) {
        return;
      }

      cancelNotesScrollRestore();
      const targetPosition = findApproximatePositionForLine(view.state, line);
      // ProseMirror ignores scrollToSelection while the DOM selection belongs
      // outside this view. Claim focus before dispatching the explicit jump.
      view.focus();
      view.dispatch(
        view.state.tr
          .setSelection(Selection.near(view.state.doc.resolve(targetPosition), 1))
          .scrollIntoView(),
      );
    },
    setSelection(from: number, to: number) {
      if (!view) {
        return;
      }

      cancelNotesScrollRestore();
      view.focus();
      view.dispatch(
        view.state.tr
          .setSelection(createSelection(view.state, from, to))
          .scrollIntoView(),
      );
    },
    view,
  };
}
