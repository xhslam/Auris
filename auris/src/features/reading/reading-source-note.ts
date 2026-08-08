import {
  type ReadingSource,
  type ReadingSourceCategory,
  type ReadingSourceFormat,
} from "@/features/reading/reading-fixtures";
import {
  buildReadingSourceFromExamMarkdown,
  parseReadingExamMarkdown,
  serializeReadingExamSections,
} from "@/features/reading/reading-exam-parse";
import {
  createParagraphsFromText,
  serializeReadingParagraphs,
} from "@/features/reading/reading-text";
import { createNotePage, sanitizeNoteFileName } from "@/features/notes/note-model";
import type { NotePage, NotesStorage } from "@/features/notes/note-types";
import { loadReadingPdfBytes } from "@/features/reading/reading-pdf-store";

export const READING_SOURCE_NOTE_TYPE = "reading-source";
const READING_NOTES_DIRECTORY = "Reading/";

const READING_CATEGORIES: ReadingSourceCategory[] = [
  "article",
  "book",
  "exam",
  "episode",
  "favorite",
];

function toCategory(value: unknown): ReadingSourceCategory {
  return READING_CATEGORIES.includes(value as ReadingSourceCategory)
    ? (value as ReadingSourceCategory)
    : "article";
}

function toFormat(value: unknown): ReadingSourceFormat {
  return value === "pdf" ? "pdf" : "text";
}

function toFiniteNumber(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getFrontmatterString(
  frontmatter: Record<string, unknown> | undefined,
  key: string,
) {
  const value = frontmatter?.[key];
  return typeof value === "string" ? value : null;
}

function getReadingTitleFromFileName(page: NotePage) {
  const expectedFileName = `${sanitizeNoteFileName(page.title)}--${page.id}.md`;
  if (page.fileName === expectedFileName) {
    return page.title;
  }

  const withoutExtension = page.fileName.replace(/\.md$/i, "");
  const idSuffix = `--${page.id}`;

  return withoutExtension.endsWith(idSuffix)
    ? withoutExtension.slice(0, -idSuffix.length)
    : withoutExtension;
}

/**
 * Builds a vault note page that persists a reading source.
 *
 * Text sources store bilingual paragraphs or exam-marker markdown in the body.
 * PDF sources store metadata only; the binary lives in IndexedDB.
 */
export function buildReadingSourceNotePage(source: ReadingSource): NotePage {
  const isPdf = source.format === "pdf";
  const hasExam = Boolean(source.examSections && source.examSections.length > 0);
  const body = isPdf
    ? ""
    : hasExam
      ? serializeReadingExamSections(source.examSections!)
      : serializeReadingParagraphs(source.paragraphs);
  const fileName = `${sanitizeNoteFileName(source.title)}--${source.id}.md`;

  return createNotePage({
    fileName,
    frontmatter: {
      category: source.category,
      estimatedMinutes: source.estimatedMinutes,
      format: isPdf ? "pdf" : "text",
      ...(hasExam ? { hasExam: true } : {}),
      kicker: source.kicker,
      ...(typeof source.pageCount === "number" ? { pageCount: source.pageCount } : {}),
      progress: source.progress,
      tags: ["english", "reading", "reading-source"],
      type: READING_SOURCE_NOTE_TYPE,
    },
    icon: "R",
    id: source.id,
    markdownBody: body,
    relativePath: `${READING_NOTES_DIRECTORY}${fileName}`,
    title: source.title,
  });
}

export function isReadingSourceNotePage(page: NotePage) {
  return getFrontmatterString(page.frontmatter, "type") === READING_SOURCE_NOTE_TYPE;
}

export function parseReadingSourceNotePage(page: NotePage): ReadingSource | null {
  if (!isReadingSourceNotePage(page)) {
    return null;
  }

  const format = toFormat(page.frontmatter?.format);
  const title = getReadingTitleFromFileName(page) || page.title;

  if (format === "pdf") {
    return {
      category: toCategory(page.frontmatter?.category),
      estimatedMinutes: Math.max(
        1,
        Math.round(toFiniteNumber(page.frontmatter?.estimatedMinutes, 1)),
      ),
      format: "pdf",
      id: page.id,
      kicker: getFrontmatterString(page.frontmatter, "kicker") ?? "Local import",
      pageCount: Math.max(1, Math.round(toFiniteNumber(page.frontmatter?.pageCount, 1))),
      paragraphs: [],
      progress: Math.max(
        0,
        Math.min(100, Math.round(toFiniteNumber(page.frontmatter?.progress, 0))),
      ),
      title,
    };
  }

  const examSections = parseReadingExamMarkdown(page.markdownBody);
  if (examSections) {
    const built = buildReadingSourceFromExamMarkdown({
      fileName: page.fileName,
      idPrefix: page.id,
      markdown: page.markdownBody,
      sections: examSections,
      titleExtensionPattern: /\.md$/i,
    });

    return {
      ...built,
      category: toCategory(page.frontmatter?.category),
      estimatedMinutes: Math.max(
        1,
        Math.round(toFiniteNumber(page.frontmatter?.estimatedMinutes, built.estimatedMinutes)),
      ),
      id: page.id,
      kicker: getFrontmatterString(page.frontmatter, "kicker") ?? built.kicker,
      progress: Math.max(
        0,
        Math.min(100, Math.round(toFiniteNumber(page.frontmatter?.progress, 0))),
      ),
      title,
    };
  }

  const paragraphs = createParagraphsFromText(page.id, page.markdownBody);

  if (paragraphs.length === 0) {
    return null;
  }

  return {
    category: toCategory(page.frontmatter?.category),
    estimatedMinutes: Math.max(1, Math.round(toFiniteNumber(page.frontmatter?.estimatedMinutes, 1))),
    format: "text",
    id: page.id,
    kicker: getFrontmatterString(page.frontmatter, "kicker") ?? "Local import",
    paragraphs,
    progress: Math.max(0, Math.min(100, Math.round(toFiniteNumber(page.frontmatter?.progress, 0)))),
    title,
  };
}

async function isVaultConfigured(notesStorage: NotesStorage) {
  try {
    const info = await notesStorage.getDirectoryInfo();
    return info.isConfigured;
  } catch {
    return false;
  }
}

/**
 * Persists a reading source into the notes vault when one is configured.
 * Returns true when the source was written, false when storage is
 * unavailable so the caller can stay in-memory without surfacing an error.
 */
export async function saveReadingSourceNote(
  notesStorage: NotesStorage | null,
  source: ReadingSource,
) {
  if (!notesStorage || !(await isVaultConfigured(notesStorage))) {
    return false;
  }

  try {
    await notesStorage.savePage(buildReadingSourceNotePage(source));
    return true;
  } catch {
    return false;
  }
}

/**
 * Loads previously saved reading sources from the notes vault. Returns an
 * empty list when no vault is configured or the read fails, keeping the
 * reading workbench usable in pure in-memory mode.
 *
 * PDF sources are hydrated with bytes from IndexedDB when available.
 */
export async function loadReadingSourceNotes(
  notesStorage: NotesStorage | null,
): Promise<ReadingSource[]> {
  if (!notesStorage) {
    return [];
  }

  try {
    const summaries = await notesStorage.listPages();
    const readingSummaries = summaries.filter((summary) =>
      summary.relativePath.startsWith(READING_NOTES_DIRECTORY),
    );
    const pages = await Promise.all(
      readingSummaries.map((summary) => notesStorage.getPage(summary.id)),
    );

    const sources = pages
      .filter((page): page is NotePage => page !== null)
      .map(parseReadingSourceNotePage)
      .filter((source): source is ReadingSource => source !== null);

    return Promise.all(
      sources.map(async (source) => {
        if (source.format !== "pdf" || source.pdfBytes) {
          return source;
        }

        try {
          const pdfBytes = await loadReadingPdfBytes(source.id);
          return pdfBytes ? { ...source, pdfBytes } : source;
        } catch {
          return source;
        }
      }),
    );
  } catch {
    return [];
  }
}
