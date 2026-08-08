import type { EditorView } from "@codemirror/view";
import type { EditorView as ProseMirrorEditorView } from "prosemirror-view";
import type { NoteDocument } from "@/features/notes/documents/document-types";

export type NotesEditorChangeHandler = (nextSource: string) => void;

export type NotesEditorMode = "source" | "wysiwyg";

export type NotesEditorSelectionState = {
  from: number;
  line: number;
  text: string;
  to: number;
};

export type NotesEditorSurfaceView = EditorView | ProseMirrorEditorView;

export type NotesEditorEnvironment = {
  getDocuments?: () => NoteDocument[];
  documentPath?: string;
  onOpenWikiLink?: (target: string) => void;
  onSelectionChange?: (line: number) => void;
  onSelectionStateChange?: (selection: NotesEditorSelectionState) => void;
  saveAttachment?: (path: string, content: Uint8Array) => Promise<void>;
  resolveImageUrl?: (source: string) => string | null;
};

export type NotesEditorBridge = {
  focus: () => void;
  getSelection: () => NotesEditorSelectionState | null;
  getSource: () => string;
  revealLine: (line: number) => void;
  insertSnippet: (snippet: string) => void;
  getActiveLine: () => number;
  openSourcePeek?: () => boolean;
  setSelection: (from: number, to: number) => void;
  view: NotesEditorSurfaceView | null;
};
