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
import type { DesktopBridge } from "@/platform/desktop/desktop-bridge";

function createBridge() {
  let runtimeState = { ...DEFAULT_DESKTOP_RUNTIME_STATE };

  return {
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
    },
  } satisfies Pick<DesktopBridge, "runtimeState">;
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
      bridge as DesktopBridge,
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
        get: vi.fn(async () => ({
          ...DEFAULT_DESKTOP_RUNTIME_STATE,
          aiDock: {
            activeProvider: "unknown-provider",
            activeView: "unknown-view",
            isOpen: "yes",
            panelWidth: -20,
          },
        })),
        importLegacy: vi.fn(async () => DEFAULT_DESKTOP_RUNTIME_STATE),
        setLastWorkspace: vi.fn(async () => DEFAULT_DESKTOP_RUNTIME_STATE),
      },
    });

    const runtimeState = await readDesktopRuntimeState(
      bridge as DesktopBridge,
      window.localStorage,
    );

    expect(runtimeState.aiDock).toEqual(DEFAULT_DESKTOP_AI_DOCK_STATE);
  });

  it("imports legacy localStorage state into the desktop bridge once", async () => {
    const bridge = createBridge();
    writeLastWorkspace(window.localStorage, "notes");

    const runtimeState = await hydrateDesktopRuntimeState(
      bridge as DesktopBridge,
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
      bridge as DesktopBridge,
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
      bridge as DesktopBridge,
      window.localStorage,
      "training",
      "session-1",
    );

    expect(runtimeState.primaryResumeType).toBe("training");
    expect(runtimeState.primaryResumeId).toBe("session-1");
    expect(bridge.runtimeState.setResumeTarget).toHaveBeenCalledWith("training", "session-1");
  });
});
