import {
  composeEditableNoteSource,
  parseEditableNoteSource,
} from "@/features/notes/documents/note-editing-source";
import { parseFrontmatterDocument } from "@/features/notes/documents/frontmatter";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import type { NotePage } from "@/features/notes/note-types";
import { resolveLearningDependencyReviewForPage } from "@/features/learning-memory/learning-dependency-sync";
import { rebaseLearningDependencySnapshot } from "@/features/learning-memory/learning-dependency-review";

function toNotePage(document: NoteDocument): NotePage {
  const parsed = parseFrontmatterDocument(document.rawSource);
  return {
    blocks: [],
    fileName: document.fileName,
    frontmatter: document.frontmatter,
    icon: "N",
    id: document.path,
    markdownBody: parsed.bodySource,
    relativePath: document.path,
    title: document.parsed.title ?? document.basename ?? document.path,
    updatedAt: document.mtime ?? "",
  };
}

export function applyLearningDependencyReviewToDocument(
  document: NoteDocument,
  documents: readonly NoteDocument[],
  resolution: Parameters<typeof rebaseLearningDependencySnapshot>[2],
) {
  const pages = documents.map(toNotePage);
  const currentPage = pages.find((page) => page.relativePath === document.path);
  if (!currentPage) {
    return document.rawSource;
  }

  const updatedPage = resolveLearningDependencyReviewForPage(currentPage, pages, resolution);
  if (!updatedPage) {
    return document.rawSource;
  }

  const editableSource = parseEditableNoteSource(document.rawSource, document.path);
  return composeEditableNoteSource(
    {
      ...editableSource,
      frontmatter: updatedPage.frontmatter ?? {},
    },
    {
      bodySource: updatedPage.markdownBody,
      title: editableSource.title,
    },
  );
}
