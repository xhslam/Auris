import { EditorSelection, type EditorState } from "@codemirror/state";
import { type EditorView } from "@codemirror/view";

export type BlockBounds = {
  from: number;
  to: number;
};

function isBlank(text: string): boolean {
  return text.trim().length === 0;
}

const FENCE_PATTERN = /^(\s*)(`{3,}|~{3,})/;

/**
 * Bounds of a code fence if `pos` resides within one, or null.
 */
export function getCodeFenceBounds(
  state: EditorState,
  pos: number,
): BlockBounds | null {
  let openFence: { char: string; length: number; lineNumber: number } | null = null;
  let openFenceLineFrom = 0;

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const match = line.text.match(FENCE_PATTERN);

    if (match) {
      const fenceMarker = match[2];
      const fenceChar = fenceMarker[0];
      const fenceLen = fenceMarker.length;

      if (!openFence) {
        openFence = { char: fenceChar, length: fenceLen, lineNumber };
        openFenceLineFrom = line.from;
      } else if (
        openFence.char === fenceChar &&
        fenceLen >= openFence.length
      ) {
        // Closed fence
        const closeFenceLineTo = line.to;
        if (pos >= openFenceLineFrom && pos <= closeFenceLineTo) {
          return { from: openFenceLineFrom, to: closeFenceLineTo };
        }
        openFence = null;
      }
    }
  }

  if (openFence) {
    // Unclosed fence running to EOF
    if (pos >= openFenceLineFrom && pos <= state.doc.length) {
      return { from: openFenceLineFrom, to: state.doc.length };
    }
  }

  return null;
}

/**
 * Returns bounds of the markdown block containing `pos`, or null when there is none
 * (e.g. empty document, or cursor on a blank line).
 */
export function getMarkdownBlockBounds(
  state: EditorState,
  pos: number,
): BlockBounds | null {
  if (state.doc.length === 0) return null;

  const fence = getCodeFenceBounds(state, pos);
  if (fence) return fence;

  const line = state.doc.lineAt(pos);
  if (isBlank(line.text)) return null;

  let first = line.number;
  while (first > 1 && !isBlank(state.doc.line(first - 1).text)) {
    first -= 1;
  }

  let last = line.number;
  while (last < state.doc.lines && !isBlank(state.doc.line(last + 1).text)) {
    last += 1;
  }

  return { from: state.doc.line(first).from, to: state.doc.line(last).to };
}

function getWordAt(state: EditorState, pos: number): { from: number; to: number; text: string } | null {
  const line = state.doc.lineAt(pos);
  const offset = pos - line.from;
  const text = line.text;

  // Search word boundaries around offset
  let start = offset;
  let end = offset;

  const isWordChar = (char: string) => /[\p{L}\p{N}_]/u.test(char);

  while (start > 0 && isWordChar(text[start - 1])) {
    start -= 1;
  }
  while (end < text.length && isWordChar(text[end])) {
    end += 1;
  }

  if (start === end) return null;

  return {
    from: line.from + start,
    text: text.slice(start, end),
    to: line.from + end,
  };
}

/**
 * Selects all occurrences of the selected text (or word under cursor)
 * strictly within the current block (contiguous non-blank lines or code block).
 * Bound to Alt+Mod+Shift+L.
 */
export function selectOccurrencesInBlock(view: EditorView): boolean {
  const { state } = view;
  const primary = state.selection.main;
  const bounds = getMarkdownBlockBounds(state, primary.from);
  if (!bounds) return false;

  let targetText = "";
  let targetFrom = primary.from;

  if (primary.empty) {
    const word = getWordAt(state, primary.from);
    if (!word) return false;
    targetText = word.text;
    targetFrom = word.from;
  } else {
    targetText = state.doc.sliceString(primary.from, primary.to);
  }

  if (!targetText) return false;

  const blockText = state.doc.sliceString(bounds.from, bounds.to);
  const ranges = [];
  let primaryIndex = 0;

  let searchIndex = 0;
  while ((searchIndex = blockText.indexOf(targetText, searchIndex)) !== -1) {
    const matchFrom = bounds.from + searchIndex;
    const matchTo = matchFrom + targetText.length;

    if (matchFrom === targetFrom) {
      primaryIndex = ranges.length;
    }

    ranges.push(EditorSelection.range(matchFrom, matchTo));
    searchIndex += targetText.length;
  }

  if (ranges.length === 0) return false;

  view.dispatch({
    scrollIntoView: true,
    selection: EditorSelection.create(ranges, primaryIndex),
    userEvent: "select",
  });

  return true;
}
