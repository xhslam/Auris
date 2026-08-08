import { foldGutter, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { defaultHighlightStyle } from "@codemirror/language";

export const notesEditorFolds = [
  foldGutter(),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, {
    fallback: true,
  }),
];
