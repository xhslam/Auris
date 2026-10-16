import { describe, expect, it, vi } from "vitest";
import { createDesktopVaultService } from "@/platform/desktop/vault-service";
import { DEFAULT_DESKTOP_RUNTIME_STATE } from "@/features/app-runtime/app-runtime-storage";
import type { DesktopBridge } from "@/platform/desktop/desktop-bridge";

function createBridge(): DesktopBridge {
  return {
    commands: {
      list: vi.fn(async () => []),
      run: vi.fn(async () => ({ executed: true })),
    },
    downloads: {
      exportJson: vi.fn(async () => ({ path: "C:/Downloads/export.json" })),
      getDirectoryInfo: vi.fn(async () => ({ directoryPath: "C:/Downloads" })),
      revealDirectory: vi.fn(async () => undefined),
    },
    plugins: {
      list: vi.fn(async () => []),
      openDirectory: vi.fn(async () => undefined),
      setEnabled: vi.fn(async () => []),
    },
    runtimeState: {
      get: vi.fn(async () => ({
        ...DEFAULT_DESKTOP_RUNTIME_STATE,
        lastWorkspace: "workspace" as const,
        lastVisitedAt: "2026-04-03T00:00:00.000Z",
        primaryResumeId: null,
        primaryResumeType: null,
        updatedAt: "2026-04-03T00:00:00.000Z",
      })),
      importLegacy: vi.fn(async () => ({
        ...DEFAULT_DESKTOP_RUNTIME_STATE,
        lastWorkspace: "workspace" as const,
        lastVisitedAt: "2026-04-03T00:00:00.000Z",
        primaryResumeId: null,
        primaryResumeType: null,
        updatedAt: "2026-04-03T00:00:00.000Z",
      })),
      setLastWorkspace: vi.fn(async () => ({
        ...DEFAULT_DESKTOP_RUNTIME_STATE,
        lastWorkspace: "workspace" as const,
        lastVisitedAt: "2026-04-03T00:00:00.000Z",
        primaryResumeId: null,
        primaryResumeType: null,
        updatedAt: "2026-04-03T00:00:00.000Z",
      })),
    },
    system: {
      openUpgrade: vi.fn(async () => ({ didOpen: false, targetUrl: null })),
    },
    vault: {
      copyFile: vi.fn(async () => undefined),
      createDirectory: vi.fn(async () => undefined),
      getDirectoryInfo: vi.fn(async () => ({
        directoryName: "English Vault",
        hasVault: true,
        pluginDirectory: "C:/vault/.shadowing/plugins",
        vaultPath: "C:/vault",
      })),
      listFiles: vi.fn(async () => []),
      moveFile: vi.fn(async () => undefined),
      onDidChange: vi.fn(() => () => undefined),
      pickDirectory: vi.fn(async () => ({
        directoryName: "English Vault",
        hasVault: true,
        pluginDirectory: "C:/vault/.shadowing/plugins",
        vaultPath: "C:/vault",
      })),
      readFile: vi.fn(async () => null),
      renameFile: vi.fn(async () => undefined),
      removeFile: vi.fn(async () => undefined),
      restoreLastDeleted: vi.fn(async () => "notes/restored.md"),
      revealFile: vi.fn(async () => undefined),
      revealPluginsDirectory: vi.fn(async () => undefined),
      saveFile: vi.fn(async () => undefined),
    },
    voiceEngine: {
      generate: vi.fn(async () => { throw new Error("Voice generation is outside this Vault fixture"); }),
      getCapabilities: vi.fn(async () => ({ locales: [], modes: [], supportsReferenceAudio: false, supportsStylePrompt: false })),
      getStatus: vi.fn<DesktopBridge["voiceEngine"]["getStatus"]>(async () => ({ activeProvider: "openai", platform: "test", reason: null, state: "ready" })),
      start: vi.fn<DesktopBridge["voiceEngine"]["start"]>(async () => ({ activeProvider: "openai", platform: "test", reason: null, state: "ready" })),
      stop: vi.fn<DesktopBridge["voiceEngine"]["stop"]>(async () => ({ activeProvider: "openai", platform: "test", reason: null, state: "ready" })),
    },
    window: {
      showInFolder: vi.fn(async () => undefined),
    },
  };
}

describe("desktop vault service", () => {
  it("exposes rename, move, and directory creation operations for the workbench layer", () => {
    const service = createDesktopVaultService(createBridge());

    expect(typeof service.createDirectory).toBe("function");
    expect(typeof service.moveMarkdownFile).toBe("function");
    expect(typeof service.renameMarkdownFile).toBe("function");
  });

  it("adapts copy, reveal, and recoverable delete capabilities", async () => {
    const bridge = createBridge();
    const service = createDesktopVaultService(bridge);

    await service.copyEntry("notes/daily.md", "notes/daily copy.md");
    await service.revealEntry("notes/daily.md");
    await expect(service.restoreLastDeletedEntry()).resolves.toBe(
      "notes/restored.md",
    );

    expect(bridge.vault.copyFile).toHaveBeenCalledWith(
      "notes/daily.md",
      "notes/daily copy.md",
    );
    expect(bridge.vault.revealFile).toHaveBeenCalledWith("notes/daily.md");
    expect(bridge.vault.restoreLastDeleted).toHaveBeenCalledTimes(1);
  });
});
