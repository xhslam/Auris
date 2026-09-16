import { autocompletion, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { history } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import {
  HighlightStyle,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
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
import {
  prepareImageInsertion,
  type PreparedImageInsertion,
} from "@/features/notes/editor/editor-image-attachments";
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

const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "ico",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
]);

function isImageFile(file: File) {
  if (file.type.startsWith("image/")) {
    return true;
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return SUPPORTED_IMAGE_EXTENSIONS.has(extension);
}

function collectImageFiles(files: FileList | null | undefined) {
  return Array.from(files ?? []).filter(isImageFile);
}

function dispatchImageInsertion(
  view: EditorView,
  insertions: PreparedImageInsertion[],
  from: number,
  to: number,
) {
  if (view.state.readOnly) {
    return;
  }
  const insertText = `\n\n${insertions.map((image) => image.markdown).join("\n\n")}\n\n`;
  const start = Math.min(Math.max(from, 0), view.state.doc.length);
  const end = Math.min(Math.max(to, 0), view.state.doc.length);

  view.dispatch({
    changes: {
      from: Math.min(start, end),
      insert: insertText,
      to: Math.max(start, end),
    },
    selection: EditorSelection.cursor(Math.min(start, end) + insertText.length),
    userEvent: "input.paste",
  });
  view.focus();
}

async function handleImageFiles(
  view: EditorView,
  environment: NotesEditorEnvironment | undefined,
  files: File[],
  from: number,
  to: number,
) {
  if (view.state.readOnly) {
    return;
  }
  const notePath = environment?.documentPath ?? "";
  const insertions: PreparedImageInsertion[] = [];

  for (const file of files) {
    if (view.state.readOnly) {
      return;
    }
    const insertion = await prepareImageInsertion({
      file,
      notePath,
      persistAttachment: environment?.saveAttachment
        ? async (path, content) => {
            if (view.state.readOnly) {
              throw new Error("The editor is read-only.");
            }
            await environment.saveAttachment?.(path, content);
          }
        : undefined,
    });
    if (view.state.readOnly) {
      return;
    }
    insertions.push(insertion);
  }

  if (insertions.length === 0 || view.state.readOnly) {
    return;
  }

  dispatchImageInsertion(view, insertions, from, to);
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

        const handler = environment?.onOpenWikiLink;

        if (!handler) {
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
        const target = findWikiLinkAtLineOffset(line.text, position - line.from);

        if (!target) {
          return false;
        }

        event.preventDefault();
        handler(target);
        return true;
      },
      drop(event, view) {
        if (view.state.readOnly) {
          return false;
        }
        const imageFiles = collectImageFiles(event.dataTransfer?.files);

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
        const imageFiles = collectImageFiles(event.clipboardData?.files);

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
