import { describe, expect, it, vi } from "vitest";
import { DEFAULT_DESKTOP_RUNTIME_STATE } from "@/features/app-runtime/app-runtime-storage";
import { createDesktopVaultService } from "@/platform/desktop/vault-service";
import type { DesktopBridge } from "@/platform/desktop/desktop-bridge";

function createBridge(): DesktopBridge {
  let runtimeState = { ...DEFAULT_DESKTOP_RUNTIME_STATE };

  return {
    commands: {
      list: vi.fn(async () => []),
      run: vi.fn(async () => ({ executed: false })),
    },
    downloads: {
      exportJson: vi.fn(async () => ({ path: "C:/Users/test/Downloads/export.json" })),
      getDirectoryInfo: vi.fn(async () => ({
        directoryPath: "C:/Users/test/Downloads",
      })),
      revealDirectory: vi.fn(async () => undefined),
    },
    plugins: {
      list: vi.fn(async () => []),
      openDirectory: vi.fn(async () => undefined),
      setEnabled: vi.fn(async () => []),
    },
    runtimeState: {
      get: vi.fn(async () => runtimeState),
      importLegacy: vi.fn(async (legacyState) => {
        runtimeState = {
          ...runtimeState,
          ...legacyState,
          legacyRuntimeMigratedAt: "2026-03-26T00:00:00.000Z",
        };
        return runtimeState;
      }),
      setLastWorkspace: vi.fn(async (workspace) => {
        runtimeState = {
          ...runtimeState,
          lastVisitedAt: "2026-03-26T00:00:00.000Z",
          lastWorkspace: workspace,
        };
        return runtimeState;
      }),
    },
    system: {
      openUpgrade: vi.fn(async () => ({
        didOpen: true,
        targetUrl: "https://updates.example.com",
      })),
    },
    vault: {
      getDirectoryInfo: vi.fn(async () => ({
        directoryName: "English Vault",
        hasVault: true,
        pluginDirectory: "C:/vault/.shadowing/plugins",
        vaultPath: "C:/vault",
      })),
      listFiles: vi.fn(async () => [
        {
          absolutePath: "C:/vault/notes/shadowing-log.md",
          fileName: "shadowing-log.md",
          relativePath: "notes/shadowing-log.md",
        },
        {
          absolutePath: "C:/vault/assets/audio.wav",
          fileName: "audio.wav",
          relativePath: "assets/audio.wav",
        },
      ]),
      onDidChange: vi.fn(() => () => undefined),
      pickDirectory: vi.fn(async () => ({
        directoryName: "English Vault",
        hasVault: true,
        pluginDirectory: "C:/vault/.shadowing/plugins",
        vaultPath: "C:/vault",
      })),
      readFile: vi.fn(async () => "# Shadowing Log\n\nToday"),
      removeFile: vi.fn(async () => undefined),
      revealPluginsDirectory: vi.fn(async () => undefined),
      saveFile: vi.fn(async () => undefined),
    },
    voiceEngine: {
      generate: vi.fn(async () => ({
        audioBase64: "",
        contentType: "audio/wav",
        durationMs: 1200,
        transcriptWords: [],
      })),
      getCapabilities: vi.fn(async () => ({
        locales: ["en-US"],
        modes: ["preset" as const],
        supportsReferenceAudio: false,
        supportsStylePrompt: true,
      })),
      getStatus: vi.fn(async () => ({
        activeProvider: "openai" as const,
        platform: "win32" as const,
        reason: null,
        state: "ready" as const,
      })),
      start: vi.fn(async () => ({
        activeProvider: "openai" as const,
        platform: "win32" as const,
        reason: null,
        state: "ready" as const,
      })),
      stop: vi.fn(async () => ({
        activeProvider: "openai" as const,
        platform: "win32" as const,
        reason: null,
        state: "ready" as const,
      })),
    },
    window: {
      showInFolder: vi.fn(async () => undefined),
    },
  };
}

describe("desktop vault service", () => {
  it("maps vault info into notes-compatible directory info", async () => {
    const service = createDesktopVaultService(createBridge());

    const info = await service.getDirectoryInfo();

    expect(info.directoryName).toBe("English Vault");
    expect(info.isConfigured).toBe(true);
    expect(info.isDesktopVault).toBe(true);
    expect(info.pluginDirectory).toBe("C:/vault/.shadowing/plugins");
    expect(info.vaultPath).toBe("C:/vault");
  });

  it("filters the vault listing down to markdown files", async () => {
    const service = createDesktopVaultService(createBridge());

    const files = await service.listMarkdownFiles();

    expect(files).toHaveLength(1);
    expect(files[0]?.relativePath).toBe("notes/shadowing-log.md");
  });

  it("exposes the full ordinary folder listing so assets survive round trips", async () => {
    const service = createDesktopVaultService(createBridge());

    const files = await service.listFiles();

    expect(files.map((file) => file.relativePath)).toEqual([
      "assets/audio.wav",
      "notes/shadowing-log.md",
    ]);
  });
});
