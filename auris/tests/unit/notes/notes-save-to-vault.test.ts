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
});
