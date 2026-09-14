import { TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

export type NotesRichSearchMatch = {
  from: number;
  to: number;
};

export function findNotesRichSearchMatches(
  view: EditorView,
  query: string,
): NotesRichSearchMatch[] {
  const matches: NotesRichSearchMatch[] = [];

  if (!query) {
    return matches;
  }

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const matcher = new RegExp(escapedQuery, "giu");

  view.state.doc.descendants((node, position) => {
    if (!node.isText || !node.text) {
      return;
    }

    matcher.lastIndex = 0;
    for (let match = matcher.exec(node.text); match; match = matcher.exec(node.text)) {
      matches.push({
        from: position + match.index,
        to: position + match.index + match[0].length,
      });
    }
  });

  return matches;
}

export function selectNextNotesRichSearchMatch(
  view: EditorView,
  query: string,
  backwards = false,
) {
  const matches = findNotesRichSearchMatches(view, query);
  if (matches.length === 0) {
    return false;
  }

  const anchor = backwards
    ? view.state.selection.from
    : view.state.selection.to;
  const match = backwards
    ? [...matches].reverse().find((candidate) => candidate.to < anchor) ??
      matches.at(-1)
    : matches.find((candidate) => candidate.from > anchor) ?? matches[0];

  if (!match) {
    return false;
  }

  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.create(view.state.doc, match.from, match.to))
      .scrollIntoView(),
  );
  view.focus();
  return true;
}

export function replaceNextNotesRichSearchMatch(
  view: EditorView,
  query: string,
  replacement: string,
) {
  const matches = findNotesRichSearchMatches(view, query);
  const selection = view.state.selection;
  const selected = matches.find(
    (match) => match.from === selection.from && match.to === selection.to,
  );
  const match =
    selected ??
    matches.find((candidate) => candidate.from >= selection.to) ??
    matches[0];

  if (!match) {
    return false;
  }

  const transaction = view.state.tr.insertText(
    replacement,
    match.from,
    match.to,
  );
  const cursor = match.from + replacement.length;
  view.dispatch(
    transaction
      .setSelection(TextSelection.create(transaction.doc, cursor))
      .scrollIntoView(),
  );
  view.focus();
  return true;
}

export function replaceAllNotesRichSearchMatches(
  view: EditorView,
  query: string,
  replacement: string,
) {
  const matches = findNotesRichSearchMatches(view, query);
  if (matches.length === 0) {
    return 0;
  }

  const transaction = matches
    .slice()
    .reverse()
    .reduce(
      (next, match) => next.insertText(replacement, match.from, match.to),
      view.state.tr,
    );
  view.dispatch(transaction);
  return matches.length;
}
