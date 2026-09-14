export type NotesDocumentSaveState = "saved" | "saving" | "conflict";

type GetNotesDocumentSaveStateInput = {
  activePath: string | null;
  dirtyPaths: Record<string, boolean>;
  writeConflictPath: string | null;
};

export function getNotesDocumentSaveState({
  activePath,
  dirtyPaths,
  writeConflictPath,
}: GetNotesDocumentSaveStateInput): NotesDocumentSaveState {
  if (activePath && writeConflictPath === activePath) {
    return "conflict";
  }

  if (activePath && dirtyPaths[activePath]) {
    return "saving";
  }

  return "saved";
}
