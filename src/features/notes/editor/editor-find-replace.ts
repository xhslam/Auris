import {
  EditorSelection,
  RangeSetBuilder,
  StateEffect,
  StateField,
  type Extension,
} from "@codemirror/state";
import { SearchCursor } from "@codemirror/search";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

const SEARCH_NORMALIZE = (value: string) => value.toLowerCase();
const SEARCH_HIGHLIGHT_MARGIN = 250;

type SearchMatch = {
  from: number;
  to: number;
};

const notesEditorSearchQueryEffect = StateEffect.define<string>();
const notesEditorSearchQueryField = StateField.define<string>({
  create() {
    return "";
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(notesEditorSearchQueryEffect)) {
        return effect.value;
      }
    }

    return value;
  },
});

function getQuery(state: EditorView["state"]) {
  return state.field(notesEditorSearchQueryField);
}

function collectSearchMatches(
  state: EditorView["state"],
  query: string,
  from = 0,
  to = state.doc.length,
) {
  if (!query) {
    return [] as SearchMatch[];
  }

  const cursor = new SearchCursor(
    state.doc,
    query,
    from,
    to,
    SEARCH_NORMALIZE,
  );
  const matches: SearchMatch[] = [];

  while (!cursor.next().done) {
    matches.push({
      from: cursor.value.from,
      to: cursor.value.to,
    });
  }

  return matches;
}

function findNextMatch(state: EditorView["state"], query: string, from: number) {
  const matches = collectSearchMatches(state, query);

  if (matches.length === 0) {
    return null;
  }

  return matches.find((match) => match.from >= from) ?? matches[0];
}

function findPreviousMatch(
  state: EditorView["state"],
  query: string,
  before: number,
) {
  const matches = collectSearchMatches(state, query);

  if (matches.length === 0) {
    return null;
  }

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const match = matches[index];

    if (match.to <= before) {
      return match;
    }
  }

  return matches[matches.length - 1];
}

function buildSearchDecorations(view: EditorView): DecorationSet {
  const query = getQuery(view.state);

  if (!query) {
    return Decoration.none;
  }

  const builder = new RangeSetBuilder<Decoration>();
  const seen = new Set<string>();
  let visibleMatchCount = 0;

  for (const visibleRange of view.visibleRanges) {
    const from = Math.max(0, visibleRange.from - SEARCH_HIGHLIGHT_MARGIN);
    const to = Math.min(
      view.state.doc.length,
      visibleRange.to + SEARCH_HIGHLIGHT_MARGIN,
    );
    const cursor = new SearchCursor(
      view.state.doc,
      query,
      from,
      to,
      SEARCH_NORMALIZE,
    );

    while (!cursor.next().done) {
      const { from: matchFrom, to: matchTo } = cursor.value;
      const key = `${matchFrom}:${matchTo}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      visibleMatchCount += 1;

      const selected = view.state.selection.ranges.some(
        (range) => range.from === matchFrom && range.to === matchTo,
      );

      builder.add(
        matchFrom,
        matchTo,
        selected ? selectedSearchMatchDecoration : searchMatchDecoration,
      );

      if (visibleMatchCount > 1000) {
        return Decoration.none;
      }
    }
  }

  return builder.finish();
}

const searchMatchDecoration = Decoration.mark({
  class: "notes-v2__cm-search-match",
});

const selectedSearchMatchDecoration = Decoration.mark({
  class: "notes-v2__cm-search-match notes-v2__cm-search-match--selected",
});

const notesEditorSearchHighlighter = ViewPlugin.fromClass(
  class {
    decorations = Decoration.none;

    constructor(private readonly view: EditorView) {
      this.decorations = buildSearchDecorations(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        update.startState.field(notesEditorSearchQueryField) !==
          update.state.field(notesEditorSearchQueryField)
      ) {
        this.decorations = buildSearchDecorations(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);

export const notesEditorSearchExtensions: Extension[] = [
  notesEditorSearchQueryField,
  notesEditorSearchHighlighter,
];

export function setNotesEditorSearchQuery(view: EditorView, query: string) {
  view.dispatch({
    effects: notesEditorSearchQueryEffect.of(query),
  });
}

export function getNotesEditorSearchQuery(state: EditorView["state"]) {
  return getQuery(state);
}

export function findNextNotesEditorSearchMatch(view: EditorView) {
  const query = getQuery(view.state);

  if (!query) {
    return false;
  }

  const selection = view.state.selection.main;
  const match =
    findNextMatch(view.state, query, selection.to) ??
    findNextMatch(view.state, query, 0);

  if (!match) {
    return false;
  }

  view.dispatch({
    selection: EditorSelection.single(match.from, match.to),
    scrollIntoView: true,
    userEvent: "select.search",
  });
  view.focus();
  return true;
}

export function findPreviousNotesEditorSearchMatch(view: EditorView) {
  const query = getQuery(view.state);

  if (!query) {
    return false;
  }

  const selection = view.state.selection.main;
  const match =
    findPreviousMatch(view.state, query, selection.from) ??
    findPreviousMatch(view.state, query, view.state.doc.length);

  if (!match) {
    return false;
  }

  view.dispatch({
    selection: EditorSelection.single(match.from, match.to),
    scrollIntoView: true,
    userEvent: "select.search",
  });
  view.focus();
  return true;
}

export function replaceNextNotesEditorSearchMatch(
  view: EditorView,
  replacement: string,
) {
  const query = getQuery(view.state);

  if (!query) {
    return false;
  }

  const selection = view.state.selection.main;
  const selectedText = view.state.doc.sliceString(selection.from, selection.to);
  const isSelectedMatch =
    selection.from !== selection.to &&
    selectedText.toLowerCase() === query.toLowerCase();

  const match = isSelectedMatch
    ? { from: selection.from, to: selection.to }
    : findNextMatch(view.state, query, selection.to) ??
      findNextMatch(view.state, query, 0);

  if (!match) {
    return false;
  }

  view.dispatch({
    changes: {
      from: match.from,
      insert: replacement,
      to: match.to,
    },
    userEvent: "input.replace",
  });

  const nextMatch =
    findNextMatch(view.state, query, match.from + replacement.length) ??
    findNextMatch(view.state, query, 0);

  if (nextMatch) {
    view.dispatch({
      selection: EditorSelection.single(nextMatch.from, nextMatch.to),
      scrollIntoView: true,
      userEvent: "select.search",
    });
  }

  view.focus();
  return true;
}

export function replaceAllNotesEditorSearchMatches(
  view: EditorView,
  replacement: string,
) {
  const query = getQuery(view.state);

  if (!query) {
    return false;
  }

  const matches = collectSearchMatches(view.state, query);

  if (matches.length === 0) {
    return false;
  }

  view.dispatch({
    changes: matches.map((match) => ({
      from: match.from,
      insert: replacement,
      to: match.to,
    })),
    userEvent: "input.replace.all",
  });
  view.focus();
  return true;
}
