import type { NoteDocument } from "@/features/notes/documents/document-types";
import type { NotesWorkspaceState } from "@/features/notes/workspace/workspace-types";

export function selectActiveDocument(
  documents: NoteDocument[],
  state: Pick<NotesWorkspaceState, "activePath">,
) {
  return documents.find((document) => document.path === state.activePath) ?? null;
}

export function selectOpenDocuments(
  documents: NoteDocument[],
  state: Pick<NotesWorkspaceState, "openTabs">,
) {
  return state.openTabs
    .map((path) => documents.find((document) => document.path === path) ?? null)
    .filter((document): document is NoteDocument => document !== null);
}

export function selectDocumentBacklinks(
  documents: NoteDocument[],
  state: Pick<NotesWorkspaceState, "activePath">,
) {
  const activeDocument = selectActiveDocument(documents, state);

  if (!activeDocument) {
    return [];
  }

  return activeDocument.parsed.backlinks
    .map((path) => documents.find((document) => document.path === path) ?? null)
    .filter((document): document is NoteDocument => document !== null);
}
