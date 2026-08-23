import { describe, expect, it, vi } from "vitest";
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
      get: vi.fn(async () => ({} as Awaited<DesktopBridge["runtimeState"]["get"]>)),
      importLegacy: vi.fn(async () => ({} as Awaited<DesktopBridge["runtimeState"]["get"]>)),
      setLastWorkspace: vi.fn(async () => ({} as Awaited<DesktopBridge["runtimeState"]["get"]>)),
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
