import {
  loadDirectoryHandle,
  saveDirectoryHandle,
  verifyDirectoryPermission,
} from "@/features/notes/file-system-access";
import { parseMarkdownNote, serializeMarkdownNote } from "@/features/notes/markdown-codec";
import { createNotePage } from "@/features/notes/note-model";
import type {
  CreateNotePageInput,
  NotePage,
  NotePageSummary,
  NotesDirectoryInfo,
  NotesStorage,
} from "@/features/notes/note-types";

export type {
  CreateNotePageInput,
  NotePage,
  NotePageSummary,
  NotesDirectoryInfo,
  NotesStorage,
} from "@/features/notes/note-types";

export {
  buildSentenceMarkdownSnippet,
  buildWordMarkdownSnippet,
  createNoteBlock,
  createNotePage,
  reorderNoteBlocks,
  resolveSlashCommandMatches,
} from "@/features/notes/note-model";

type MemoryStoreInput = {
  directoryName?: string;
  pages?: NotePage[];
};

type FileSystemWindow = Window &
  typeof globalThis & {
    showDirectoryPicker: (
      options?: { mode?: "read" | "readwrite" },
    ) => Promise<FileSystemDirectoryHandle>;
  };

type FileHandle = FileSystemHandle & {
  getFile: () => Promise<File>;
  name: string;
};

type IterableDirectoryHandle = FileSystemDirectoryHandle & {
  removeEntry: (name: string) => Promise<void>;
  values: () => AsyncIterable<FileSystemHandle>;
};

function sortPageSummaries(pages: NotePageSummary[]) {
  return [...pages].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function searchPageSummaries(pages: NotePage[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return sortPageSummaries(pages.map(toSummary));
  }

  return sortPageSummaries(
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

function normalizeRelativePath(value: string) {
  return value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

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

async function readDirectoryPages(
  handle: FileSystemDirectoryHandle,
  parentPath = "",
): Promise<NotePage[]> {
  const iterableHandle = handle as IterableDirectoryHandle;
  const pages: NotePage[] = [];

  for await (const entry of iterableHandle.values()) {
    const relativePath = normalizeRelativePath(
      parentPath ? `${parentPath}/${entry.name}` : entry.name,
    );

    if (entry.kind === "directory") {
      pages.push(...(await readDirectoryPages(entry as FileSystemDirectoryHandle, relativePath)));
      continue;
    }

    if (!entry.name.toLowerCase().endsWith(".md")) {
      continue;
    }

    const fileHandle = entry as FileHandle;
    const file = await fileHandle.getFile();
    const markdown = await file.text();
    const page = parseMarkdownNote({
      fileName: fileHandle.name,
      markdown,
      relativePath,
    });

    if (page) {
      pages.push(page);
    }
  }

  return pages.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

async function getOrCreateDirectoryHandle(
  handle: FileSystemDirectoryHandle,
  pathSegments: string[],
) {
  let currentHandle = handle;

  for (const segment of pathSegments) {
    currentHandle = await currentHandle.getDirectoryHandle(segment, { create: true });
  }

  return currentHandle;
}

async function writeDirectoryPage(handle: FileSystemDirectoryHandle, page: NotePage) {
  const normalizedPath = normalizeRelativePath(page.relativePath || page.fileName);
  const pathSegments = normalizedPath.split("/").filter(Boolean);
  const fileName = pathSegments.pop() ?? page.fileName;
  const targetDirectory = await getOrCreateDirectoryHandle(handle, pathSegments);
  const fileHandle = await targetDirectory.getFileHandle(fileName, { create: true });
  const writer = await fileHandle.createWritable();
  await writer.write(serializeMarkdownNote(page));
  await writer.close();
}

async function removeDirectoryPage(handle: FileSystemDirectoryHandle, page: NotePage) {
  const normalizedPath = normalizeRelativePath(page.relativePath || page.fileName);
  const pathSegments = normalizedPath.split("/").filter(Boolean);
  const fileName = pathSegments.pop();

  if (!fileName) {
    return;
  }

  const targetDirectory = pathSegments.length
    ? await getOrCreateDirectoryHandle(handle, pathSegments)
    : handle;

  await (targetDirectory as IterableDirectoryHandle).removeEntry(fileName);
}

class BrowserMarkdownNotesStorage implements NotesStorage {
  private cachedDirectoryHandle: FileSystemDirectoryHandle | null = null;

  async createPage(input?: CreateNotePageInput) {
    const handle = await this.requireDirectoryHandle();
    const page = createNotePage({
      icon: input?.icon ?? "文",
      title: input?.title ?? "未命名页面",
    });

    await writeDirectoryPage(handle, page);
    return page;
  }

  async deletePage(id: string) {
    const handle = await this.requireDirectoryHandle();
    const pages = await readDirectoryPages(handle);
    const page = pages.find((item) => item.id === id);

    if (!page) {
      return;
    }

    await removeDirectoryPage(handle, page);
  }

  async getDirectoryInfo(): Promise<NotesDirectoryInfo> {
    const handle = await this.getDirectoryHandle();

    return {
      directoryName: handle?.name ?? null,
      isConfigured: Boolean(handle),
      isSupported: this.isSupported(),
    };
  }

  async getPage(id: string) {
    const handle = await this.requireDirectoryHandle();
    const pages = await readDirectoryPages(handle);
    return pages.find((page) => page.id === id) ?? null;
  }

  async listPages() {
    const handle = await this.getDirectoryHandle();

    if (!handle) {
      return [];
    }

    const pages = await readDirectoryPages(handle);
    return sortPageSummaries(pages.map(toSummary));
  }

  async pickDirectory() {
    if (!this.isSupported()) {
      return {
        directoryName: null,
        isConfigured: false,
        isSupported: false,
      };
    }

    const handle = await (window as FileSystemWindow).showDirectoryPicker({
      mode: "readwrite",
    });

    await saveDirectoryHandle(handle);
    this.cachedDirectoryHandle = handle;

    return {
      directoryName: handle.name,
      isConfigured: true,
      isSupported: true,
    };
  }

  async savePage(page: NotePage) {
    const handle = await this.requireDirectoryHandle();
    const nextPage = {
      ...page,
      updatedAt: new Date().toISOString(),
    };

    await writeDirectoryPage(handle, nextPage);
    return toSummary(nextPage);
  }

  async searchPages(query: string) {
    const handle = await this.getDirectoryHandle();

    if (!handle) {
      return [];
    }

    return searchPageSummaries(await readDirectoryPages(handle), query);
  }

  private async getDirectoryHandle() {
    if (!this.isSupported()) {
      return null;
    }

    if (this.cachedDirectoryHandle) {
      const hasPermission = await verifyDirectoryPermission(this.cachedDirectoryHandle);
      return hasPermission ? this.cachedDirectoryHandle : null;
    }

    const savedHandle = await loadDirectoryHandle();

    if (!savedHandle) {
      return null;
    }

    const hasPermission = await verifyDirectoryPermission(savedHandle);

    if (!hasPermission) {
      return null;
    }

    this.cachedDirectoryHandle = savedHandle;
    return savedHandle;
  }

  private isSupported() {
    return typeof window !== "undefined" && "showDirectoryPicker" in window && "indexedDB" in window;
  }

  private async requireDirectoryHandle() {
    const handle = await this.getDirectoryHandle();

    if (!handle) {
      throw new Error("请先选择一个本地笔记文件夹。");
    }

    return handle;
  }
}

export function createMemoryNotesStorage(input?: MemoryStoreInput): NotesStorage {
  let pages = [...(input?.pages ?? [createNotePage()])];
  const directoryInfo: NotesDirectoryInfo = {
    directoryName: input?.directoryName ?? "学习笔记",
    isConfigured: true,
    isSupported: true,
  };

  return {
    async createPage(value) {
      const page = createNotePage({
        icon: value?.icon ?? "文",
        title: value?.title ?? "未命名页面",
      });
      pages = [page, ...pages].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      return page;
    },
    async deletePage(id) {
      pages = pages.filter((page) => page.id !== id);
    },
    async getDirectoryInfo() {
      return directoryInfo;
    },
    async getPage(id) {
      return pages.find((page) => page.id === id) ?? null;
    },
    async listPages() {
      return sortPageSummaries(pages.map(toSummary));
    },
    async pickDirectory() {
      return directoryInfo;
    },
    async savePage(page) {
      const nextPage = {
        ...page,
        updatedAt: new Date().toISOString(),
      };
      pages = [nextPage, ...pages.filter((item) => item.id !== page.id)];
      return toSummary(nextPage);
    },
    async searchPages(query) {
      return searchPageSummaries(pages, query);
    },
  };
}

let browserStorage: NotesStorage | null = null;

/**
 * Returns the browser (File System Access API) notes storage.
 * For the platform-aware version that also handles Electron, use
 * `getNotesStorage()` from `@/platform/notes/get-notes-storage`.
 */
export function getBrowserNotesStorage(): NotesStorage | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (!browserStorage) {
    browserStorage = new BrowserMarkdownNotesStorage();
  }

  return browserStorage;
}
