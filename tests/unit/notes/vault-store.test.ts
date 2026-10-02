import { describe, expect, it, vi } from "vitest";
import { createVaultStore } from "@/features/notes/vault/vault-store";
import type { VaultClient, VaultEntry } from "@/features/notes/vault/vault-types";

function createClient(onRead?: (path: string) => void): VaultClient {
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
    ["notes/progress.json", '{"lesson":"Grammar","score":92}'],
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
    readFile: async (path) => {
      onRead?.(path);
      return files.get(path) ?? null;
    },
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
  it("loads requested paths against a real listing even before the first refresh", async () => {
    const store = createVaultStore(createClient());
    const loaded = await store.loadDocuments(["notes/grammar.md"]);
    expect(loaded.entries.some((entry) => entry.path === "notes/grammar.md")).toBe(true);
    expect(loaded.documents.find((doc) => doc.path === "notes/grammar.md")?.rawSource).toContain("Core note");
  });

  it("queues lazy loading behind an unfinished directory refresh", async () => {
    const client = createClient();
    const originalList = client.listEntries;
    let releaseList!: () => void;
    client.listEntries = async () => {
      await new Promise<void>((resolve) => { releaseList = resolve; });
      return originalList();
    };
    const store = createVaultStore(client);
    const refresh = store.refresh();
    await Promise.resolve();
    let published = false;
    const load = store.loadDocuments(["notes/grammar.md"]).then((snapshot) => { published = true; return snapshot; });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(published).toBe(false);
    releaseList();
    await refresh;
    const loaded = await load;
    expect(loaded.documents.find((doc) => doc.path === "notes/grammar.md")?.rawSource).toContain("Core note");
  });

  it("serializes refreshes so an older read cannot publish after a newer event", async () => {
    let releaseFirstList: () => void = () => undefined;
    let generation = 0;
    const client: VaultClient = {
      ...createClient(),
      listEntries: vi.fn(async (): Promise<VaultEntry[]> => {
        generation += 1;
        const current = generation;
        if (current === 1) {
          await new Promise<void>((resolve) => {
            releaseFirstList = resolve;
          });
        }
        return [
          {
            kind: "file",
            mtime: `2026-09-01T00:00:0${current}.000Z`,
            name: `generation-${current}.md`,
            path: `generation-${current}.md`,
            size: current,
          },
        ];
      }),
      readFile: async (path) => `# ${path}`,
    };
    const store = createVaultStore(client);

    const first = store.refresh();
    const second = store.refresh();
    await Promise.resolve();

    expect(client.listEntries).toHaveBeenCalledTimes(1);
    releaseFirstList();
    await Promise.all([first, second]);

    expect(client.listEntries).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().entries.map((entry) => entry.path)).toEqual([
      "generation-2.md",
    ]);
  });

  it("keeps startup reads bounded for a large vault", async () => {
    const readFile = vi.fn(async (path: string) => `# ${path}`);
    const client = {
      ...createClient(),
      listEntries: async () =>
        Array.from({ length: 1_000 }, (_value, index) => {
          const path = `notes/${String(index).padStart(4, "0")}.md`;
          return {
            kind: "file" as const,
            mtime: "2026-07-29T00:00:00.000Z",
            name: path.split("/").at(-1) ?? path,
            path,
            size: 16,
          };
        }),
      readFile,
    };
    const store = createVaultStore(client);

    await store.refresh();
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(readFile).toHaveBeenLastCalledWith("notes/0000.md");

    await store.loadDocuments(["notes/0999.md"]);
    expect(readFile).toHaveBeenCalledTimes(2);
    expect(readFile).toHaveBeenLastCalledWith("notes/0999.md");
  });

  it("lists the vault eagerly but reads note content only when requested", async () => {
    const reads: string[] = [];
    const store = createVaultStore(createClient((path) => reads.push(path)));
    const initialSnapshot = await store.refresh();

    expect(initialSnapshot.documents.map((document) => document.path)).toEqual([
      "notes/daily.md",
    ]);
    expect(reads).toEqual(["notes/daily.md"]);
    expect(initialSnapshot.entries.map((entry) => entry.path)).toContain(
      "assets/audio.wav",
    );
    expect(initialSnapshot.entries.map((entry) => entry.path)).not.toContain(
      ".claude/skills/product-complete.md",
    );
    expect(initialSnapshot.entries.map((entry) => entry.path)).not.toContain(
      "视频区/analysis/report.md",
    );

    const snapshot = await store.loadDocuments([
      "notes/grammar.md",
      "notes/progress.json",
    ]);
    const results = store.search("shadowing");

    expect(snapshot.documents).toHaveLength(3);
    expect(snapshot.documents[0]?.parsed.title).toBe("Daily Review");
    expect(
      snapshot.documents.find((document) => document.path === "notes/progress.json"),
    ).toMatchObject({
      formatId: "json",
      frontmatter: {},
      parsed: { backlinks: [], headings: [], title: "progress" },
    });
    expect(snapshot.backlinks["notes/grammar.md"]).toEqual(["notes/daily.md"]);
    expect(results.map((document) => document.path)).toEqual(["notes/daily.md"]);
    expect(reads).toEqual([
      "notes/daily.md",
      "notes/grammar.md",
      "notes/progress.json",
    ]);
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
