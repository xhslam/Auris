import { createMarkdownFileName, parseMarkdownNote, serializeMarkdownNote } from "@/features/notes/markdown-codec";
import { createNotePage } from "@/features/notes/note-model";
import {
  VAULT_READ_CONCURRENCY,
  mapWithConcurrency,
} from "@/features/notes/vault/map-with-concurrency";
import type {
  CreateNotePageInput,
  NotePage,
  NotePageSummary,
  NotesStorage,
} from "@/features/notes/note-types";
import type { DesktopVaultService } from "@/platform/desktop/vault-service";

function toSummary(page: NotePage): NotePageSummary {
  return {
    fileName: page.fileName,
    icon: page.icon,
    id: page.id,
    relativePath: page.relativePath,
    title: page.title,
    updatedAt: page.updatedAt,
  };
}

function sortPages(pages: NotePage[]) {
  return [...pages].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function sortSummaries(pages: NotePageSummary[]) {
  return [...pages].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function searchPagesByQuery(pages: NotePage[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return sortSummaries(pages.map(toSummary));
  }

  return sortSummaries(
    pages
      .filter(
        (page) =>
          page.title.toLowerCase().includes(normalizedQuery) ||
          page.relativePath.toLowerCase().includes(normalizedQuery) ||
          page.markdownBody.toLowerCase().includes(normalizedQuery),
      )
      .map(toSummary),
  );
}

async function loadPages(vaultService: DesktopVaultService) {
  const files = await vaultService.listMarkdownFiles();
  const pages = await mapWithConcurrency(
    files,
    VAULT_READ_CONCURRENCY,
    async (file) => {
      const content = await vaultService.readMarkdownFile(file.relativePath);

      if (!content) {
        return null;
      }

      return parseMarkdownNote({
        fileName: file.fileName,
        markdown: content,
        relativePath: file.relativePath,
      });
    },
  );

  return sortPages(pages.filter((page): page is NotePage => Boolean(page)));
}

export function createDesktopNotesStorage(vaultService: DesktopVaultService): NotesStorage {
  let cachedPages: NotePage[] | null = null;
  let pendingPagesPromise: Promise<NotePage[]> | null = null;

  function invalidateCache() {
    cachedPages = null;
    pendingPagesPromise = null;
  }

  async function readPages() {
    if (cachedPages) {
      return cachedPages;
    }

    if (!pendingPagesPromise) {
      pendingPagesPromise = loadPages(vaultService)
        .then((pages) => {
          cachedPages = pages;
          return pages;
        })
        .finally(() => {
          pendingPagesPromise = null;
        });
    }

    return pendingPagesPromise;
  }

  function writeCachedPages(nextPages: NotePage[]) {
    cachedPages = sortPages(nextPages);
    pendingPagesPromise = null;
  }

  return {
    async createPage(input?: CreateNotePageInput) {
      const page = createNotePage({
        icon: input?.icon,
        title: input?.title,
      });
      const nextPage = {
        ...page,
        fileName: createMarkdownFileName(page.title, page.id),
      };
      const relativePath = nextPage.fileName;
      const persistedPage = {
        ...nextPage,
        relativePath,
      };

      await vaultService.saveMarkdownFile(relativePath, serializeMarkdownNote(persistedPage));
      writeCachedPages([persistedPage, ...(cachedPages ?? [])]);
      return persistedPage;
    },
    async deletePage(id: string) {
      const pages = await readPages();
      const page = pages.find((item) => item.id === id);

      if (!page) {
        return;
      }

      await vaultService.removeMarkdownFile(page.relativePath);
      writeCachedPages(pages.filter((item) => item.id !== id));
    },
    async getDirectoryInfo() {
      return vaultService.getDirectoryInfo();
    },
    async getPage(id: string) {
      const pages = await readPages();
      return pages.find((page) => page.id === id) ?? null;
    },
    async listPages() {
      const pages = await readPages();
      return sortSummaries(pages.map(toSummary));
    },
    async pickDirectory() {
      const directoryInfo = await vaultService.pickDirectory();
      invalidateCache();
      return directoryInfo;
    },
    async savePage(page: NotePage) {
      const nextPage = {
        ...page,
        updatedAt: new Date().toISOString(),
      };

      await vaultService.saveMarkdownFile(nextPage.relativePath, serializeMarkdownNote(nextPage));
      writeCachedPages([
        nextPage,
        ...(cachedPages ?? []).filter((item) => item.id !== nextPage.id),
      ]);
      return toSummary(nextPage);
    },
    async searchPages(query: string) {
      return searchPagesByQuery(await readPages(), query);
    },
    subscribeToChanges(listener: () => void) {
      return vaultService.subscribeToChanges(() => {
        invalidateCache();
        listener();
      });
    },
  };
}
