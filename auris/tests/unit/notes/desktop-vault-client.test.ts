import { describe, expect, it, vi } from "vitest";
import { createDesktopVaultClient } from "@/platform/desktop/vault-client";
import type { DesktopVaultService } from "@/platform/desktop/vault-service";

function createService(): DesktopVaultService {
  return {
    copyEntry: vi.fn(async () => undefined),
    createDirectory: vi.fn(async () => undefined),
    getDirectoryInfo: vi.fn(async () => ({
      directoryName: "English Vault",
      isConfigured: true,
      isDesktopVault: true,
      isSupported: true,
      pluginDirectory: "C:/vault/.shadowing/plugins",
      vaultPath: "C:/vault",
    })),
    listFiles: vi.fn(async () => [
      {
        absolutePath: "C:/vault/assets/audio.wav",
        fileName: "audio.wav",
        relativePath: "assets/audio.wav",
      },
      {
        absolutePath: "C:/vault/notes/shadowing-log.md",
        fileName: "shadowing-log.md",
        relativePath: "notes/shadowing-log.md",
      },
    ]),
    listMarkdownFiles: vi.fn(async () => [
      {
        absolutePath: "C:/vault/notes/shadowing-log.md",
        fileName: "shadowing-log.md",
        relativePath: "notes/shadowing-log.md",
      },
    ]),
    moveMarkdownFile: vi.fn(async () => undefined),
    openPluginsDirectory: vi.fn(async () => undefined),
    pickDirectory: vi.fn(async () => ({
      directoryName: "English Vault",
      isConfigured: true,
      isDesktopVault: true,
      isSupported: true,
      pluginDirectory: "C:/vault/.shadowing/plugins",
      vaultPath: "C:/vault",
    })),
    readMarkdownFile: vi.fn(async () => null),
    removeMarkdownFile: vi.fn(async () => undefined),
    renameMarkdownFile: vi.fn(async () => undefined),
    restoreLastDeletedEntry: vi.fn(async () => null),
    revealEntry: vi.fn(async () => undefined),
    saveMarkdownFile: vi.fn(async () => undefined),
    subscribeToChanges: vi.fn(() => () => undefined),
  };
}

describe("desktop vault client", () => {
  it("keeps non-markdown assets visible in the ordinary folder snapshot", async () => {
    const service = createService();
    const client = createDesktopVaultClient(service);

    const entries = await client.listEntries();

    expect(entries.map((entry) => entry.path)).toEqual([
      "assets/audio.wav",
      "notes/shadowing-log.md",
    ]);
    expect(service.listFiles).toHaveBeenCalledOnce();
    expect(service.listMarkdownFiles).not.toHaveBeenCalled();
  });
});
