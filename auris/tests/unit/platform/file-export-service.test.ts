import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DESKTOP_RUNTIME_STATE } from "@/features/app-runtime/app-runtime-storage";
import { createFileExportService } from "@/platform/files/file-export-service";

describe("file export service", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("uses the desktop download bridge inside desktop containers", () => {
    let runtimeState = { ...DEFAULT_DESKTOP_RUNTIME_STATE };

    vi.stubGlobal("window", {
      shadowingDesktop: {
        commands: {
          list: async () => [],
          run: async () => ({ executed: false }),
        },
        downloads: {
          exportJson: async () => ({ path: "C:/Users/test/Downloads/export.json" }),
          getDirectoryInfo: async () => ({
            directoryPath: "C:/Users/test/Downloads",
          }),
          revealDirectory: async () => undefined,
        },
        plugins: {
          list: async () => [],
          openDirectory: async () => undefined,
          setEnabled: async () => [],
        },
        runtimeState: {
          get: async () => runtimeState,
          importLegacy: async (legacyState) => {
            runtimeState = {
              ...runtimeState,
              ...legacyState,
              legacyRuntimeMigratedAt: "2026-03-26T00:00:00.000Z",
            };
            return runtimeState;
          },
          setLastWorkspace: async (workspace) => {
            runtimeState = {
              ...runtimeState,
              lastVisitedAt: "2026-03-26T00:00:00.000Z",
              lastWorkspace: workspace,
            };
            return runtimeState;
          },
        },
        system: {
          openUpgrade: async () => ({
            didOpen: true,
            targetUrl: "https://updates.example.com",
          }),
        },
        vault: {
          getDirectoryInfo: async () => ({
            directoryName: "English Vault",
            hasVault: true,
            pluginDirectory: "C:/vault/.shadowing/plugins",
            vaultPath: "C:/vault",
          }),
          listFiles: async () => [],
          onDidChange: async () => () => undefined,
          pickDirectory: async () => ({
            directoryName: "English Vault",
            hasVault: true,
            pluginDirectory: "C:/vault/.shadowing/plugins",
            vaultPath: "C:/vault",
          }),
          readFile: async () => null,
          removeFile: async () => undefined,
          revealPluginsDirectory: async () => undefined,
          saveFile: async () => undefined,
        },
        window: {
          showInFolder: async () => undefined,
        },
      },
    });

    const service = createFileExportService({
      runtime: { isDesktopApp: true, isNativeApp: false, platform: "desktop" },
    });

    expect(service.kind).toBe("desktop");
  });

  it("uses browser downloads on web", () => {
    const service = createFileExportService({
      runtime: { isDesktopApp: false, isNativeApp: false, platform: "web" },
    });

    expect(service.kind).toBe("web");
  });

  it("uses native sharing on mobile", () => {
    const service = createFileExportService({
      runtime: { isDesktopApp: false, isNativeApp: true, platform: "android" },
    });

    expect(service.kind).toBe("native");
  });
});
