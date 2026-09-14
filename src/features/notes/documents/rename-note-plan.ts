import type { NoteDocument } from "@/features/notes/documents/document-types";
import {
  composeEditableNoteSource,
  parseEditableNoteSource,
} from "@/features/notes/documents/note-editing-source";
import { renameWikiLinks } from "@/features/notes/documents/rename-links";

type BuildRenameNotePlanInput = {
  nextTitle: string;
  path: string;
};

type RenameNoteWrite = {
  path: string;
  rawSource: string;
};

type RenameNotePlan = {
  nextPath: string;
  writes: RenameNoteWrite[];
};

function slugifyFileName(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "untitled-note"
  );
}

// Exposed so callers (e.g. the title→filename auto-sync) can cheaply tell
// whether a title would map to a different filename before triggering a rename.
export function slugifyNoteFileName(value: string) {
  return slugifyFileName(value);
}

function rewriteDocumentTitle(document: NoteDocument, nextTitle: string) {
  const editableSource = parseEditableNoteSource(document.rawSource, document.path);

  return composeEditableNoteSource(editableSource, {
    bodySource: editableSource.bodySource,
    title: nextTitle,
  });
}

function buildNextPath(path: string, nextTitle: string) {
  const normalizedPath = path.replace(/\\/g, "/");
  const pathSegments = normalizedPath.split("/");
  pathSegments[pathSegments.length - 1] = `${slugifyFileName(nextTitle)}.md`;
  return pathSegments.join("/");
}

export function buildRenameNotePlan(
  documents: NoteDocument[],
  input: BuildRenameNotePlanInput,
): RenameNotePlan {
  const activeDocument = documents.find(
    (document) => document.path === input.path,
  );

  if (!activeDocument) {
    return {
      nextPath: input.path,
      writes: [],
    };
  }

  const nextPath = buildNextPath(input.path, input.nextTitle);
  const renameInput = {
    fromPath: input.path,
    toPath: nextPath,
  };
  const writes = documents
    .map((document) => {
      if (document.path === input.path) {
        return {
          path: nextPath,
          rawSource: renameWikiLinks(
            rewriteDocumentTitle(document, input.nextTitle),
            renameInput,
          ),
        };
      }

      const nextSource = renameWikiLinks(document.rawSource, renameInput);

      if (nextSource === document.rawSource) {
        return null;
      }

      return {
        path: document.path,
        rawSource: nextSource,
      };
    })
    .filter((write): write is RenameNoteWrite => write !== null);

  return {
    nextPath,
    writes,
  };
}
