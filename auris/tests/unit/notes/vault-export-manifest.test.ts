import { describe, expect, it } from "vitest";
import { createNoteDocument } from "@/features/notes/documents/document-repository";
import { buildVaultExportManifest } from "@/features/notes/vault/vault-export-manifest";
import type { VaultSnapshot } from "@/features/notes/vault/vault-types";

function createDocument(path: string, rawSource: string, backlinks: string[] = []) {
  const document = createNoteDocument({
    mtime: "2026-05-03T00:00:00.000Z",
    path,
    rawSource,
  });

  return {
    ...document,
    parsed: {
      ...document.parsed,
      backlinks,
    },
  };
}

describe("vault-export-manifest", () => {
  it("keeps files, audio assets, sentences, tags, links, and backlinks in the export contract", () => {
    const daily = createDocument(
      "notes/daily.md",
      [
        "---",
        "sourceAudio: assets/audio.wav",
        "tags:",
        "  - frontmatter-tag",
        "---",
        "# Daily",
        "",
        "Practice [[Grammar]] with #body-tag.",
      ].join("\n"),
    );
    const grammar = createDocument("notes/grammar.md", "# Grammar", ["notes/daily.md"]);
    const snapshot: VaultSnapshot = {
      backlinks: {
        "notes/daily.md": [],
        "notes/grammar.md": ["notes/daily.md"],
      },
      documents: [daily, grammar],
      entries: [
        {
          kind: "file",
          mtime: "2026-05-03T00:00:00.000Z",
          name: "daily.md",
          path: "notes/daily.md",
          size: 120,
        },
        {
          kind: "file",
          mtime: "2026-05-03T00:00:00.000Z",
          name: "audio.wav",
          path: "assets/audio.wav",
          size: 2048,
        },
        {
          kind: "file",
          mtime: "2026-05-03T00:00:00.000Z",
          name: "grammar.md",
          path: "notes/grammar.md",
          size: 24,
        },
      ],
      generatedAt: "2026-05-03T00:00:00.000Z",
      rootPath: "C:/vault",
    };

    const manifest = buildVaultExportManifest(snapshot, {
      sentences: [
        {
          createdAt: "2026-05-03T00:00:00.000Z",
          id: "sentence-1",
          sourceLabel: "Daily",
          text: "Practice makes progress.",
          translation: "练习带来进步。",
        },
      ],
      words: [
        {
          createdAt: "2026-05-03T00:00:00.000Z",
          definitions: ["to repeat aloud"],
          lexicalCategory: "verb",
          sourceLabel: "Daily",
          synonyms: ["imitate"],
          word: "shadow",
        },
      ],
    });

    expect(manifest.sourceOfTruth).toBe("markdown-vault");
    expect(manifest.files.map((file) => file.path)).toEqual([
      "assets/audio.wav",
      "notes/daily.md",
      "notes/grammar.md",
    ]);
    expect(manifest.documents["notes/daily.md"]).toMatchObject({
      frontmatter: {
        sourceAudio: "assets/audio.wav",
        tags: ["frontmatter-tag"],
      },
      links: [{ alias: null, heading: null, target: "Grammar" }],
      tags: ["body-tag", "frontmatter-tag"],
      title: "Daily",
    });
    expect(manifest.documents["notes/grammar.md"]?.backlinks).toEqual(["notes/daily.md"]);
    expect(manifest.learning.sentences).toHaveLength(1);
    expect(manifest.learning.words[0]?.word).toBe("shadow");
  });
});
