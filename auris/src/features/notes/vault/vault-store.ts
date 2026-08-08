import { buildBacklinksIndex } from "@/features/notes/documents/backlinks";
import { loadNoteDocument } from "@/features/notes/documents/document-repository";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import { searchDocuments } from "@/features/notes/documents/document-search";
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
};

function isMarkdownPath(path: string) {
  return path.toLowerCase().endsWith(".md");
}

function isEditableFile(entry: VaultEntry) {
  return entry.kind === "file" && isMarkdownPath(entry.path);
}

function chooseInitialPath(entries: VaultEntry[]) {
  return entries.find(isEditableFile)?.path ?? null;
}

export function createVaultStore(client: VaultClient) {
  let snapshot: VaultSnapshot = {
    backlinks: {},
    documents: [],
    entries: [],
    generatedAt: new Date(0).toISOString(),
    rootPath: client.rootPath,
  };
  const documentCache = new Map<string, NoteDocument>();
  let fullyIndexed = false;

  function publish(entries: VaultEntry[]) {
    const documents = entries
      .map((entry) => documentCache.get(entry.path) ?? null)
      .filter((document): document is NoteDocument => document !== null);
    const backlinks = buildBacklinksIndex(documents);

    snapshot = {
      backlinks,
      documents: documents.map((document) => ({
        ...document,
        parsed: {
          ...document.parsed,
          backlinks: backlinks[document.path] ?? [],
        },
      })),
      entries,
      generatedAt: new Date().toISOString(),
      rootPath: client.rootPath,
    };

    return snapshot;
  }

  async function readEntries(entries: VaultEntry[], paths: Iterable<string>) {
    const requestedPaths = new Set(
      Array.from(paths, (path) => normalizeVaultPath(path)),
    );
    const entriesToRead = entries.filter(
      (entry) => isEditableFile(entry) && requestedPaths.has(entry.path),
    );
    const loaded = await mapWithConcurrency(
      entriesToRead,
      VAULT_READ_CONCURRENCY,
      async (entry) => ({
        document: await loadNoteDocument(client, entry),
        path: entry.path,
      }),
    );

    loaded.forEach(({ document, path }) => {
      if (document) {
        documentCache.set(path, document);
      } else {
        documentCache.delete(path);
      }
    });
  }

  async function refresh(options: VaultRefreshOptions = {}) {
    const entries = sortVaultEntries(
      (await client.listEntries()).filter(
        (entry) => !isHiddenVaultPath(entry.path),
      ),
    );
    const editablePaths = new Set(
      entries.filter(isEditableFile).map((entry) => entry.path),
    );

    documentCache.forEach((_document, path) => {
      if (!editablePaths.has(path)) {
        documentCache.delete(path);
      }
    });

    const requestedPaths = options.loadAll
      ? editablePaths
      : new Set([
          ...documentCache.keys(),
          ...(options.eagerPaths ?? []).map(normalizeVaultPath),
        ]);

    if (!options.loadAll && requestedPaths.size === 0) {
      const initialPath = chooseInitialPath(entries);
      if (initialPath) requestedPaths.add(initialPath);
    }

    await readEntries(entries, requestedPaths);
    fullyIndexed = options.loadAll === true;
    return publish(entries);
  }

  async function loadDocuments(paths: readonly string[]) {
    const requestedPaths = paths
      .map(normalizeVaultPath)
      .filter((path) => !documentCache.has(path));

    if (requestedPaths.length === 0) {
      return snapshot;
    }

    await readEntries(snapshot.entries, requestedPaths);
    return publish(snapshot.entries);
  }

  function getSnapshot() {
    return snapshot;
  }

  function search(query: string) {
    return searchDocuments(snapshot.documents, query);
  }

  return {
    getSnapshot,
    isFullyIndexed: () => fullyIndexed,
    loadDocuments,
    rebuildIndex: () => refresh({ loadAll: true }),
    refresh,
    search,
    subscribeToExternalChanges: client.subscribeToChanges,
  };
}
