import { EditorSelection, type SelectionRange } from "@codemirror/state";
import { defaultKeymap, historyKeymap } from "@codemirror/commands";
import {
  gotoLine,
  selectNextOccurrence,
  selectSelectionMatches,
} from "@codemirror/search";
import { EditorView, type KeyBinding } from "@codemirror/view";
import { getMarkdownContinuation } from "@/features/notes/editor/editor-input-rules";

// ─────────────────────────────────────────────────────────────────────────────
// Markdown list / blockquote continuation on Enter
// ─────────────────────────────────────────────────────────────────────────────

function continueMarkdownBlock(view: EditorView) {
  const { state } = view;

  if (state.readOnly) {
    return false;
  }

  const changes: Array<{ from: number; insert: string; to: number }> = [];
  const selections = [];

  for (const range of state.selection.ranges) {
    if (!range.empty) {
      return false;
    }

    const line = state.doc.lineAt(range.from);

    if (range.from !== line.to) {
      return false;
    }

    const insert = getMarkdownContinuation(line.text);

    if (!insert) {
      return false;
    }

    changes.push({
      from: range.from,
      insert,
      to: range.to,
    });
    selections.push(EditorSelection.cursor(range.from + insert.length));
  }

  view.dispatch({
    changes,
    scrollIntoView: true,
    selection: EditorSelection.create(selections, state.selection.mainIndex),
    userEvent: "input",
  });

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline marker toggle: **bold**, _italic_, `code`, ~~strikethrough~~
// Behaviour:
//   • Selection already wrapped → remove the markers
//   • Non-empty selection → wrap it
//   • Empty selection (cursor) → insert paired markers, place cursor between
// ─────────────────────────────────────────────────────────────────────────────

function toggleInlineMarker(
  view: EditorView,
  prefix: string,
  suffix = prefix,
): boolean {
  if (view.state.readOnly) {
    return false;
  }

  const { state } = view;
  const prefixLength = prefix.length;
  const suffixLength = suffix.length;
  const changes: Array<{ from: number; to: number; insert: string }> = [];
  const newRanges: SelectionRange[] = [];

  for (const range of state.selection.ranges) {
    const { from, to } = range;

    const before =
      from >= prefixLength
        ? state.doc.sliceString(from - prefixLength, from)
        : "";
    const after =
      to + suffixLength <= state.doc.length
        ? state.doc.sliceString(to, to + suffixLength)
        : "";

    if (before === prefix && after === suffix) {
      // Already wrapped → strip the markers
      changes.push({ from: from - prefixLength, to: from, insert: "" });
      changes.push({ from: to, to: to + suffixLength, insert: "" });
      newRanges.push(
        EditorSelection.range(from - prefixLength, to - prefixLength),
      );
    } else if (range.empty) {
      // No selection → insert paired markers and sit cursor between them
      changes.push({ from, to, insert: prefix + suffix });
      newRanges.push(EditorSelection.cursor(from + prefixLength));
    } else {
      // Wrap the selected text
      const text = state.doc.sliceString(from, to);
      changes.push({ from, to, insert: prefix + text + suffix });
      newRanges.push(
        EditorSelection.range(from + prefixLength, to + prefixLength),
      );
    }
  }

  view.dispatch({
    changes,
    scrollIntoView: true,
    selection: EditorSelection.create(newRanges, state.selection.mainIndex),
    userEvent: "input",
  });

  return true;
}

function toggleMarkdownLink(view: EditorView): boolean {
  if (view.state.readOnly) {
    return false;
  }

  const { state } = view;
  const range = state.selection.main;
  const selectedText = state.doc.sliceString(range.from, range.to);
  const fullLinkMatch = selectedText.match(/^\[([^\]]*)\]\(([^)]*)\)$/);

  if (fullLinkMatch) {
    const label = fullLinkMatch[1] ?? "";

    view.dispatch({
      changes: {
        from: range.from,
        insert: label,
        to: range.to,
      },
      scrollIntoView: true,
      selection: EditorSelection.range(range.from, range.from + label.length),
      userEvent: "input",
    });
    return true;
  }

  const label = range.empty ? "text" : selectedText;
  const insert = `[${label}](url)`;
  const labelStart = range.from + 1;
  const labelEnd = labelStart + label.length;
  const urlStart = labelEnd + 2;
  const urlEnd = urlStart + 3;

  view.dispatch({
    changes: {
      from: range.from,
      insert,
      to: range.to,
    },
    scrollIntoView: true,
    selection: range.empty
      ? EditorSelection.range(labelStart, labelEnd)
      : EditorSelection.range(urlStart, urlEnd),
    userEvent: "input",
  });
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// vmark-style source editing helpers: block shortcuts and Tab escape
// ─────────────────────────────────────────────────────────────────────────────

function dedupeSelectionLines(view: EditorView) {
  const lines = new Map<number, ReturnType<typeof view.state.doc.lineAt>>();

  for (const range of view.state.selection.ranges) {
    const startLine = view.state.doc.lineAt(range.from);
    const endLine = view.state.doc.lineAt(range.to);

    for (
      let lineNumber = startLine.number;
      lineNumber <= endLine.number;
      lineNumber += 1
    ) {
      const line = view.state.doc.line(lineNumber);
      lines.set(line.from, line);
    }
  }

  return [...lines.values()].sort((a, b) => a.from - b.from);
}

function toggleLinePrefix(
  view: EditorView,
  input: {
    insertPrefix: string;
    removePattern: RegExp;
  },
) {
  if (view.state.readOnly) {
    return false;
  }

  const changes: Array<{ from: number; to: number; insert: string }> = [];

  for (const line of dedupeSelectionLines(view)) {
    const match = line.text.match(input.removePattern);

    if (match?.[0]) {
      changes.push({
        from: line.from,
        insert: "",
        to: line.from + match[0].length,
      });
      continue;
    }

    changes.push({
      from: line.from,
      insert: input.insertPrefix,
      to: line.from,
    });
  }

  if (changes.length === 0) {
    return false;
  }

  view.dispatch({
    changes,
    scrollIntoView: true,
    userEvent: "input",
  });
  return true;
}

function toggleBlockquote(view: EditorView) {
  return toggleLinePrefix(view, {
    insertPrefix: "> ",
    removePattern: /^(\s{0,3}>\s?)/,
  });
}

function toggleBulletList(view: EditorView) {
  return toggleLinePrefix(view, {
    insertPrefix: "- ",
    removePattern: /^(\s*)([-*+]\s+)/,
  });
}

function toggleOrderedList(view: EditorView) {
  return toggleLinePrefix(view, {
    insertPrefix: "1. ",
    removePattern: /^(\s*)(\d+[.)]\s+)/,
  });
}

function insertCodeBlock(view: EditorView): boolean {
  if (view.state.readOnly) {
    return false;
  }

  const range = view.state.selection.main;
  const selectedText = view.state.doc.sliceString(range.from, range.to);
  const insert = selectedText ? `\`\`\`\n${selectedText}\n\`\`\`` : "```\n\n```";
  const cursor = selectedText
    ? EditorSelection.range(range.from + 4, range.from + 4 + selectedText.length)
    : EditorSelection.cursor(range.from + 4);

  view.dispatch({
    changes: {
      from: range.from,
      insert,
      to: range.to,
    },
    scrollIntoView: true,
    selection: cursor,
    userEvent: "input",
  });
  return true;
}

function insertHorizontalRule(view: EditorView): boolean {
  if (view.state.readOnly) {
    return false;
  }

  const range = view.state.selection.main;
  const line = view.state.doc.lineAt(range.from);
  const prefix = line.from === range.from || line.text.trim() === "" ? "" : "\n";
  const insert = `${prefix}---\n`;
  const cursor = range.from + insert.length;

  view.dispatch({
    changes: {
      from: range.from,
      insert,
      to: range.to,
    },
    scrollIntoView: true,
    selection: EditorSelection.cursor(cursor),
    userEvent: "input",
  });
  return true;
}

const TAB_ESCAPE_CHARS = new Set([
  ")",
  "]",
  "}",
  "\"",
  "'",
  "`",
  ">",
  "*",
  "_",
  "）",
  "】",
  "」",
  "』",
  "》",
  "〉",
  "\u201D",
  "\u2019",
]);

const TAB_ESCAPE_SEQUENCES = ["**", "__", "~~"];

function getMarkdownLinkTabTarget(lineText: string, offset: number) {
  const pattern = /\[([^\]]*)\]\(([^)]*)\)/g;

  for (const match of lineText.matchAll(pattern)) {
    const linkStart = match.index ?? 0;
    const label = match[1] ?? "";
    const textStart = linkStart + 1;
    const textEnd = textStart + label.length;
    const urlStart = textEnd + 2;
    const linkEnd = linkStart + match[0].length;
    const urlEnd = linkEnd - 1;

    if (offset >= textStart && offset <= textEnd) {
      return urlStart;
    }

    if (offset >= urlStart && offset <= urlEnd) {
      return linkEnd;
    }
  }

  return null;
}

function getTabEscapePosition(view: EditorView, position: number) {
  const line = view.state.doc.lineAt(position);
  const lineTarget = getMarkdownLinkTabTarget(line.text, position - line.from);

  if (lineTarget !== null) {
    return line.from + lineTarget;
  }

  const nextTwo = view.state.doc.sliceString(position, position + 2);

  if (TAB_ESCAPE_SEQUENCES.includes(nextTwo)) {
    return position + nextTwo.length;
  }

  const nextChar = view.state.doc.sliceString(position, position + 1);

  if (TAB_ESCAPE_CHARS.has(nextChar)) {
    return position + 1;
  }

  return null;
}

function tabEscape(view: EditorView): boolean {
  const ranges = view.state.selection.ranges;
  const nextRanges: SelectionRange[] = [];
  let moved = false;

  for (const range of ranges) {
    if (!range.empty) {
      nextRanges.push(range);
      continue;
    }

    const target = getTabEscapePosition(view, range.from);

    if (target === null) {
      nextRanges.push(range);
      continue;
    }

    moved = true;
    nextRanges.push(EditorSelection.cursor(target));
  }

  if (!moved) {
    return false;
  }

  view.dispatch({
    scrollIntoView: true,
    selection: EditorSelection.create(nextRanges, view.state.selection.mainIndex),
  });
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Heading level: set or toggle H1–H3 on the current line
// • Same level already → remove the heading prefix (toggle off)
// • Different level → replace with the target prefix
// • No heading → add the prefix
// ─────────────────────────────────────────────────────────────────────────────

function setHeadingLevel(view: EditorView, level: number): boolean {
  if (view.state.readOnly) {
    return false;
  }

  const { state } = view;
  const targetPrefix = "#".repeat(level) + " ";
  const changes: Array<{ from: number; to: number; insert: string }> = [];
  const newRanges: ReturnType<typeof EditorSelection.cursor>[] = [];

  for (const range of state.selection.ranges) {
    const line = state.doc.lineAt(range.head);
    const existingMatch = /^(#{1,6}) /.exec(line.text);

    if (existingMatch) {
      const existingPrefix = existingMatch[0]; // e.g. "## "
      if (existingPrefix === targetPrefix) {
        // Same level → remove
        const shift = -existingPrefix.length;
        changes.push({
          from: line.from,
          to: line.from + existingPrefix.length,
          insert: "",
        });
        newRanges.push(
          EditorSelection.cursor(Math.max(line.from, range.head + shift)),
        );
      } else {
        // Different level → replace
        const shift = targetPrefix.length - existingPrefix.length;
        changes.push({
          from: line.from,
          to: line.from + existingPrefix.length,
          insert: targetPrefix,
        });
        newRanges.push(EditorSelection.cursor(range.head + shift));
      }
    } else {
      // Plain line → prepend heading
      changes.push({ from: line.from, to: line.from, insert: targetPrefix });
      newRanges.push(
        EditorSelection.cursor(range.head + targetPrefix.length),
      );
    }
  }

  view.dispatch({
    changes,
    scrollIntoView: true,
    selection: EditorSelection.create(newRanges, state.selection.mainIndex),
    userEvent: "input",
  });

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported keymap
// ─────────────────────────────────────────────────────────────────────────────

export const notesEditorKeymap: readonly KeyBinding[] = [
  // ── Structural / list continuation and tab escape ───────────────────────
  { key: "Tab", run: tabEscape },
  { key: "Enter", run: continueMarkdownBlock },

  // ── Inline formatting ────────────────────────────────────────────────────
  // Mod = Cmd on macOS, Ctrl on Windows/Linux
  { key: "Mod-b", run: (view) => toggleInlineMarker(view, "**"), preventDefault: true },
  { key: "Mod-i", run: (view) => toggleInlineMarker(view, "_"),  preventDefault: true },
  { key: "Mod-k", run: toggleMarkdownLink, preventDefault: true },
  { key: "Mod-e", run: (view) => toggleInlineMarker(view, "`"),  preventDefault: true },
  {
    key: "Mod-Shift-s",
    run: (view) => toggleInlineMarker(view, "~~"),
    preventDefault: true,
  },

  // ── Block formatting, aligned with vmark's source-mode defaults ─────────
  { key: "Mod-Alt-q", run: toggleBlockquote, preventDefault: true },
  { key: "Mod-Alt-c", run: insertCodeBlock, preventDefault: true },
  { key: "Mod-Alt-u", run: toggleBulletList, preventDefault: true },
  { key: "Mod-Alt-o", run: toggleOrderedList, preventDefault: true },
  { key: "Mod-Alt--", run: insertHorizontalRule, preventDefault: true },

  // ── Heading levels. Keep Ctrl aliases for existing muscle memory. ───────
  { key: "Mod-1", run: (view) => setHeadingLevel(view, 1), preventDefault: true },
  { key: "Mod-2", run: (view) => setHeadingLevel(view, 2), preventDefault: true },
  { key: "Mod-3", run: (view) => setHeadingLevel(view, 3), preventDefault: true },
  { key: "Mod-4", run: (view) => setHeadingLevel(view, 4), preventDefault: true },
  { key: "Mod-5", run: (view) => setHeadingLevel(view, 5), preventDefault: true },
  { key: "Mod-6", run: (view) => setHeadingLevel(view, 6), preventDefault: true },
  { key: "Ctrl-1", run: (view) => setHeadingLevel(view, 1), preventDefault: true },
  { key: "Ctrl-2", run: (view) => setHeadingLevel(view, 2), preventDefault: true },
  { key: "Ctrl-3", run: (view) => setHeadingLevel(view, 3), preventDefault: true },

  // ── Multi-cursor / search helpers ────────────────────────────────────────
  { key: "Mod-d",       run: selectNextOccurrence,    preventDefault: true },
  { key: "Mod-Shift-l", run: selectSelectionMatches },
  { key: "Mod-Alt-g",   run: gotoLine },

  // ── CM6 defaults (history, standard editing keybindings) ─────────────────
  ...defaultKeymap,
  ...historyKeymap,
];
