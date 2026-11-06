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

  it("skips disk readFile and re-parsing on normal refresh when fingerprints match", async () => {
    const reads: string[] = [];
    const client = createClient((path) => reads.push(path));
    const store = createVaultStore(client);

    // Initial load: loads all documents
    await store.refresh({ loadAll: true });
    expect(reads.length).toBeGreaterThan(0);

    store.resetDebugStats();
    reads.length = 0;

    // Subsequent normal refresh with unchanged fingerprints
    const nextSnapshot = await store.refresh();
    const stats = store.getDebugStats();

    expect(reads).toEqual([]);
    expect(stats.readFileCalls).toBe(0);
    expect(stats.reusedDocumentCount).toBeGreaterThan(0);
    expect(nextSnapshot.documents.length).toBeGreaterThan(0);
  });

  it("reads only the modified file when a single file mtime/size changes, preserving other references", async () => {
    const reads: string[] = [];
    const client = createClient((path) => reads.push(path));
    const store = createVaultStore(client);

    const snapshot1 = await store.refresh({ loadAll: true });
    const daily1 = snapshot1.documents.find((d) => d.path === "notes/daily.md");
    const grammar1 = snapshot1.documents.find((d) => d.path === "notes/grammar.md");

    reads.length = 0;
    store.resetDebugStats();

    // Modify grammar.md on disk
    await client.writeFile("notes/grammar.md", "# Grammar\n\nUpdated note content");
    // List entries will reflect updated size / mtime for grammar.md

    const snapshot2 = await store.refresh();
    const stats = store.getDebugStats();

    expect(reads).toEqual(["notes/grammar.md"]);
    expect(stats.readFileCalls).toBe(1);

    const daily2 = snapshot2.documents.find((d) => d.path === "notes/daily.md");
    const grammar2 = snapshot2.documents.find((d) => d.path === "notes/grammar.md");

    // daily.md was unchanged, its document reference must be preserved!
    expect(daily2).toBe(daily1);
    // grammar.md changed, its document reference must be updated!
    expect(grammar2).not.toBe(grammar1);
    expect(grammar2?.rawSource).toContain("Updated note content");
  });

  it("always re-reads files when mtime is null", async () => {
    const reads: string[] = [];
    const client = createClient((path) => reads.push(path));
    // Wrap listEntries to return null mtime for daily.md
    const origList = client.listEntries;
    client.listEntries = async () => {
      const list = await origList();
      return list.map((e) => (e.path === "notes/daily.md" ? { ...e, mtime: null } : e));
    };

    const store = createVaultStore(client);
    await store.refresh();
    expect(reads).toContain("notes/daily.md");

    reads.length = 0;
    await store.refresh();
    // Because mtime was null, daily.md cannot be safely assumed unchanged and must be re-read
    expect(reads).toContain("notes/daily.md");
  });

  it("forces re-read of eagerPaths even when metadata matches", async () => {
    const reads: string[] = [];
    const client = createClient((path) => reads.push(path));
    const store = createVaultStore(client);

    await store.refresh({ loadAll: true });
    reads.length = 0;

    await store.refresh({ eagerPaths: ["notes/grammar.md"] });
    expect(reads).toEqual(["notes/grammar.md"]);
  });

  it("keeps cold startup reads bounded to initial document in a 10,000 note vault", async () => {
    const readFile = vi.fn(async (path: string) => `# ${path}`);
    const client: VaultClient = {
      ...createClient(),
      listEntries: async () =>
        Array.from({ length: 10_000 }, (_val, i) => {
          const path = `notes/note-${String(i).padStart(5, "0")}.md`;
          return {
            kind: "file",
            mtime: "2026-11-05T00:00:00.000Z",
            name: `note-${String(i).padStart(5, "0")}.md`,
            path,
            size: 24,
          };
        }),
      readFile,
    };

    const store = createVaultStore(client);
    const snapshot = await store.refresh();

    expect(readFile).toHaveBeenCalledTimes(1);
    expect(snapshot.documents).toHaveLength(1);
    expect(snapshot.entries).toHaveLength(10_000);
  });

  it("coalesces 20 concurrent refresh calls into at most one in-flight and one trailing execution", async () => {
    let releaseList!: () => void;
    let listCallCount = 0;
    const client: VaultClient = {
      ...createClient(),
      listEntries: async () => {
        listCallCount += 1;
        if (listCallCount === 1) {
          await new Promise<void>((resolve) => {
            releaseList = resolve;
          });
        }
        return [
          {
            kind: "file",
            mtime: "2026-11-05T00:00:00.000Z",
            name: "test.md",
            path: "test.md",
            size: 10,
          },
        ];
      },
      readFile: async () => "# Test",
    };

    const store = createVaultStore(client);

    // Call 1: active execution
    const firstPromise = store.refresh();
    await Promise.resolve();

    // Calls 2 through 20: all arrive while first is in-flight
    const trailingPromises = Array.from({ length: 19 }, () => store.refresh());

    expect(listCallCount).toBe(1);
    releaseList();

    const allResults = await Promise.all([firstPromise, ...trailingPromises]);
    expect(allResults).toHaveLength(20);

    const stats = store.getDebugStats();
    // Exactly 1 active execution + 1 trailing execution
    expect(stats.executedRefreshCount).toBe(2);
    expect(stats.coalescedRefreshCount).toBe(19);
    expect(listCallCount).toBe(2);
  });

  it("settles caller A's promise immediately without waiting for trailing queue B to finish", async () => {
    let releaseTrailingList: () => void = () => undefined;
    let listCallCount = 0;
    const client: VaultClient = {
      ...createClient(),
      listEntries: async () => {
        listCallCount += 1;
        if (listCallCount === 2) {
          // Hold up trailing batch
          await new Promise<void>((resolve) => {
            releaseTrailingList = resolve;
          });
        }
        return [
          {
            kind: "file",
            mtime: "2026-11-06T00:00:00.000Z",
            name: `note-${listCallCount}.md`,
            path: `note-${listCallCount}.md`,
            size: 10,
          },
        ];
      },
      readFile: async () => "# Hello",
    };

    const store = createVaultStore(client);

    // Caller A
    const promiseA = store.refresh();
    await Promise.resolve();

    // Caller B queues behind A
    let promiseBSettled = false;
    const promiseB = store.refresh().then((res) => {
      promiseBSettled = true;
      return res;
    });

    // Caller A should settle even while B is still suspended!
    const resultA = await promiseA;
    expect(resultA).toBeDefined();
    expect(promiseBSettled).toBe(false);
    expect(resultA.revision).toBe(1);

    // Now release B
    releaseTrailingList();
    const resultB = await promiseB;
    expect(resultB.revision).toBe(2);
    expect(resultB.revision).toBeGreaterThan(resultA.revision!);
  });

  it("stamps rootId, generation and monotonic revision on snapshot and envelope", async () => {
    const store = createVaultStore(createClient(), {
      generation: 42,
      rootId: "custom-root",
    });

    const envelope0 = store.getEnvelope();
    expect(envelope0.generation).toBe(42);
    expect(envelope0.rootId).toBe("custom-root");
    expect(envelope0.revision).toBe(0);

    const snap1 = await store.refresh();
    expect(snap1.generation).toBe(42);
    expect(snap1.rootId).toBe("custom-root");
    expect(snap1.revision).toBe(1);

    const snap2 = await store.loadDocuments(["notes/grammar.md"]);
    expect(snap2.revision).toBe(2);
  });

  it("preserves fullyIndexed status when refreshed without loadAll if all entries are cached", async () => {
    const store = createVaultStore(createClient());
    expect(store.isFullyIndexed()).toBe(false);

    // Initial loadAll sets fullyIndexed to true
    await store.refresh({ loadAll: true });
    expect(store.isFullyIndexed()).toBe(true);

    // Normal refresh without loadAll should NOT reset fullyIndexed to false
    await store.refresh();
    expect(store.isFullyIndexed()).toBe(true);
  });

  it("skips rebuilding backlinks if documents have not changed", async () => {
    const store = createVaultStore(createClient());
    await store.refresh({ loadAll: true });

    const stats1 = store.getDebugStats();
    const visits1 = stats1.backlinkDocumentVisits;
    expect(visits1).toBeGreaterThan(0);

    // Refresh again with no document changes
    await store.refresh();
    const stats2 = store.getDebugStats();
    expect(stats2.backlinkDocumentVisits).toBe(visits1);
  });
});
