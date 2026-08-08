import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
const { createBrowserStateRepository } = require(
  "../../../../electron/browser/browser-state-repository.cjs",
);

describe("browser state database", () => {
  let tempDirectory: string | null = null;

  afterEach(async () => {
    if (tempDirectory) await fs.rm(tempDirectory, { force: true, recursive: true });
    tempDirectory = null;
  });

  async function databasePath() {
    tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "auris-browser-state-"));
    return path.join(tempDirectory, "browser-state.db");
  }

  it("round-trips exact bookmark URLs, upserts titles idempotently, and removes", async () => {
    const repository = createBrowserStateRepository(await databasePath(), {
      now: () => "2026-07-18T00:00:00.000Z",
    });
    const exactUrl = "https://example.com/find?q=active%20recall&lang=zh#section-2";

    expect(repository.upsertBookmark({ title: "第一版", url: exactUrl })).toMatchObject({
      title: "第一版",
      url: exactUrl,
    });
    repository.upsertBookmark({ title: "更新后的标题", url: exactUrl });
    expect(repository.listBookmarks()).toEqual([{ title: "更新后的标题", url: exactUrl }]);
    expect(repository.removeBookmark(exactUrl)).toBe(true);
    expect(repository.removeBookmark(exactUrl)).toBe(false);
    expect(repository.listBookmarks()).toEqual([]);
    repository.close();
  });

  it("migrates a legacy bookmark table without losing exact URLs", async () => {
    const file = await databasePath();
    const legacy = new DatabaseSync(file);
    legacy.exec(`
      CREATE TABLE browser_bookmarks (url TEXT PRIMARY KEY, title TEXT NOT NULL);
      INSERT INTO browser_bookmarks (url, title)
      VALUES ('https://example.com/?legacy=1', 'Legacy');
      PRAGMA user_version = 1;
    `);
    legacy.close();

    const repository = createBrowserStateRepository(file, {
      now: () => "2026-07-18T00:00:00.000Z",
    });
    expect(repository.listBookmarks()).toEqual([
      { title: "Legacy", url: "https://example.com/?legacy=1" },
    ]);
    repository.close();

    const inspection = new DatabaseSync(file);
    expect(inspection.prepare("PRAGMA user_version").get().user_version).toBe(4);
    expect(inspection.prepare("PRAGMA table_info(browser_bookmarks)").all().map(
      (row: { name: string }) => row.name,
    )).toEqual(expect.arrayContaining(["created_at", "updated_at"]));
    inspection.close();
  });

  it("normalizes corrupt rows and never creates or stores history", async () => {
    const file = await databasePath();
    const repository = createBrowserStateRepository(file);
    repository.close();

    const corrupt = new DatabaseSync(file);
    corrupt.prepare(`
      INSERT INTO browser_bookmarks (url, title, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run("file:///private/secret", "should disappear", "bad", "bad");
    corrupt.prepare(`
      INSERT INTO browser_bookmarks (url, title, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run("https://example.com/safe", "x".repeat(800), "bad", "bad");
    corrupt.close();

    const reopened = createBrowserStateRepository(file);
    expect(reopened.listBookmarks()).toEqual([
      { title: "x".repeat(512), url: "https://example.com/safe" },
    ]);
    reopened.saveWindows([{
      activeTabId: "transient-tab-1",
      bounds: { height: 800, width: 1200, x: 20, y: 30 },
      history: [{ url: "https://secret.example/history" }],
      tabs: [],
      windowId: "transient-window-1",
    }]);
    reopened.close();

    const inspection = new DatabaseSync(file);
    const tables = inspection.prepare(
      "SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name",
    ).all() as Array<{ name: string; sql: string }>;
    expect(tables.map((row) => row.name).some((name) => /history/iu.test(name))).toBe(false);
    expect(JSON.stringify(tables)).not.toContain("secret.example/history");
    inspection.close();
  });

  it("restores geometry and explicitly retained Human tabs without transient authority", async () => {
    const file = await databasePath();
    const repository = createBrowserStateRepository(file);
    repository.saveWindows([{
      activeTabId: "browser-tab-human",
      attachments: [{ id: "attachment-1" }],
      bounds: { height: 900, width: 1500, x: 100, y: 80 },
      grants: ["https://example.com"],
      leases: [{ id: "lease-1" }],
      tabs: [
        {
          active: true,
          automationMode: "Human",
          retained: true,
          tabId: "browser-tab-human",
          title: "Human research",
          url: "https://example.com/research?q=1",
        },
        {
          active: false,
          automationMode: "Human",
          retained: false,
          tabId: "browser-tab-ephemeral",
          title: "Ephemeral",
          url: "https://example.com/ephemeral",
        },
        {
          active: false,
          automationMode: "AiSandbox",
          retained: true,
          tabId: "browser-tab-ai",
          title: "AI tab",
          url: "https://example.com/ai",
        },
      ],
      windowId: "browser-window-transient",
    }]);

    expect(repository.loadWindows({
      displays: [{ workArea: { height: 1000, width: 1800, x: 0, y: 0 } }],
    })).toEqual([{
      bounds: { height: 900, width: 1500, x: 100, y: 80 },
      tabs: [{
        active: true,
        automationMode: "Human",
        retained: true,
        title: "Human research",
        url: "https://example.com/research?q=1",
      }],
    }]);
    repository.close();

    const inspection = new DatabaseSync(file);
    const serialized = JSON.stringify(inspection.prepare(
      "SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name",
    ).all());
    for (const forbidden of [
      "browser-tab-human",
      "browser-window-transient",
      "attachment-1",
      "lease-1",
      "https://example.com/ai",
      "https://example.com/ephemeral",
    ]) expect(serialized).not.toContain(forbidden);
    const rows = JSON.stringify(inspection.prepare("SELECT * FROM browser_retained_tabs").all());
    expect(rows).not.toContain("browser-tab-human");
    expect(rows).not.toContain("AiSandbox");
    inspection.close();
  });

  it("clamps partially visible bounds and defaults invalid or off-screen geometry", async () => {
    const repository = createBrowserStateRepository(await databasePath());
    const display = [{ workArea: { height: 900, width: 1440, x: 0, y: 0 } }];

    repository.saveWindows([{
      bounds: { height: 1200, width: 1800, x: 1300, y: 700 },
      tabs: [],
    }]);
    expect(repository.loadWindows({ displays: display })[0].bounds).toEqual({
      height: 900,
      width: 1440,
      x: 0,
      y: 0,
    });

    repository.saveWindows([{
      bounds: { height: 800, width: 1200, x: 9000, y: 9000 },
      tabs: [],
    }]);
    expect(repository.loadWindows({ displays: display })[0].bounds).toEqual({
      height: 800,
      width: 1200,
    });
    repository.close();
  });
});
