import { autocompletion, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { history } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import {
  HighlightStyle,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";
import { tags } from "@lezer/highlight";
import {
  crosshairCursor,
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
  rectangularSelection,
} from "@codemirror/view";
import { findWikiLinkAtLineOffset } from "@/features/notes/documents/wiki-link-navigation";
import { findMarkdownSourceLinkAt } from "@/features/notes/documents/markdown-link-navigation";
import { notesEditorSyncAnnotation } from "@/features/notes/editor/editor-annotations";
import { notesEditorSearchExtensions } from "@/features/notes/editor/editor-find-replace";
import { notesEditorKeymap } from "@/features/notes/editor/editor-keymap";
import { tryPasteMarkdownUrl } from "@/features/notes/editor/editor-markdown-paste";
import {
  createTagCompletionSource,
  createSlashCommandCompletionSource,
  createWikiLinkCompletionSource,
} from "@/features/notes/editor/editor-completions";
import { notesEditorFolds } from "@/features/notes/editor/editor-folds";
import { collectNotesImageFiles } from "./editor-image-attachments";
import { insertNotesImageFiles, reportNotesImageError } from "./notes-image-insertion";
import { notesEditorTheme } from "@/features/notes/editor/editor-theme";
import {
  createShowInvisiblesPlugin,
  showInvisiblesTheme,
} from "@/features/notes/editor/show-invisibles";
import {
  DEFAULT_NOTES_EDITOR_BEHAVIOR,
  editorIndentString,
  editorTabWidth,
  type NotesEditorBehaviorSettings,
} from "@/features/notes/formatting/notes-editor-behavior";
import type {
  NotesEditorChangeHandler,
  NotesEditorEnvironment,
  NotesEditorSelectionState,
} from "@/features/notes/editor/editor-types";

/**
 * Obsidian-style live-preview highlighting for the source editor: markdown
 * links render in a soft blue-violet with an underline (mirroring the reading
 * pane), while emphasis/strong keep their semantic weight. Kept intentionally
 * restrained so the writing surface stays calm.
 */
const notesMarkdownHighlightStyle = HighlightStyle.define([
  { tag: tags.link, color: "#7c6bd6", textDecoration: "underline" },
  { tag: tags.url, color: "#7c6bd6", textDecoration: "underline" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.monospace, fontFamily: '"Cascadia Code", "JetBrains Mono", monospace' },
]);

function createSelectionState(updateState: EditorState): NotesEditorSelectionState {
  const selection = updateState.selection.main;
  const line = updateState.doc.lineAt(selection.head);

  return {
    column: selection.head - line.from,
    from: selection.from,
    line: line.number - 1,
    text: updateState.doc.sliceString(selection.from, selection.to),
    to: selection.to,
  };
}

function handleImageFiles(
  view: EditorView,
  environment: NotesEditorEnvironment | undefined,
  files: File[],
  from: number,
  to: number,
) {
  return insertNotesImageFiles(view, files, {
    notePath: environment?.documentPath ?? "",
    persistAttachment: environment?.saveAttachment,
    isCurrent: environment?.isCurrentDocument,
    from,
    to,
  }).catch(reportNotesImageError);
}

export function createNotesEditorExtensions(
  onDocumentChange: NotesEditorChangeHandler,
  environment?: NotesEditorEnvironment,
  behavior: NotesEditorBehaviorSettings = DEFAULT_NOTES_EDITOR_BEHAVIOR,
): Extension[] {
  const autoPair = behavior.autoPair;
  return [
    history(),
    indentUnit.of(editorIndentString(behavior.tabSize)),
    EditorState.tabSize.of(editorTabWidth(behavior.tabSize)),
    showInvisiblesTheme,
    createShowInvisiblesPlugin(behavior.showInvisibles),
    markdown(),
    syntaxHighlighting(notesMarkdownHighlightStyle),
    EditorState.allowMultipleSelections.of(true),
    drawSelection(),
    rectangularSelection(),
    crosshairCursor(),
    EditorView.lineWrapping,
    highlightActiveLine(),
    ...notesEditorSearchExtensions,
    EditorView.domEventHandlers({
      mousedown(event, view) {
        // Obsidian-style mod+click on a [[wiki link]] jumps to the target note.
        if (!(event.metaKey || event.ctrlKey) || event.button !== 0) {
          return false;
        }

        const position = view.posAtCoords({
          x: event.clientX,
          y: event.clientY,
        });

        if (position === null) {
          return false;
        }

        const line = view.state.doc.lineAt(position);
        const offset = position - line.from;
        const wikiHandler = environment?.onOpenWikiLink;
        const wikiTarget = findWikiLinkAtLineOffset(line.text, offset);

        if (wikiTarget && wikiHandler) {
          event.preventDefault();
          wikiHandler(wikiTarget);
          return true;
        }

        const markdownLink = findMarkdownSourceLinkAt(line.text, offset);
        if (!markdownLink || !environment?.onOpenMarkdownLink) return false;

        event.preventDefault();
        void environment.onOpenMarkdownLink(
          markdownLink.href,
          environment.documentPath ?? null,
        );
        return true;
      },
      drop(event, view) {
        if (view.state.readOnly) {
          return false;
        }
        const imageFiles = collectNotesImageFiles(event.dataTransfer);

        if (imageFiles.length === 0) {
          return false;
        }

        event.preventDefault();
        const dropPosition = view.posAtCoords({
          x: event.clientX,
          y: event.clientY,
        }) ?? view.state.selection.main.from;

        void handleImageFiles(
          view,
          environment,
          imageFiles,
          dropPosition,
          dropPosition,
        );

        return true;
      },
      paste(event, view) {
        if (view.state.readOnly) {
          return false;
        }
        const imageFiles = collectNotesImageFiles(event.clipboardData);

        if (imageFiles.length > 0) {
          event.preventDefault();

          void handleImageFiles(
            view,
            environment,
            imageFiles,
            view.state.selection.main.from,
            view.state.selection.main.to,
          );

          return true;
        }

        const pastedText = event.clipboardData?.getData("text/plain") ?? "";

        if (tryPasteMarkdownUrl(view, pastedText)) {
          event.preventDefault();
          return true;
        }

        return false;
      },
    }),

    ...(autoPair ? [closeBrackets()] : []),
    keymap.of([
      ...(autoPair ? closeBracketsKeymap : []),
      ...notesEditorKeymap,
    ]),
    autocompletion({
      override: [
        createSlashCommandCompletionSource(),
        createWikiLinkCompletionSource(environment),
        createTagCompletionSource(environment),
      ],
    }),
    notesEditorTheme,
    ...notesEditorFolds,
    EditorView.updateListener.of((update) => {
      const isExternalSync = update.transactions.some((transaction) =>
        transaction.annotation(notesEditorSyncAnnotation),
      );

      if (update.docChanged && !isExternalSync) {
        onDocumentChange(update.state.sliceDoc());
      }

      if (update.selectionSet || update.docChanged || update.focusChanged) {
        const selectionState = createSelectionState(update.state);

        environment?.onSelectionChange?.(selectionState.line);
        environment?.onSelectionStateChange?.(selectionState);
      }
    }),
  ];
}
