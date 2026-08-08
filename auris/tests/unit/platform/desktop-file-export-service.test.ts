import { describe, expect, it, vi } from "vitest";
import { DEFAULT_DESKTOP_RUNTIME_STATE } from "@/features/app-runtime/app-runtime-storage";
import { createDesktopFileExportService } from "@/platform/files/desktop-file-export-service";
import type { DesktopBridge } from "@/platform/desktop/desktop-bridge";

function createBridge(): DesktopBridge {
  let runtimeState = { ...DEFAULT_DESKTOP_RUNTIME_STATE };

  return {
    commands: {
      list: vi.fn(async () => []),
      run: vi.fn(async () => ({ executed: false })),
    },
    downloads: {
      exportJson: vi.fn(async () => ({ path: "C:/Users/test/Downloads/wordbook.json" })),
      exportVaultFolder: vi.fn(async () => ({
        filesCopied: 3,
        manifestPath: "C:/Users/test/Downloads/shadowing-vault/manifest.json",
        path: "C:/Users/test/Downloads/shadowing-vault",
      })),
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
      listFiles: vi.fn(async () => []),
      onDidChange: vi.fn(() => () => undefined),
      pickDirectory: vi.fn(async () => ({
        directoryName: "English Vault",
        hasVault: true,
        pluginDirectory: "C:/vault/.shadowing/plugins",
        vaultPath: "C:/vault",
      })),
      readFile: vi.fn(async () => null),
      removeFile: vi.fn(async () => undefined),
      revealPluginsDirectory: vi.fn(async () => undefined),
      saveFile: vi.fn(async () => undefined),
    },
    window: {
      showInFolder: vi.fn(async () => undefined),
    },
  };
}

describe("desktop file export service", () => {
  it("writes exports through the desktop downloads bridge", async () => {
    const bridge = createBridge();
    const service = createDesktopFileExportService({ bridge });

    await service.exportJson("wordbook.json", [{ word: "rhythm" }]);

    expect(bridge.downloads.exportJson).toHaveBeenCalledWith("wordbook.json", [
      { word: "rhythm" },
    ]);
  });

  it("exports a complete vault folder through the desktop downloads bridge", async () => {
    const bridge = createBridge();
    const service = createDesktopFileExportService({ bridge });
    const manifest = {
      documents: {},
      files: [],
      generatedAt: "2026-05-09T00:00:00.000Z",
      learning: {
        sentences: [],
        words: [],
      },
      rootPath: "C:/vault",
      sourceOfTruth: "markdown-vault",
      version: 1,
    };

    await service.exportVaultFolder("shadowing-vault", manifest);

    expect(bridge.downloads.exportVaultFolder).toHaveBeenCalledWith(
      "shadowing-vault",
      manifest,
    );
  });
});
