import {
  DEFAULT_APP_RUNTIME_STATE,
  DEFAULT_DESKTOP_AI_DOCK_STATE,
  DEFAULT_DESKTOP_RUNTIME_STATE,
  hydrateDesktopRuntimeState,
  persistResumeTarget,
  persistLastWorkspace,
  readAppRuntimeState,
  readDesktopRuntimeState,
  writeLastWorkspace,
} from "@/features/app-runtime/app-runtime-storage";
import type { DesktopRuntimeState } from "@/features/app-runtime/app-runtime.types";
import { createTestDesktopBridge, type TestDesktopBridgeOverrides } from "../../fixtures/typecheck/desktop-bridge-fixture";

function createBridge(overrides: TestDesktopBridgeOverrides = {}) {
  return createTestDesktopBridge(overrides);
}

describe("app runtime storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("falls back to the home workspace when storage is empty", () => {
    expect(readAppRuntimeState(window.localStorage)).toEqual(DEFAULT_APP_RUNTIME_STATE);
  });

  it("persists the last selected workspace", () => {
    const nextState = writeLastWorkspace(window.localStorage, "notes");

    expect(nextState.lastWorkspace).toBe("notes");
    expect(nextState.lastVisitedAt).toEqual(expect.any(String));
    expect(readAppRuntimeState(window.localStorage).lastWorkspace).toBe("notes");
  });

  it("ignores malformed storage payloads", () => {
    window.localStorage.setItem("shadowing:desktop:app-runtime", "{broken");

    expect(readAppRuntimeState(window.localStorage)).toEqual(DEFAULT_APP_RUNTIME_STATE);
  });

  it("reads runtime state from the desktop bridge when available", async () => {
    const bridge = createBridge();

    const runtimeState = await readDesktopRuntimeState(
      bridge,
      window.localStorage,
    );

    expect(runtimeState).toEqual(DEFAULT_DESKTOP_RUNTIME_STATE);
    expect(bridge.runtimeState.get).toHaveBeenCalledTimes(1);
  });

  it("provides a default ai dock state in desktop runtime defaults", () => {
    expect(DEFAULT_DESKTOP_RUNTIME_STATE.aiDock).toEqual(
      DEFAULT_DESKTOP_AI_DOCK_STATE,
    );
  });

  it("normalizes malformed ai dock payloads from the desktop bridge", async () => {
    const bridge = createBridge({
      runtimeState: {
        // 边界测试：模拟 IPC / 桥接返回被破坏或未经验证的 payload 时，验证规范化防御降级
        get: vi.fn(async () => ({
          ...DEFAULT_DESKTOP_RUNTIME_STATE,
          aiDock: {
            activeProvider: "unknown-provider",
            activeView: "unknown-view",
            isOpen: "yes",
            panelWidth: -20,
          },
        } as unknown as DesktopRuntimeState)),
        importLegacy: vi.fn(async () => DEFAULT_DESKTOP_RUNTIME_STATE),
        setLastWorkspace: vi.fn(async () => DEFAULT_DESKTOP_RUNTIME_STATE),
      },
    });

    const runtimeState = await readDesktopRuntimeState(
      bridge,
      window.localStorage,
    );

    expect(runtimeState.aiDock).toEqual(DEFAULT_DESKTOP_AI_DOCK_STATE);
  });

  it("imports legacy localStorage state into the desktop bridge once", async () => {
    const bridge = createBridge();
    writeLastWorkspace(window.localStorage, "notes");

    const runtimeState = await hydrateDesktopRuntimeState(
      bridge,
      window.localStorage,
    );

    expect(runtimeState.lastWorkspace).toBe("notes");
    expect(runtimeState.legacyRuntimeMigratedAt).toEqual(expect.any(String));
    expect(bridge.runtimeState.importLegacy).toHaveBeenCalledWith({
      lastVisitedAt: expect.any(String),
      lastWorkspace: "notes",
    });
  });

  it("persists workspace changes through the desktop bridge when present", async () => {
    const bridge = createBridge();

    const runtimeState = await persistLastWorkspace(
      bridge,
      window.localStorage,
      "assessment",
    );

    expect(runtimeState.lastWorkspace).toBe("assessment");
    expect(bridge.runtimeState.setLastWorkspace).toHaveBeenCalledWith("assessment");
    expect(window.localStorage.getItem("shadowing:desktop:app-runtime")).toBeNull();
  });

  it("persists resume targets through the desktop bridge when supported", async () => {
    const bridge = createBridge();

    const runtimeState = await persistResumeTarget(
      bridge,
      window.localStorage,
      "training",
      "session-1",
    );

    expect(runtimeState.primaryResumeType).toBe("training");
    expect(runtimeState.primaryResumeId).toBe("session-1");
    expect(bridge.runtimeState.setResumeTarget).toHaveBeenCalledWith("training", "session-1");
  });
});
