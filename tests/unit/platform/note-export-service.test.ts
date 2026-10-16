import { describe, expect, it, vi } from "vitest";
import { DEFAULT_DESKTOP_RUNTIME_STATE } from "@/features/app-runtime/app-runtime-storage";
import { createDesktopFileExportService } from "@/platform/files/desktop-file-export-service";
import type { DesktopBridge } from "@/platform/desktop/desktop-bridge";

function createBridge(): DesktopBridge {
  return {
    commands: {
      list: vi.fn(async () => []),
      run: vi.fn(async () => ({ executed: false })),
    },
    downloads: {
      exportJson: vi.fn(async () => ({ path: "C:/downloads/export.json" })),
      exportPdf: vi.fn(async () => ({ path: "C:/downloads/note.pdf" })),
      exportText: vi.fn(async () => ({ path: "C:/downloads/note.html" })),
      getDirectoryInfo: vi.fn(async () => ({
        directoryPath: "C:/downloads",
      })),
      revealDirectory: vi.fn(async () => undefined),
    },
    plugins: {
      list: vi.fn(async () => []),
      openDirectory: vi.fn(async () => undefined),
      setEnabled: vi.fn(async () => []),
    },
    runtimeState: {
      get: vi.fn(async () => DEFAULT_DESKTOP_RUNTIME_STATE),
      importLegacy: vi.fn(async () => DEFAULT_DESKTOP_RUNTIME_STATE),
      setLastWorkspace: vi.fn(async () => DEFAULT_DESKTOP_RUNTIME_STATE),
    },
    system: {
      openUpgrade: vi.fn(async () => ({
        didOpen: false,
        targetUrl: null,
      })),
    },
    vault: {
      getDirectoryInfo: vi.fn(async () => ({
        directoryName: "Vault",
        hasVault: true,
        pluginDirectory: "C:/vault/.shadowing/plugins",
        vaultPath: "C:/vault",
      })),
      listFiles: vi.fn(async () => []),
      onDidChange: vi.fn(() => () => undefined),
      pickDirectory: vi.fn(async () => ({
        directoryName: "Vault",
        hasVault: true,
        pluginDirectory: "C:/vault/.shadowing/plugins",
        vaultPath: "C:/vault",
      })),
      readFile: vi.fn(async () => null),
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

describe("note export service", () => {
  it("writes HTML and PDF note exports through the desktop downloads bridge", async () => {
    const bridge = createBridge();
    const service = createDesktopFileExportService({ bridge });

    await service.exportText("daily-review.html", "<h1>Daily</h1>", "text/html");
    await service.exportPdf("daily-review.pdf", "<h1>Daily</h1>");

    expect(bridge.downloads.exportText).toHaveBeenCalledWith(
      "daily-review.html",
      "<h1>Daily</h1>",
      "text/html",
    );
    expect(bridge.downloads.exportPdf).toHaveBeenCalledWith(
      "daily-review.pdf",
      "<h1>Daily</h1>",
      undefined,
    );
  });
});
