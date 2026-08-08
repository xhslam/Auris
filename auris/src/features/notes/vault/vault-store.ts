import { buildBacklinksIndex } from "@/features/notes/documents/backlinks";
import { loadNoteDocument } from "@/features/notes/documents/document-repository";
import { searchDocuments } from "@/features/notes/documents/document-search";
import {
  VAULT_READ_CONCURRENCY,
  mapWithConcurrency,
} from "@/features/notes/vault/map-with-concurrency";
import { sortVaultEntries } from "@/features/notes/vault/vault-entry-sort";
import { isHiddenVaultPath } from "@/features/notes/vault/vault-path";
import type { VaultClient, VaultSnapshot } from "@/features/notes/vault/vault-types";

function isMarkdownPath(path: string) {
  return path.toLowerCase().endsWith(".md");
}

export function createVaultStore(client: VaultClient) {
  let snapshot: VaultSnapshot = {
    backlinks: {},
    documents: [],
    entries: [],
    generatedAt: new Date(0).toISOString(),
    rootPath: client.rootPath,
  };

  async function refresh() {
    const entries = sortVaultEntries(
      (await client.listEntries()).filter((entry) => !isHiddenVaultPath(entry.path)),
    );
    const documents = (
      await mapWithConcurrency(
        entries.filter((entry) => entry.kind === "file" && isMarkdownPath(entry.path)),
        VAULT_READ_CONCURRENCY,
        (entry) => loadNoteDocument(client, entry),
      )
    ).filter((document): document is NonNullable<typeof document> => document !== null);
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

  function getSnapshot() {
    return snapshot;
  }

  function search(query: string) {
    return searchDocuments(snapshot.documents, query);
  }

  return {
    getSnapshot,
    rebuildIndex: refresh,
    refresh,
    search,
    subscribeToExternalChanges: client.subscribeToChanges,
  };
}
