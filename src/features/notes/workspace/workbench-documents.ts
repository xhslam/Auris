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

function areBacklinksEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function applyBacklinksToDocuments(
  documents: NoteDocument[],
  backlinksIndex: Record<string, string[]>,
): NoteDocument[] {
  let anyChanged = false;
  const next = documents.map((document) => {
    const nextBacklinks = backlinksIndex[document.path] ?? [];
    const currentBacklinks = document.parsed.backlinks ?? [];

    if (areBacklinksEqual(currentBacklinks, nextBacklinks)) {
      return document;
    }

    anyChanged = true;
    return {
      ...document,
      parsed: {
        ...document.parsed,
        backlinks: nextBacklinks,
      },
    };
  });

  return anyChanged ? next : documents;
}
