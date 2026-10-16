import { vi } from "vitest";
import { DEFAULT_DESKTOP_RUNTIME_STATE } from "@/features/app-runtime/app-runtime-storage";
import type { DesktopBridge } from "@/platform/desktop/desktop-bridge";

export type TestDesktopBridgeOverrides = {
  commands?: Partial<DesktopBridge["commands"]>;
  downloads?: Partial<DesktopBridge["downloads"]>;
  plugins?: Partial<DesktopBridge["plugins"]>;
  runtimeState?: Partial<DesktopBridge["runtimeState"]>;
  system?: Partial<DesktopBridge["system"]>;
  vault?: Partial<DesktopBridge["vault"]>;
  voiceEngine?: Partial<DesktopBridge["voiceEngine"]>;
  window?: Partial<DesktopBridge["window"]>;
};

export function createTestDesktopBridge(overrides: TestDesktopBridgeOverrides = {}): DesktopBridge {
  let runtimeState = { ...DEFAULT_DESKTOP_RUNTIME_STATE };

  return {
    commands: {
      list: vi.fn(async () => []),
      run: vi.fn(async () => ({ executed: false })),
      ...overrides.commands,
    },
    downloads: {
      exportJson: vi.fn(async () => ({ path: "C:/Users/test/Downloads/export.json" })),
      getDirectoryInfo: vi.fn(async () => ({
        directoryPath: "C:/Users/test/Downloads",
      })),
      revealDirectory: vi.fn(async () => undefined),
      ...overrides.downloads,
    },
    plugins: {
      list: vi.fn(async () => []),
      openDirectory: vi.fn(async () => undefined),
      setEnabled: vi.fn(async () => []),
      ...overrides.plugins,
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
      setResumeTarget: vi.fn(async (targetType, targetId) => {
        runtimeState = {
          ...runtimeState,
          primaryResumeId: targetId,
          primaryResumeType: targetType,
          updatedAt: "2026-03-26T00:00:00.000Z",
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
      ...overrides.runtimeState,
    },
    system: {
      openUpgrade: vi.fn(async () => ({
        didOpen: true,
        targetUrl: "https://updates.example.com",
      })),
      ...overrides.system,
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
      readFile: vi.fn(async () => ""),
      removeFile: vi.fn(async () => undefined),
      revealPluginsDirectory: vi.fn(async () => undefined),
      saveFile: vi.fn(async () => undefined),
      ...overrides.vault,
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
      ...overrides.voiceEngine,
    },
    window: {
      showInFolder: vi.fn(async () => undefined),
      ...overrides.window,
    },
  };
}
