import type { NotesEditorMode, NotesEditorSelectionState } from "@/features/notes/editor/editor-types";
import type { BrowserEvidence } from "@/features/browser/evidence";

export type NotesMcpPendingEditInput =
  | {
      afterSource: string;
      beforeSource: string;
      evidence?: BrowserEvidence;
      expectedRevision: string;
      kind: "document";
      mode: NotesEditorMode;
      path: string;
    }
  | {
      content: string;
      expectedRevision: string;
      kind: "selection";
      mode: NotesEditorMode;
      path: string;
      selection: NotesEditorSelectionState | null;
    };

export type NotesMcpPendingEdit = NotesMcpPendingEditInput & {
  createdAt: string;
  id: string;
};

export type NotesMcpPendingEditResult = {
  id: string;
};

export type NotesMcpPendingEditHandler = (
  edit: NotesMcpPendingEditInput,
) => NotesMcpPendingEditResult;

export function createNotesMcpPendingEditResult(edit: NotesMcpPendingEdit) {
  return {
    pending_review: {
      id: edit.id,
      kind: edit.kind,
      path: edit.path,
    },
  };
}
