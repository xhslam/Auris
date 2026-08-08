import { describe, expect, it, vi } from "vitest";
import { safeWriteVaultFile } from "@/features/notes/vault/vault-safe-write";
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

describe("vault-safe-write", () => {
  it("writes when the current file still matches the editor baseline", async () => {
    const client = createClient("# Before");

    const result = await safeWriteVaultFile(client, {
      expectedRawSource: "# Before",
      nextRawSource: "# After",
      path: "notes/daily.md",
    });

    expect(result.status).toBe("saved");
    expect(client.writeFile).toHaveBeenCalledWith("notes/daily.md", "# After");
  });

  it("does not overwrite an external editor change", async () => {
    const client = createClient("# External edit");

    const result = await safeWriteVaultFile(client, {
      expectedRawSource: "# Before",
      nextRawSource: "# After",
      path: "notes/daily.md",
    });

    expect(result).toEqual({
      currentRawSource: "# External edit",
      status: "conflict",
    });
    expect(client.writeFile).not.toHaveBeenCalled();
  });

  it("does not overwrite a file that appeared unexpectedly", async () => {
    const client = createClient("# Existing file");

    const result = await safeWriteVaultFile(client, {
      expectedRawSource: null,
      nextRawSource: "# After",
      path: "notes/daily.md",
    });

    expect(result).toEqual({
      currentRawSource: "# Existing file",
      status: "conflict",
    });
    expect(client.writeFile).not.toHaveBeenCalled();
  });

  it("does not overwrite a file that disappeared externally", async () => {
    const client = createClient(null);

    const result = await safeWriteVaultFile(client, {
      expectedRawSource: "# Before",
      nextRawSource: "# After",
      path: "notes/daily.md",
    });

    expect(result).toEqual({
      currentRawSource: null,
      status: "conflict",
    });
    expect(client.writeFile).not.toHaveBeenCalled();
  });

  it("treats an already-saved file as unchanged", async () => {
    const client = createClient("# After");

    const result = await safeWriteVaultFile(client, {
      expectedRawSource: "# Before",
      nextRawSource: "# After",
      path: "notes/daily.md",
    });

    expect(result.status).toBe("unchanged");
    expect(client.writeFile).not.toHaveBeenCalled();
  });
});
