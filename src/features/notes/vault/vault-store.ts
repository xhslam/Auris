import { buildBacklinksIndex } from "@/features/notes/documents/backlinks";
import {
  getParsedDocumentCount,
  loadNoteDocument,
  resetParsedDocumentCount,
} from "@/features/notes/documents/document-repository";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import { searchDocuments } from "@/features/notes/documents/document-search";
import { getFormatDescriptor } from "@/features/notes/formats/format-registry";
import {
  VAULT_READ_CONCURRENCY,
  mapWithConcurrency,
} from "@/features/notes/vault/map-with-concurrency";
import { sortVaultEntries } from "@/features/notes/vault/vault-entry-sort";
import {
  isHiddenVaultPath,
  normalizeVaultPath,
} from "@/features/notes/vault/vault-path";
import type {
  VaultClient,
  VaultEntry,
  VaultSnapshot,
} from "@/features/notes/vault/vault-types";

export type VaultRefreshOptions = {
  eagerPaths?: readonly string[];
  loadAll?: boolean;
  forceReload?: boolean;
};

export type VaultStoreDebugStats = {
  listEntriesCalls: number;
  readFileCalls: number;
  parsedDocumentCount: number;
  executedRefreshCount: number;
  coalescedRefreshCount: number;
  reusedDocumentCount: number;
  backlinkDocumentVisits: number;
};

type CachedVaultDocument = {
  document: NoteDocument;
  mtime: string | null;
  size: number | null;
};

type Deferred<T> = {
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

type PendingRefreshRequest = {
  eagerPaths: Set<string>;
  loadAll: boolean;
  forceReload: boolean;
  deferreds: Deferred<VaultSnapshot>[];
};

type PendingLoadRequest = {
  paths: Set<string>;
  deferreds: Deferred<VaultSnapshot>[];
};

function isEditableFile(entry: VaultEntry) {
  return entry.kind === "file" && getFormatDescriptor(entry.path).canEdit;
}

function chooseInitialPath(entries: VaultEntry[]) {
  const editableEntries = entries.filter(isEditableFile);

  return (
    editableEntries.find(
      (entry) => getFormatDescriptor(entry.path).id === "markdown",
    )?.path ??
    editableEntries.find(
      (entry) => getFormatDescriptor(entry.path).id !== "unknown-text",
    )?.path ??
    editableEntries[0]?.path ??
    null
  );
}

function areBacklinksEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function createVaultStore(client: VaultClient) {
  let snapshot: VaultSnapshot = {
    backlinks: {},
    documents: [],
    entries: [],
    generatedAt: new Date(0).toISOString(),
    rootPath: client.rootPath,
  };

  const documentCache = new Map<string, CachedVaultDocument>();
  let fullyIndexed = false;

  let inFlightExecution: Promise<VaultSnapshot> | null = null;
  let pendingRefresh: PendingRefreshRequest | null = null;
  let pendingLoad: PendingLoadRequest | null = null;

  let stats: VaultStoreDebugStats = {
    backlinkDocumentVisits: 0,
    coalescedRefreshCount: 0,
    executedRefreshCount: 0,
    listEntriesCalls: 0,
    parsedDocumentCount: 0,
    readFileCalls: 0,
    reusedDocumentCount: 0,
  };

  function getDebugStats(): VaultStoreDebugStats {
    return {
      ...stats,
      parsedDocumentCount: getParsedDocumentCount(),
    };
  }

  function resetDebugStats(): void {
    stats = {
      backlinkDocumentVisits: 0,
      coalescedRefreshCount: 0,
      executedRefreshCount: 0,
      listEntriesCalls: 0,
      parsedDocumentCount: 0,
      readFileCalls: 0,
      reusedDocumentCount: 0,
    };
    resetParsedDocumentCount();
  }

  function publish(entries: VaultEntry[]) {
    const documents: NoteDocument[] = [];
    for (const entry of entries) {
      const cached = documentCache.get(entry.path);
      if (cached) {
        documents.push(cached.document);
      }
    }

    const markdownDocs = documents.filter((doc) => doc.formatId === "markdown");
    stats.backlinkDocumentVisits += markdownDocs.length * 2;
    const backlinks = buildBacklinksIndex(markdownDocs);

    let anyDocumentChanged = false;
    const nextDocuments = documents.map((document) => {
      const nextDocBacklinks = backlinks[document.path] ?? [];
      const currentDocBacklinks = document.parsed.backlinks ?? [];

      if (areBacklinksEqual(currentDocBacklinks, nextDocBacklinks)) {
        return document;
      }

      anyDocumentChanged = true;
      const updatedDocument: NoteDocument = {
        ...document,
        parsed: {
          ...document.parsed,
          backlinks: nextDocBacklinks,
        },
      };

      const cached = documentCache.get(document.path);
      if (cached) {
        cached.document = updatedDocument;
      }

      return updatedDocument;
    });

    const documentsReferenceUnchanged =
      !anyDocumentChanged &&
      snapshot.documents.length === nextDocuments.length &&
      snapshot.documents.every((doc, i) => doc === nextDocuments[i]);

    snapshot = {
      backlinks,
      documents: documentsReferenceUnchanged ? snapshot.documents : nextDocuments,
      entries,
      generatedAt: new Date().toISOString(),
      rootPath: client.rootPath,
    };

    return snapshot;
  }

  async function readEntries(
    entries: VaultEntry[],
    pathsToRead: Set<string>,
  ) {
    const entriesToRead = entries.filter(
      (entry) => isEditableFile(entry) && pathsToRead.has(entry.path),
    );

    const loaded = await mapWithConcurrency(
      entriesToRead,
      VAULT_READ_CONCURRENCY,
      async (entry) => {
        stats.readFileCalls += 1;
        const document = await loadNoteDocument(client, entry);
        return {
          document,
          entry,
          path: entry.path,
        };
      },
    );

    loaded.forEach(({ document, entry, path }) => {
      if (document) {
        documentCache.set(path, {
          document,
          mtime: entry.mtime,
          size: entry.size,
        });
      } else {
        documentCache.delete(path);
      }
    });
  }

  async function performRefresh(options: VaultRefreshOptions = {}): Promise<VaultSnapshot> {
    stats.listEntriesCalls += 1;
    stats.executedRefreshCount += 1;

    const rawEntries = await client.listEntries();
    const entries = sortVaultEntries(
      rawEntries.filter((entry) => !isHiddenVaultPath(entry.path)),
    );
    const editablePaths = new Set(
      entries.filter(isEditableFile).map((entry) => entry.path),
    );

    documentCache.forEach((_cached, path) => {
      if (!editablePaths.has(path)) {
        documentCache.delete(path);
      }
    });

    const eagerSet = new Set((options.eagerPaths ?? []).map(normalizeVaultPath));

    const targetPaths = options.loadAll
      ? editablePaths
      : new Set([
          ...documentCache.keys(),
          ...eagerSet,
        ]);

    if (!options.loadAll && targetPaths.size === 0) {
      const initialPath = chooseInitialPath(entries);
      if (initialPath) targetPaths.add(initialPath);
    }

    const pathsToRead = new Set<string>();

    for (const entry of entries) {
      if (!targetPaths.has(entry.path) || !isEditableFile(entry)) {
        continue;
      }

      if (options.forceReload || eagerSet.has(entry.path)) {
        pathsToRead.add(entry.path);
        continue;
      }

      const cached = documentCache.get(entry.path);
      if (!cached) {
        pathsToRead.add(entry.path);
        continue;
      }

      if (entry.mtime === null || cached.mtime === null) {
        pathsToRead.add(entry.path);
        continue;
      }

      if (cached.mtime === entry.mtime && cached.size === entry.size) {
        stats.reusedDocumentCount += 1;
        continue;
      }

      pathsToRead.add(entry.path);
    }

    if (pathsToRead.size > 0) {
      await readEntries(entries, pathsToRead);
    }

    fullyIndexed = options.loadAll === true;
    return publish(entries);
  }

  async function drainPendingQueue(): Promise<void> {
    while (pendingRefresh !== null || pendingLoad !== null) {
      if (pendingRefresh !== null) {
        const req = pendingRefresh;
        pendingRefresh = null;

        // If there were pending loads, merge their paths into eagerPaths
        if (pendingLoad !== null) {
          pendingLoad.paths.forEach((p) => req.eagerPaths.add(p));
          const loadDeferreds = pendingLoad.deferreds;
          pendingLoad = null;
          req.deferreds.push(...loadDeferreds);
        }

        try {
          const result = await performRefresh({
            eagerPaths: Array.from(req.eagerPaths),
            forceReload: req.forceReload,
            loadAll: req.loadAll,
          });
          req.deferreds.forEach((d) => d.resolve(result));
        } catch (error) {
          req.deferreds.forEach((d) => d.reject(error));
        }
      } else if (pendingLoad !== null) {
        const req = pendingLoad;
        pendingLoad = null;

        try {
          const missingPaths = Array.from(req.paths).filter(
            (path) => !documentCache.has(path),
          );
          if (missingPaths.length > 0) {
            await readEntries(snapshot.entries, new Set(missingPaths));
          }
          const result = publish(snapshot.entries);
          req.deferreds.forEach((d) => d.resolve(result));
        } catch (error) {
          req.deferreds.forEach((d) => d.reject(error));
        }
      }
    }
  }

  function scheduleRefresh(options: VaultRefreshOptions = {}): Promise<VaultSnapshot> {
    if (inFlightExecution !== null) {
      stats.coalescedRefreshCount += 1;

      if (pendingRefresh === null) {
        pendingRefresh = {
          deferreds: [],
          eagerPaths: new Set((options.eagerPaths ?? []).map(normalizeVaultPath)),
          forceReload: !!options.forceReload,
          loadAll: !!options.loadAll,
        };
      } else {
        (options.eagerPaths ?? []).forEach((path) =>
          pendingRefresh!.eagerPaths.add(normalizeVaultPath(path)),
        );
        pendingRefresh.loadAll = pendingRefresh.loadAll || !!options.loadAll;
        pendingRefresh.forceReload = pendingRefresh.forceReload || !!options.forceReload;
      }

      return new Promise<VaultSnapshot>((resolve, reject) => {
        pendingRefresh!.deferreds.push({ reject, resolve });
      });
    }

    const run = async (): Promise<VaultSnapshot> => {
      try {
        const result = await performRefresh(options);
        return result;
      } finally {
        await drainPendingQueue();
        inFlightExecution = null;
      }
    };

    inFlightExecution = run();
    return inFlightExecution;
  }

  function refresh(options: VaultRefreshOptions = {}) {
    return scheduleRefresh(options);
  }

  function loadDocuments(paths: readonly string[]): Promise<VaultSnapshot> {
    const normalizedRequested = paths.map(normalizeVaultPath);

    if (inFlightExecution !== null) {
      if (pendingLoad === null) {
        pendingLoad = {
          deferreds: [],
          paths: new Set(normalizedRequested),
        };
      } else {
        normalizedRequested.forEach((path) => pendingLoad!.paths.add(path));
      }

      return new Promise<VaultSnapshot>((resolve, reject) => {
        pendingLoad!.deferreds.push({ reject, resolve });
      });
    }

    if (snapshot.generatedAt === new Date(0).toISOString()) {
      return scheduleRefresh({ eagerPaths: paths });
    }

    const missingPaths = normalizedRequested.filter((path) => !documentCache.has(path));

    if (missingPaths.length === 0) {
      return Promise.resolve(snapshot);
    }

    const run = async (): Promise<VaultSnapshot> => {
      try {
        await readEntries(snapshot.entries, new Set(missingPaths));
        return publish(snapshot.entries);
      } finally {
        await drainPendingQueue();
        inFlightExecution = null;
      }
    };

    inFlightExecution = run();
    return inFlightExecution;
  }

  function getSnapshot() {
    return snapshot;
  }

  function search(query: string) {
    return searchDocuments(snapshot.documents, query);
  }

  return {
    getDebugStats,
    getSnapshot,
    isFullyIndexed: () => fullyIndexed,
    loadDocuments,
    rebuildIndex: () => refresh({ forceReload: true, loadAll: true }),
    refresh,
    resetDebugStats,
    search,
    subscribeToExternalChanges: client.subscribeToChanges,
  };
}
