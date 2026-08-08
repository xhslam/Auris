import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createNotesRecoveryStore } = require(
  "../../../../electron/notes/notes-recovery-store.cjs",
);

const roots: string[] = [];

async function createStore() {
  const baseDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "auris-notes-recovery-"),
  );
  roots.push(baseDirectory);
  let tick = 0;
  const store = createNotesRecoveryStore({
    baseDirectory,
    now: () => new Date(Date.UTC(2026, 6, 28, 0, 0, tick++)),
    randomId: () => `id-${tick}`,
  });
  return { baseDirectory, store };
}

describe("durable notes recovery store", () => {
  afterEach(async () => {
    await Promise.all(
      roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })),
    );
  });

  it("atomically replaces and clears hot-exit drafts by vault and path", async () => {
    const { baseDirectory, store } = await createStore();

    await store.captureDraft({
      path: "a.md",
      rawSource: "first",
      vaultRoot: "/vault-a",
    });
    await store.captureDraft({
      path: "a.md",
      rawSource: "second",
      vaultRoot: "/vault-a",
    });
    await store.captureDraft({
      path: "a.md",
      rawSource: "other vault",
      vaultRoot: "/vault-b",
    });

    await expect(store.listDrafts("/vault-a")).resolves.toMatchObject([
      {
        captureId: expect.any(String),
        path: "a.md",
        rawSource: "second",
        schemaVersion: 2,
        vaultRoot: "/vault-a",
      },
    ]);
    await store.clearDraft("a.md", "/vault-a");
    await expect(store.listDrafts("/vault-a")).resolves.toEqual([]);
    await expect(store.listDrafts("/vault-b")).resolves.toHaveLength(1);

    const names = await fs.readdir(baseDirectory);
    expect(names.some((name) => name.includes(".tmp"))).toBe(false);
  });

  it("persists the disk baseline and falls back to the previous valid draft snapshot", async () => {
    const { baseDirectory, store } = await createStore();
    await store.captureDraft({
      baseRawSource: "disk-v1",
      path: "a.md",
      rawSource: "draft-v1",
      vaultRoot: "/vault",
    });
    await store.captureDraft({
      baseRawSource: "disk-v1",
      path: "a.md",
      rawSource: "draft-v2",
      vaultRoot: "/vault",
    });
    await fs.writeFile(
      path.join(baseDirectory, "notes-hot-exit.json"),
      "{corrupt",
      "utf8",
    );

    await expect(store.listDrafts("/vault")).resolves.toMatchObject([
      {
        baseRawSource: "disk-v1",
        rawSource: "draft-v1",
        schemaVersion: 2,
      },
    ]);
  });

  it("captures vault-isolated workspace sessions and recovers their previous valid snapshot", async () => {
    const { baseDirectory, store } = await createStore();
    const workspace = {
      activePath: "a.md",
      commandHistory: [],
      editorModesByPath: { "a.md": "source" },
      leftSidebarCollapsed: false,
      leftSidebarMode: "files",
      openTabs: ["a.md"],
      pinnedTabs: ["a.md"],
      recentFiles: ["a.md"],
      rightSidebarCollapsed: true,
      rightSidebarMode: "properties",
    };
    await store.captureWorkspace({ vaultRoot: "/vault-a", workspace });
    await store.captureWorkspace({
      vaultRoot: "/vault-b",
      workspace: { ...workspace, activePath: "b.md", openTabs: ["b.md"] },
    });
    await store.captureWorkspace({
      vaultRoot: "/vault-a",
      workspace: { ...workspace, activePath: "new.md", openTabs: ["new.md"] },
    });

    await expect(store.loadWorkspace("/vault-a")).resolves.toMatchObject({
      schemaVersion: 2,
      vaultRoot: "/vault-a",
      workspace: { activePath: "new.md", openTabs: ["new.md"] },
    });
    await expect(store.loadWorkspace("/vault-b")).resolves.toMatchObject({
      workspace: { activePath: "b.md", openTabs: ["b.md"] },
    });

    await fs.writeFile(
      path.join(baseDirectory, "notes-hot-exit-workspaces.json"),
      "not-json",
      "utf8",
    );
    await expect(store.loadWorkspace("/vault-a")).resolves.toMatchObject({
      workspace: { activePath: "a.md", openTabs: ["a.md"] },
    });
  });

  it("deduplicates history and keeps the newest 50 versions per document", async () => {
    const { store } = await createStore();

    const first = await store.recordHistory({
      path: "a.md",
      rawSource: "v0",
      vaultRoot: "/vault",
    });
    await expect(
      store.recordHistory({
        path: "a.md",
        rawSource: "v0",
        vaultRoot: "/vault",
      }),
    ).resolves.toEqual(first);

    for (let index = 1; index <= 55; index += 1) {
      await store.recordHistory({
        path: "a.md",
        rawSource: `v${index}`,
        vaultRoot: "/vault",
      });
    }

    const versions = await store.listHistory("a.md", "/vault");
    expect(versions).toHaveLength(50);
    expect(versions[0]?.rawSource).toBe("v55");
    expect(versions.at(-1)?.rawSource).toBe("v6");
  });

  it("recovers valid history when the JSONL tail is damaged", async () => {
    const { baseDirectory, store } = await createStore();

    await store.recordHistory({
      path: "a.md",
      rawSource: "safe",
      vaultRoot: "/vault",
    });
    await fs.appendFile(
      path.join(baseDirectory, "notes-history.jsonl"),
      '{"type":"version","broken":',
      "utf8",
    );

    await expect(store.listHistory("a.md", "/vault")).resolves.toMatchObject([
      { rawSource: "safe" },
    ]);
  });

  it("serializes concurrent history writes without losing versions", async () => {
    const { store } = await createStore();

    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        store.recordHistory({
          path: "a.md",
          rawSource: `v${index}`,
          vaultRoot: "/vault",
        }),
      ),
    );

    const versions = await store.listHistory("a.md", "/vault");
    expect(versions).toHaveLength(20);
    expect(new Set(versions.map((version: { rawSource: string }) => version.rawSource)).size).toBe(
      20,
    );
  });

  it("rejects oversized recovery payloads without writing them", async () => {
    const { store } = await createStore();

    await expect(
      store.captureDraft({
        path: "large.md",
        rawSource: "x".repeat(2 * 1024 * 1024 + 1),
        vaultRoot: "/vault",
      }),
    ).resolves.toBe(false);
    await expect(
      store.captureDraft({
        baseRawSource: "x".repeat(2 * 1024 * 1024 + 1),
        path: "large-baseline.md",
        rawSource: "small draft",
        vaultRoot: "/vault",
      }),
    ).resolves.toBe(false);
    await expect(store.listDrafts("/vault")).resolves.toEqual([]);
  });

  it("imports renderer legacy data only once", async () => {
    const { store } = await createStore();
    const legacy = {
      drafts: [
        {
          capturedAt: "2026-07-01T00:00:00.000Z",
          path: "legacy.md",
          rawSource: "draft",
          vaultRoot: "/vault",
        },
        {
          baseRawSource: "x".repeat(2 * 1024 * 1024 + 1),
          capturedAt: "2026-07-01T00:00:00.000Z",
          path: "oversized-legacy.md",
          rawSource: "small draft",
          vaultRoot: "/vault",
        },
      ],
      history: [
        {
          id: "legacy-version",
          path: "legacy.md",
          rawSource: "saved",
          savedAt: "2026-06-30T00:00:00.000Z",
          vaultRoot: "/vault",
        },
      ],
    };

    await expect(store.importLegacy(legacy)).resolves.toEqual({
      draftsImported: 1,
      historyImported: 1,
      imported: true,
    });
    await expect(store.importLegacy(legacy)).resolves.toEqual({
      draftsImported: 0,
      historyImported: 0,
      imported: false,
    });
    await expect(store.listDrafts("/vault")).resolves.toHaveLength(1);
    await expect(store.listHistory("legacy.md", "/vault")).resolves.toHaveLength(1);
  });
});
