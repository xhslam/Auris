import type { NoteWikiLinkIndex } from "@/features/notes/documents/document-types";
import type { SavedSentenceRecord } from "@/features/sentencebook/local-sentencebook-store";
import type { SavedWordRecord } from "@/features/wordbook/local-wordbook-store";
import type { VaultEntry, VaultSnapshot } from "@/features/notes/vault/vault-types";

export type VaultExportManifestDocument = {
  backlinks: string[];
  frontmatter: Record<string, unknown>;
  links: NoteWikiLinkIndex[];
  path: string;
  tags: string[];
  title: string | null;
};

export type VaultExportManifest = {
  documents: Record<string, VaultExportManifestDocument>;
  files: VaultEntry[];
  generatedAt: string;
  learning: {
    sentences: SavedSentenceRecord[];
    words: SavedWordRecord[];
  };
  rootPath: string | null;
  sourceOfTruth: "markdown-vault";
  version: 1;
};

export type BuildVaultExportManifestInput = {
  sentences?: SavedSentenceRecord[];
  words?: SavedWordRecord[];
};

function sortEntries(entries: VaultEntry[]) {
  return [...entries].sort((left, right) => left.path.localeCompare(right.path));
}

export function buildVaultExportManifest(
  snapshot: VaultSnapshot,
  input: BuildVaultExportManifestInput = {},
): VaultExportManifest {
  return {
    documents: Object.fromEntries(
      snapshot.documents.map((document) => [
        document.path,
        {
          backlinks: [...(document.parsed.backlinks ?? [])],
          frontmatter: { ...document.frontmatter },
          links: document.parsed.links.map((link) => ({ ...link })),
          path: document.path,
          tags: [...document.parsed.tags],
          title: document.parsed.title,
        },
      ]),
    ),
    files: sortEntries(snapshot.entries),
    generatedAt: snapshot.generatedAt,
    learning: {
      sentences: [...(input.sentences ?? [])],
      words: [...(input.words ?? [])],
    },
    rootPath: snapshot.rootPath,
    sourceOfTruth: "markdown-vault",
    version: 1,
  };
}
