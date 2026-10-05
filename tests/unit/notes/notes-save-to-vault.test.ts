import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveNoteToVault } from "@/features/notes/workbench/notes-save-to-vault";
import {
  clearAllPendingNoteSaves,
  hasPendingNoteSave,
} from "@/features/notes/workbench/notes-pending-saves";
import type { VaultClient } from "@/features/notes/vault/vault-types";

function createClient(currentSource: string | null): VaultClient {
  return {
    createDirectory: vi.fn(async () => undefined),
    deleteEntry: vi.fn(async () => undefined),
    listEntries: vi.fn(async () => []),
    moveEntry: vi.fn(async () => undefined),
    readFile: vi.fn(async () => currentSource),
    renameEntry: vi.fn(async () => undefined),
    rootPath: "C:/vault",
    subscribeToChanges: vi.fn(() => () => undefined),
    writeFile: vi.fn(async () => undefined),
  };
}

describe("notes save to vault", () => {
  beforeEach(() => {
    clearAllPendingNoteSaves();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearAllPendingNoteSaves();
  });

  it("writes through safe vault write and keeps a pending marker briefly", async () => {
    const client = createClient("# Before");

    const result = await saveNoteToVault(client, {
      expectedRawSource: "# Before",
      path: "Inbox/Daily.md",
      rawSource: "# After",
      saveType: "manual",
    });

    expect(result).toEqual({
      normalizedSource: "# After",
      status: "saved",
    });
    expect(client.writeFile).toHaveBeenCalledWith("Inbox/Daily.md", "# After");
    expect(hasPendingNoteSave("Inbox/Daily.md")).toBe(true);

    vi.advanceTimersByTime(1_000);

    expect(hasPendingNoteSave("Inbox/Daily.md")).toBe(false);
  });

  it.each([
    ["config.json", '{"label":"中文ABC"}\n'],
    ["config.yaml", 'label: "中文ABC"\n'],
    ["config.toml", 'label = "中文ABC"\n'],
  ])("preserves structured source bytes for %s", async (path, source) => {
    const client = createClient("");

    const result = await saveNoteToVault(client, {
      expectedRawSource: "",
      path,
      rawSource: source,
      saveType: "manual",
    });

    expect(result.normalizedSource).toBe(source);
    expect(client.writeFile).toHaveBeenCalledWith(path, source);
  });

  it("normalizes Markdown spacing without rewriting protected syntax", async () => {
    const source = [
      "+++",
      'title = "中文API"',
      "+++",
      "正文API 与 `中文API` [链接](https://example.com/中文API)",
      "```ts",
      "const 中文API = 1;",
      "```",
      "硬换行API  ",
      "下一行",
      "",
    ].join("\n");
    const expected = source.replace("正文API", "正文 API").replace("硬换行API", "硬换行 API");
    const client = createClient("");

    const result = await saveNoteToVault(client, {
      expectedRawSource: "",
      path: "Inbox/Safe.md",
      rawSource: source,
      saveType: "manual",
    });

    expect(result.normalizedSource).toBe(expected);
    expect(result.normalizedSource).toContain("`中文API`");
    expect(result.normalizedSource).toContain("https://example.com/中文API");
    expect(result.normalizedSource).toContain("硬换行 API  \n");
  });

  it("reports conflicts without overwriting the current disk content", async () => {
    const client = createClient("# External");

    const result = await saveNoteToVault(client, {
      expectedRawSource: "# Before",
      path: "Inbox/Daily.md",
      rawSource: "# Local",
      saveType: "auto",
    });

    expect(result).toEqual({
      currentRawSource: "# External",
      normalizedSource: "# Local",
      status: "conflict",
    });
    expect(client.writeFile).not.toHaveBeenCalled();
    expect(hasPendingNoteSave("Inbox/Daily.md")).toBe(false);
  });

  it("retains an existing UTF-8 BOM after rich editing drops the invisible prefix", async () => {
    const client = createClient("\uFEFF# Before");
    const result = await saveNoteToVault(client, {
      expectedRawSource: "\uFEFF# Before",
      path: "BOM.md",
      rawSource: "# After",
      saveType: "manual",
    });
    expect(result.normalizedSource).toBe("\uFEFF# After");
    expect(client.writeFile).toHaveBeenCalledWith("BOM.md", "\uFEFF# After");
  });

  it("keeps BOM-prefixed frontmatter opaque without duplicating the prefix", async () => {
    const client = createClient("");
    const source = '\uFEFF---\ntitle: 中文API\n---\n正文API\n';
    const result = await saveNoteToVault(client, {
      expectedRawSource: "",
      path: "BOM.md",
      rawSource: source,
      saveType: "auto",
    });
    expect(result.normalizedSource).toBe(source.replace("正文API", "正文 API"));
    expect([...result.normalizedSource].filter(char => char === "\uFEFF")).toHaveLength(1);
  });

  it("repairs split surrogate entities in markdown content on save", async () => {
    const client = createClient("");
    const sourceWithBrokenSurrogate = "**word\\***&#xD83D;\uDE42word";

    const result = await saveNoteToVault(client, {
      expectedRawSource: "",
      path: "Inbox/Emoji.md",
      rawSource: sourceWithBrokenSurrogate,
      saveType: "manual",
    });

    expect(result.normalizedSource).toBe("**word\\***&#x1F642;word");
    expect(client.writeFile).toHaveBeenCalledWith(
      "Inbox/Emoji.md",
      "**word\\***&#x1F642;word",
    );
  });
});
