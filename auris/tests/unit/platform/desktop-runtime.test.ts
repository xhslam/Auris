import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DESKTOP_RUNTIME_STATE } from "@/features/app-runtime/app-runtime-storage";
import {
  getDesktopBridge,
  hasDesktopBridge,
  isDesktopBridge,
  type DesktopBridge,
} from "@/platform/desktop/desktop-runtime";

function createBridge(overrides?: Partial<DesktopBridge>): DesktopBridge {
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
    voiceEngine: {
      generate: vi.fn(async () => ({
        contentType: "audio/wav",
        durationMs: 1200,
        transcriptWords: [],
        audioBase64: Buffer.from("audio").toString("base64"),
      })),
      getCapabilities: vi.fn(async () => ({
        locales: ["en-US"],
        modes: ["preset" as const],
        supportsReferenceAudio: false,
        supportsStylePrompt: true,
      })),
      getStatus: vi.fn(async () => ({
        activeProvider: "voxcpm" as const,
        platform: "win32",
        reason: null,
        state: "ready" as const,
      })),
      start: vi.fn(async () => ({
        activeProvider: "voxcpm" as const,
        platform: "win32",
        reason: null,
        state: "ready" as const,
      })),
      stop: vi.fn(async () => ({
        activeProvider: "openai" as const,
        platform: "win32",
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
    ...overrides,
  };
}

describe("desktop runtime", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("recognizes a valid desktop bridge on window", () => {
    const bridge = createBridge();
    vi.stubGlobal("window", { shadowingDesktop: bridge });

    expect(hasDesktopBridge()).toBe(true);
    expect(getDesktopBridge()).toBe(bridge);
  });

  it("rejects malformed bridge objects", () => {
    vi.stubGlobal("window", { shadowingDesktop: { vault: {} } });

    expect(hasDesktopBridge()).toBe(false);
    expect(getDesktopBridge()).toBeNull();
  });

  it("rejects a partially exposed optional desktop island bridge", () => {
    const bridge = createBridge({
      desktopIsland: { syncSnapshot: vi.fn() } as unknown as DesktopBridge["desktopIsland"],
    });

    expect(isDesktopBridge(bridge)).toBe(false);
  });

  it("validates bridge shapes with a type guard", () => {
    const bridge = createBridge();

    expect(isDesktopBridge(bridge)).toBe(true);
    expect(isDesktopBridge({ plugins: {}, vault: {}, window: {} })).toBe(false);
  });

  it("accepts a valid optional clipboard bridge", () => {
    const bridge = createBridge({
      clipboard: {
        writeText: vi.fn(async () => undefined),
      },
    });

    expect(isDesktopBridge(bridge)).toBe(true);
  });

  it("rejects malformed optional clipboard bridges", () => {
    const bridge = createBridge({
      clipboard: {} as DesktopBridge["clipboard"],
    });
    const malformedRichClipboard = createBridge({
      clipboard: {
        writeHtml: "not-a-function",
        writeText: vi.fn(async () => undefined),
      } as unknown as DesktopBridge["clipboard"],
    });

    expect(isDesktopBridge(bridge)).toBe(false);
    expect(isDesktopBridge(malformedRichClipboard)).toBe(false);
  });

  it("still recognizes desktop bridges when the voice engine section is absent", () => {
    const bridgeWithoutVoiceEngine = createBridge();
    Reflect.deleteProperty(bridgeWithoutVoiceEngine, "voiceEngine");

    expect(isDesktopBridge(bridgeWithoutVoiceEngine)).toBe(true);
  });

  it("rejects malformed voice engine sections when present", () => {
    const bridgeWithMalformedVoiceEngine = createBridge() as unknown as {
      voiceEngine: { start: () => Promise<unknown> };
    };

    bridgeWithMalformedVoiceEngine.voiceEngine = {
      start: vi.fn(async () => ({
        activeProvider: "openai",
        platform: "win32",
        reason: null,
        state: "ready",
      })),
    };

    expect(isDesktopBridge(bridgeWithMalformedVoiceEngine)).toBe(false);
  });
});
