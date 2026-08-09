import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadUpdateSettings } from "@/features/updates/update-settings";
import {
  __resetAppUpdateStoreForTests,
  useAppUpdateStore,
} from "@/features/updates/update-store";
import {
  __resetUpdateCheckFlagsForTests,
  useAppUpdateOperations,
} from "@/features/updates/use-app-updates";
import type { DesktopUpdateSnapshot } from "@/platform/desktop/desktop-bridge";
import { createTestDesktopBridge } from "../../helpers/desktop-bridge";

function updateSnapshot(
  overrides: Partial<DesktopUpdateSnapshot> = {},
): DesktopUpdateSnapshot {
  return {
    canInstallInPlace: false,
    currentVersion: "1.0.0",
    downloadProgress: null,
    error: null,
    errorCode: null,
    lastCheckedAt: null,
    releasesUrl: "https://example.test/releases",
    status: "idle",
    updateInfo: null,
    ...overrides,
  };
}

function installUpdatesBridge(checkResult: DesktopUpdateSnapshot) {
  const check = vi.fn(async () => checkResult);
  window.shadowingDesktop = createTestDesktopBridge({
    updates: {
      check,
      download: vi.fn(async () => checkResult),
      getState: vi.fn(async () => checkResult),
      onStateChange: vi.fn(() => () => undefined),
      openReleases: vi.fn(async () => ({ ok: true })),
      quitAndInstall: vi.fn(async () => ({ ok: true })),
      reset: vi.fn(async () => checkResult),
    },
  });
  return { check };
}

describe("useAppUpdateOperations", () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetAppUpdateStoreForTests();
    __resetUpdateCheckFlagsForTests();
  });

  afterEach(() => {
    delete window.shadowingDesktop;
    window.localStorage.clear();
    __resetAppUpdateStoreForTests();
    __resetUpdateCheckFlagsForTests();
    vi.restoreAllMocks();
  });

  it("records the IPC success even while the renderer store still contains an older error", async () => {
    const now = new Date("2026-08-09T14:00:00+08:00");
    vi.spyOn(Date, "now").mockReturnValue(now.getTime());
    const success = updateSnapshot({ status: "up-to-date", lastCheckedAt: now.getTime() });
    installUpdatesBridge(success);
    useAppUpdateStore.getState().applySnapshot(
      updateSnapshot({
        error: "Previous check failed.",
        errorCode: "NETWORK_ERROR",
        status: "error",
      }),
    );

    const { result } = renderHook(() => useAppUpdateOperations());
    await act(async () => {
      await result.current.checkForUpdates();
    });

    expect(loadUpdateSettings().lastCheckTimestamp).toBe(now.getTime());
  });

  it("does not record a successful check time when IPC returns an error before the state push arrives", async () => {
    installUpdatesBridge(
      updateSnapshot({
        error: "Update feed is not configured.",
        errorCode: "UPDATE_FEED_NOT_CONFIGURED",
        status: "error",
      }),
    );
    // 故意保持 renderer store 为 stale idle，复现 invoke 响应先于 state push。
    expect(useAppUpdateStore.getState().snapshot.status).toBe("idle");

    const { result } = renderHook(() => useAppUpdateOperations());
    await act(async () => {
      await result.current.checkForUpdates();
    });

    expect(loadUpdateSettings().lastCheckTimestamp).toBeNull();
  });
});
