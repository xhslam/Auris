import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function tryPasteMarkdownUrl(view: EditorView, pastedText: string) {
  const { from, to } = view.state.selection.main;
  const url = pastedText.trim();

  if (from === to || !isHttpUrl(url)) {
    return false;
  }

  const selectedText = view.state.sliceDoc(from, to);

  if (!selectedText.trim() || /^\[[\s\S]*\]\([^)]*\)$/.test(selectedText)) {
    return false;
  }

  const markdown = `[${selectedText}](${url})`;
  view.dispatch({
    changes: { from, insert: markdown, to },
    selection: EditorSelection.cursor(from + markdown.length),
    userEvent: "input.paste",
  });

  return true;
}
