import { EditorView } from "@codemirror/view";

export const notesEditorTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "#1f2d26",
    fontFamily:
      '"Aptos", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    fontSize: "16px",
    height: "100%",
  },
  ".cm-content": {
    caretColor: "#1f2d26",
    lineHeight: "1.7",
    minHeight: "100%",
    padding: "0 0 48px",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "#1f2d26",
  },
  ".cm-editor": {
    height: "100%",
  },
  ".cm-focused": {
    outline: "none",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    border: "none",
    color: "rgba(96, 110, 102, 0.72)",
  },
  ".cm-line": {
    padding: "0 6px",
    whiteSpace: "inherit",
  },
  ".cm-scroller": {
    overflowX: "hidden",
    overflowY: "auto",
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "rgba(123, 162, 135, 0.2)",
  },
});
