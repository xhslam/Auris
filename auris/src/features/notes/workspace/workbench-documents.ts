import { buildBacklinksIndex } from "@/features/notes/documents/backlinks";
import { createNoteDocument } from "@/features/notes/documents/document-repository";
import type { NoteDocument } from "@/features/notes/documents/document-types";

export type LiveNoteDocuments = Record<string, NoteDocument>;

export function createLiveNoteDraft(
  document: NoteDocument,
  rawSource: string,
): NoteDocument {
  return {
    ...document,
    rawSource,
  };
}

export function createLiveNoteDocument(document: NoteDocument, rawSource: string): NoteDocument {
  return createNoteDocument({
    mtime: document.mtime,
    path: document.path,
    rawSource,
  });
}

export function mergeLiveNoteDocuments(
  documents: NoteDocument[],
  liveDocuments: LiveNoteDocuments,
): NoteDocument[] {
  return documents.map((document) => liveDocuments[document.path] ?? document);
}

export function buildLiveBacklinksIndex(
  documents: NoteDocument[],
  liveDocuments: LiveNoteDocuments,
) {
  return buildBacklinksIndex(mergeLiveNoteDocuments(documents, liveDocuments));
}

export function applyBacklinksToDocuments(
  documents: NoteDocument[],
  backlinksIndex: Record<string, string[]>,
): NoteDocument[] {
  return documents.map((document) => ({
    ...document,
    parsed: {
      ...document.parsed,
      backlinks: backlinksIndex[document.path] ?? [],
    },
  }));
}
