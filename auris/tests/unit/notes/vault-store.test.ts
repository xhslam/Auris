import { describe, expect, it } from "vitest";
import { createVaultStore } from "@/features/notes/vault/vault-store";
import type { VaultClient } from "@/features/notes/vault/vault-types";

function createClient(): VaultClient {
  const files = new Map<string, string>([
    [".claude/skills/product-complete.md", "# Hidden skill\n\nShould stay out of notes."],
    [
      "notes/daily.md",
      [
        "---",
        "aliases:",
        "  - daily review",
        "---",
        "# Daily Review",
        "",
        "Practice [[Grammar]] with #shadowing.",
      ].join("\n"),
    ],
    ["notes/grammar.md", "# Grammar\n\nCore note"],
    ["视频区/analysis/report.md", "# Video Analysis\n\nShould stay out of notes."],
    ["assets/audio.wav", "binary-placeholder"],
  ]);

  return {
    createDirectory: async () => undefined,
    deleteEntry: async (path) => {
      files.delete(path);
    },
    listEntries: async () =>
      Array.from(files.keys()).map((path) => ({
        kind: "file",
        mtime: "2026-04-04T00:00:00.000Z",
        name: path.split("/").at(-1) ?? path,
        path,
        size: files.get(path)?.length ?? 0,
      })),
    moveEntry: async (fromPath, toPath) => {
      const content = files.get(fromPath);

      if (content) {
        files.delete(fromPath);
        files.set(toPath, content);
      }
    },
    readFile: async (path) => files.get(path) ?? null,
    renameEntry: async (fromPath, toPath) => {
      const content = files.get(fromPath);

      if (content) {
        files.delete(fromPath);
        files.set(toPath, content);
      }
    },
    rootPath: "C:/vault",
    subscribeToChanges: () => () => undefined,
    writeFile: async (path, content) => {
      files.set(path, content);
    },
  };
}

describe("vault-store", () => {
  it("refreshes documents from the vault and exposes searchable metadata", async () => {
    const store = createVaultStore(createClient());
    const snapshot = await store.refresh();
    const results = store.search("shadowing");

    expect(snapshot.documents).toHaveLength(2);
    expect(snapshot.entries.map((entry) => entry.path)).toContain("assets/audio.wav");
    expect(snapshot.entries.map((entry) => entry.path)).not.toContain(".claude/skills/product-complete.md");
    expect(snapshot.entries.map((entry) => entry.path)).not.toContain("视频区/analysis/report.md");
    expect(snapshot.documents[0]?.parsed.title).toBe("Daily Review");
    expect(snapshot.backlinks["notes/grammar.md"]).toEqual(["notes/daily.md"]);
    expect(results.map((document) => document.path)).toEqual(["notes/daily.md"]);
  });

  it("rebuilds the derived index from the vault files", async () => {
    const client = createClient();
    const store = createVaultStore(client);

    await store.refresh();
    await client.writeFile("notes/daily.md", "# Daily Review\n\nPractice [[Pronunciation]].");
    await client.writeFile("notes/pronunciation.md", "# Pronunciation\n\nClear speech.");

    const snapshot = await store.rebuildIndex();

    expect(snapshot.documents.map((document) => document.path)).toContain("notes/pronunciation.md");
    expect(snapshot.backlinks["notes/grammar.md"]).toEqual([]);
    expect(snapshot.backlinks["notes/pronunciation.md"]).toEqual(["notes/daily.md"]);
  });
});
