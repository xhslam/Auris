import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DESKTOP_RUNTIME_STATE } from "@/features/app-runtime/app-runtime-storage";
import {
  getDesktopBridge,
  isDesktopBridge,
  type DesktopBridge,
} from "@/platform/desktop/desktop-runtime";

function createBridge(): DesktopBridge {
  let runtimeState = { ...DEFAULT_DESKTOP_RUNTIME_STATE };

  return {
    aiDock: {
      setActiveProvider: vi.fn(async () => runtimeState),
      setActiveView: vi.fn(async () => runtimeState),
      setVisibility: vi.fn(async () => runtimeState),
      syncLayout: vi.fn(async () => ({
        activeProvider: "chatgpt" as const,
        activeView: "provider" as const,
        bounds: { height: 700, width: 560, x: 840, y: 40 },
        isOpen: true,
        panelWidth: 560,
      })),
    },
    aiHistory: {
      captureCurrentConversation: vi.fn(async () => null),
      delete: vi.fn(async () => []),
      export: vi.fn(async () => ({ conversations: [], exportDate: "", version: "1.0" })),
      import: vi.fn(async () => ({ errors: [], imported: 0, skipped: 0 })),
      list: vi.fn(async () => []),
      save: vi.fn(async () => null),
      search: vi.fn(async () => []),
      toggleFavorite: vi.fn(async () => null),
    },
    aiPrompts: {
      export: vi.fn(async () => ({ exportDate: "", prompts: [], version: "1.0" })),
      import: vi.fn(async () => ({ errors: [], imported: 0, skipped: 0 })),
      importDefaultLibrary: vi.fn(async () => ({ errors: [], imported: 0, skipped: 0 })),
      list: vi.fn(async () => []),
      save: vi.fn(async () => null),
      search: vi.fn(async () => []),
      update: vi.fn(async () => null),
      delete: vi.fn(async () => []),
    },
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
        activeProvider: "voxcpm" as const,
        platform: "win32" as const,
        reason: null,
        state: "ready" as const,
      })),
      start: vi.fn(async () => ({
        activeProvider: "voxcpm" as const,
        platform: "win32" as const,
        reason: null,
        state: "ready" as const,
      })),
      stop: vi.fn(async () => ({
        activeProvider: "openai" as const,
        platform: "win32" as const,
        reason: "manual_stop",
        state: "degraded" as const,
      })),
    },
    vault: {
      getDirectoryInfo: vi.fn(async () => ({
        directoryName: null,
        hasVault: false,
        pluginDirectory: null,
        vaultPath: null,
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

describe("desktop ai bridge", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("accepts a bridge with ai dock, prompt, and history sections", () => {
    const bridge = createBridge();
    vi.stubGlobal("window", { shadowingDesktop: bridge });

    expect(isDesktopBridge(bridge)).toBe(true);
    expect(getDesktopBridge()).toBe(bridge);
  });

  it("rejects malformed optional ai sections when present", () => {
    // 边界测试：故意构造缺少 setActiveProvider 等必要方法的畸形 aiDock，验证运行时类型收窄函数 isDesktopBridge 返回 false
    const bridge = {
      ...createBridge(),
      aiDock: {
        setVisibility: vi.fn(async () => DEFAULT_DESKTOP_RUNTIME_STATE),
      },
    };

    expect(isDesktopBridge(bridge)).toBe(false);
  });
});
