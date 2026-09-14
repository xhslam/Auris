import { describe, expect, it } from "vitest";
import { buildVaultExportManifest } from "@/features/notes/vault/vault-export-manifest";
import { restoreVaultExportFolder } from "@/features/notes/vault/vault-export-restore";
import { createVaultStore } from "@/features/notes/vault/vault-store";
import type { VaultClient, VaultEntry } from "@/features/notes/vault/vault-types";

const dailySource = [
  "---",
  "sourceAudio: assets/audio.wav",
  "tags:",
  "  - frontmatter-tag",
  "---",
  "# Daily",
  "",
  "Practice [[Grammar]] with #body-tag.",
].join("\n");
const grammarSource = "# Grammar\n\nCore note";
const audioBytes = new Uint8Array([1, 2, 3, 4]);

function createMemoryVaultClient(files: Map<string, string | Uint8Array>): VaultClient {
  return {
    createDirectory: async () => undefined,
    deleteEntry: async (path) => {
      files.delete(path);
    },
    listEntries: async () =>
      Array.from(files.entries()).map(([path, content]): VaultEntry => ({
        kind: "file",
        mtime: "2026-05-09T00:00:00.000Z",
        name: path.split("/").at(-1) ?? path,
        path,
        size:
          typeof content === "string" ? content.length : content.byteLength,
      })),
    moveEntry: async (fromPath, toPath) => {
      const content = files.get(fromPath);

      if (content === undefined) {
        return;
      }

      files.delete(fromPath);
      files.set(toPath, content);
    },
    readFile: async (path) => {
      const content = files.get(path);

      return typeof content === "string" ? content : null;
    },
    renameEntry: async (fromPath, toPath) => {
      const content = files.get(fromPath);

      if (content === undefined) {
        return;
      }

      files.delete(fromPath);
      files.set(toPath, content);
    },
    rootPath: "C:/vault",
    subscribeToChanges: () => () => undefined,
    writeFile: async (path, content) => {
      files.set(path, content);
    },
  };
}

describe("vault-export-restore", () => {
  it("restores markdown files, audio assets, tags, and backlinks from an exported vault folder", async () => {
    const sourceFiles = new Map<string, string | Uint8Array>([
      ["notes/daily.md", dailySource],
      ["notes/grammar.md", grammarSource],
      ["assets/audio.wav", audioBytes],
    ]);
    const sourceStore = createVaultStore(createMemoryVaultClient(sourceFiles));
    const sourceSnapshot = await sourceStore.rebuildIndex();
    const manifest = buildVaultExportManifest(sourceSnapshot);
    const restoredFiles = new Map<string, string | Uint8Array>();

    await restoreVaultExportFolder(
      manifest,
      {
        readFile: async (path) => sourceFiles.get(path) ?? null,
      },
      {
        createDirectory: async () => undefined,
        writeFile: async (path, content) => {
          restoredFiles.set(path, content);
        },
      },
    );

    const restoredStore = createVaultStore(createMemoryVaultClient(restoredFiles));
    const restoredSnapshot = await restoredStore.rebuildIndex();

    expect(restoredFiles.get("notes/daily.md")).toBe(dailySource);
    expect(restoredFiles.get("assets/audio.wav")).toEqual(audioBytes);
    expect(
      restoredSnapshot.documents.find((document) => document.path === "notes/daily.md")
        ?.frontmatter,
    ).toMatchObject({
      sourceAudio: "assets/audio.wav",
      tags: ["frontmatter-tag"],
    });
    expect(
      restoredSnapshot.documents.find((document) => document.path === "notes/daily.md")
        ?.parsed.tags,
    ).toEqual(["body-tag", "frontmatter-tag"]);
    expect(restoredSnapshot.backlinks["notes/grammar.md"]).toEqual([
      "notes/daily.md",
    ]);
  });
});
