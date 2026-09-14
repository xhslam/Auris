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
const READING_IMPORT_EXTENSION = /\.(?:md|markdown|mdown|mdx|mkdn|pdf|docx)$/i;

const READING_CATEGORY_DIRECTORIES: Partial<
  Record<ReadingSourceCategory, string>
> = {
  article: "文章",
  book: "书籍",
  exam: "题目",
};

const READING_DIRECTORY_CATEGORIES = new Map(
  Object.entries(READING_CATEGORY_DIRECTORIES).map(([category, directory]) => [
    directory,
    category as ReadingSourceCategory,
  ]),
);

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

function createReadableReadingFileName(value: string) {
  const stem = value
    .trim()
    .replace(READING_IMPORT_EXTENSION, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();

  return `${stem || "Untitled reading"}.md`;
}

function getReadingDirectory(category: ReadingSourceCategory) {
  const categoryDirectory = READING_CATEGORY_DIRECTORIES[category];
  return categoryDirectory
    ? `${READING_NOTES_DIRECTORY}${categoryDirectory}/`
    : READING_NOTES_DIRECTORY;
}

export function getReadingCategoryFromPath(relativePath: string) {
  const normalizedPath = relativePath.replace(/\\/g, "/");
  if (!normalizedPath.startsWith(READING_NOTES_DIRECTORY)) {
    return null;
  }

  const directory = normalizedPath
    .slice(READING_NOTES_DIRECTORY.length)
    .split("/")[0];
  return READING_DIRECTORY_CATEGORIES.get(directory) ?? null;
}

function getReadingTitleFromFileName(page: NotePage) {
  const titleFromCurrentFileName = () => {
    const withoutExtension = page.fileName.replace(/\.md$/i, "");
    const idSuffix = `--${page.id}`;
    return withoutExtension.endsWith(idSuffix)
      ? withoutExtension.slice(0, -idSuffix.length)
      : withoutExtension;
  };
  const managedFileName = getFrontmatterString(
    page.frontmatter,
    "storageFileName",
  );
  if (managedFileName) {
    return managedFileName === page.fileName
      ? page.title
      : titleFromCurrentFileName();
  }

  const expectedFileName = `${sanitizeNoteFileName(page.title)}--${page.id}.md`;
  if (page.fileName === expectedFileName) {
    return page.title;
  }

  return titleFromCurrentFileName();
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
  const fileName = createReadableReadingFileName(
    source.originalFileName ?? source.title,
  );
  const relativePath = `${getReadingDirectory(source.category)}${fileName}`;

  return createNotePage({
    fileName,
    frontmatter: {
      category: source.category,
      estimatedMinutes: source.estimatedMinutes,
      format: isPdf ? "pdf" : "text",
      ...(hasExam ? { hasExam: true } : {}),
      ...(source.importedAt ? { importedAt: source.importedAt } : {}),
      kicker: source.kicker,
      ...(source.originalFileName
        ? { originalFileName: source.originalFileName }
        : {}),
      ...(typeof source.pageCount === "number" ? { pageCount: source.pageCount } : {}),
      progress: source.progress,
      storageFileName: fileName,
      tags: ["english", "reading", "reading-source"],
      type: READING_SOURCE_NOTE_TYPE,
    },
    icon: "R",
    id: source.id,
    markdownBody: body,
    relativePath,
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
  const category =
    getReadingCategoryFromPath(page.relativePath) ??
    toCategory(page.frontmatter?.category);
  const originalFileName =
    getFrontmatterString(page.frontmatter, "originalFileName") ?? undefined;
  const importedAt =
    getFrontmatterString(page.frontmatter, "importedAt") ?? undefined;

  if (format === "pdf") {
    return {
      category,
      estimatedMinutes: Math.max(
        1,
        Math.round(toFiniteNumber(page.frontmatter?.estimatedMinutes, 1)),
      ),
      format: "pdf",
      id: page.id,
      importedAt,
      kicker: getFrontmatterString(page.frontmatter, "kicker") ?? "Local import",
      originalFileName,
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
      category,
      estimatedMinutes: Math.max(
        1,
        Math.round(toFiniteNumber(page.frontmatter?.estimatedMinutes, built.estimatedMinutes)),
      ),
      id: page.id,
      importedAt,
      kicker: getFrontmatterString(page.frontmatter, "kicker") ?? built.kicker,
      originalFileName,
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
    category,
    estimatedMinutes: Math.max(1, Math.round(toFiniteNumber(page.frontmatter?.estimatedMinutes, 1))),
    format: "text",
    id: page.id,
    importedAt,
    kicker: getFrontmatterString(page.frontmatter, "kicker") ?? "Local import",
    originalFileName,
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

function placeReadingPage(page: NotePage, relativePath: string): NotePage {
  const normalizedPath = relativePath.replace(/\\/g, "/");
  const fileName = normalizedPath.split("/").at(-1) ?? page.fileName;

  return {
    ...page,
    fileName,
    frontmatter: {
      ...page.frontmatter,
      storageFileName: fileName,
    },
    relativePath: normalizedPath,
  };
}

function createAvailableReadingPath(
  page: NotePage,
  occupiedPaths: ReadonlySet<string>,
) {
  const directory = page.relativePath.slice(
    0,
    Math.max(0, page.relativePath.length - page.fileName.length),
  );
  const stem = page.fileName.replace(/\.md$/i, "");
  let candidate = page.relativePath;
  let copyNumber = 2;

  while (occupiedPaths.has(candidate.toLocaleLowerCase())) {
    candidate = `${directory}${stem} (${copyNumber}).md`;
    copyNumber += 1;
  }

  return candidate;
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
    const page = buildReadingSourceNotePage(source);
    const summaries = await notesStorage.listPages();
    const existingPage = summaries.find((summary) => summary.id === page.id);
    const occupiedPaths = new Set(
      summaries
        .filter((summary) => summary.id !== page.id)
        .map((summary) => summary.relativePath.toLocaleLowerCase()),
    );
    if (!existingPage) {
      const relativePath = createAvailableReadingPath(page, occupiedPaths);
      await notesStorage.savePage(placeReadingPage(page, relativePath));
      return true;
    }

    const persistedPage = await notesStorage.getPage(page.id);
    const persistedSource = persistedPage
      ? parseReadingSourceNotePage(persistedPage)
      : null;
    const categoryChanged =
      persistedSource !== null && persistedSource.category !== source.category;

    if (!categoryChanged) {
      await notesStorage.savePage(
        placeReadingPage(page, existingPage.relativePath),
      );
      return true;
    }

    const relativePath = createAvailableReadingPath(page, occupiedPaths);
    const relocatedPage = placeReadingPage(page, relativePath);
    await notesStorage.deletePage(page.id);
    try {
      await notesStorage.savePage(relocatedPage);
    } catch (error) {
      if (persistedPage) {
        await notesStorage.savePage(persistedPage).catch(() => undefined);
      }
      throw error;
    }
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

    const readingPages = pages.filter((page): page is NotePage => page !== null);
    const parsedPages = readingPages
      .map((page) => ({ page, source: parseReadingSourceNotePage(page) }))
      .filter(
        (entry): entry is { page: NotePage; source: ReadingSource } =>
          entry.source !== null,
      );

    await Promise.all(
      parsedPages.map(async ({ page, source }) => {
        const categoryChanged = page.frontmatter?.category !== source.category;
        const titleChanged = page.title !== source.title;
        const storageFileName = getFrontmatterString(
          page.frontmatter,
          "storageFileName",
        );
        const storageNameChanged =
          storageFileName !== null && storageFileName !== page.fileName;

        if (!categoryChanged && !titleChanged && !storageNameChanged) {
          return;
        }

        await notesStorage
          .savePage({
            ...page,
            frontmatter: {
              ...page.frontmatter,
              category: source.category,
              storageFileName: page.fileName,
            },
            title: source.title,
          })
          .catch(() => undefined);
      }),
    );

    const sources = parsedPages.map(({ source }) => source);

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
