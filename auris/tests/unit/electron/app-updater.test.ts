import { createRequire } from "node:module";
import { EventEmitter } from "node:events";

const require = createRequire(import.meta.url);
const {
  INDETERMINATE_STEP_BYTES,
  NO_FEED_CODE,
  UNSIGNED_CODE,
  createAppUpdater,
  isNewerVersion,
  normalizeReleaseNotes,
  shouldWriteProgress,
} = require("../../../electron/updates/app-updater.cjs");

/**
 * Minimal stand-in for electron-updater's autoUpdater: an EventEmitter with the
 * three methods the controller calls. Deliberately NOT a vi.mock of the real
 * module — the point is to exercise our state machine, and a mock that also
 * reimplements electron-updater would only test itself.
 */
function createFakeAutoUpdater(overrides: Record<string, unknown> = {}) {
  const emitter = new EventEmitter() as EventEmitter & Record<string, unknown>;
  emitter.autoDownload = true;
  emitter.autoInstallOnAppQuit = false;
  emitter.isUpdaterActive = () => true;
  emitter.checkForUpdates = async () => ({ updateInfo: { version: "1.0.0" } });
  emitter.downloadUpdate = async () => ["/tmp/Auris.dmg"];
  emitter.quitAndInstall = () => {};
  Object.assign(emitter, overrides);
  return emitter;
}

function createUpdater(overrides: Record<string, unknown> = {}, options: Record<string, unknown> = {}) {
  const autoUpdater = createFakeAutoUpdater(overrides);
  const openExternal = vi.fn(async () => {});
  const updater = createAppUpdater({
    autoUpdater,
    getCurrentVersion: () => "1.0.0",
    openExternal,
    releasesUrl: "https://example.test/releases",
    ...options,
  });
  return { autoUpdater, openExternal, updater };
}

describe("shouldWriteProgress", () => {
  it("always writes the first tick", () => {
    expect(shouldWriteProgress(0, -1, 1000)).toBe(true);
  });

  it("writes once per whole percent when the total is known", () => {
    // 1000-byte total: 10 bytes is 1%, so 5 → 9 stays inside the same percent.
    expect(shouldWriteProgress(9, 5, 1000)).toBe(false);
    expect(shouldWriteProgress(15, 5, 1000)).toBe(true);
  });

  it("falls back to a byte step when the total is unknown", () => {
    expect(shouldWriteProgress(INDETERMINATE_STEP_BYTES - 1, 0, null)).toBe(false);
    expect(shouldWriteProgress(INDETERMINATE_STEP_BYTES, 0, null)).toBe(true);
  });

  it("treats a zero total as unknown rather than dividing by it", () => {
    expect(shouldWriteProgress(10, 0, 0)).toBe(false);
    expect(shouldWriteProgress(INDETERMINATE_STEP_BYTES, 0, 0)).toBe(true);
  });
});

describe("isNewerVersion", () => {
  it("compares numerically, not lexically", () => {
    // "10" < "9" as strings — the exact bug a lexical compare would ship.
    expect(isNewerVersion("1.10.0", "1.9.0")).toBe(true);
    expect(isNewerVersion("1.9.0", "1.10.0")).toBe(false);
  });

  it("rejects an equal version", () => {
    expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
  });

  it("treats a longer version with extra segments as newer", () => {
    expect(isNewerVersion("1.0.1", "1.0")).toBe(true);
    expect(isNewerVersion("1.0", "1.0.1")).toBe(false);
  });

  it("tolerates a leading v", () => {
    expect(isNewerVersion("v1.1.0", "1.0.0")).toBe(true);
  });

  it("rejects empty or non-string candidates", () => {
    expect(isNewerVersion("", "1.0.0")).toBe(false);
    expect(isNewerVersion(undefined, "1.0.0")).toBe(false);
  });
});

describe("normalizeReleaseNotes", () => {
  it("passes a string through", () => {
    expect(normalizeReleaseNotes("hello")).toBe("hello");
  });

  it("flattens the per-version array shape", () => {
    expect(
      normalizeReleaseNotes([
        { version: "1.1.0", note: "a" },
        { version: "1.2.0", note: "b" },
      ]),
    ).toBe("## 1.1.0\na\n\n## 1.2.0\nb");
  });

  it("returns empty string for anything else", () => {
    expect(normalizeReleaseNotes(null)).toBe("");
    expect(normalizeReleaseNotes(42)).toBe("");
  });
});

describe("createAppUpdater", () => {
  it("starts idle", () => {
    const { updater } = createUpdater();
    expect(updater.getSnapshot().status).toBe("idle");
  });

  it("reports up-to-date when the feed offers the current version", async () => {
    const { updater } = createUpdater({
      checkForUpdates: async () => ({ updateInfo: { version: "1.0.0" } }),
    });

    await expect(updater.check()).resolves.toBe(false);
    const snapshot = updater.getSnapshot();
    expect(snapshot.status).toBe("up-to-date");
    expect(snapshot.updateInfo).toBeNull();
  });

  it("reports available with normalized info when the feed is newer", async () => {
    const { updater } = createUpdater({
      checkForUpdates: async () => ({
        updateInfo: {
          version: "1.2.0",
          releaseNotes: "fixed things",
          releaseDate: "2026-08-01T00:00:00Z",
        },
      }),
    });

    await expect(updater.check()).resolves.toBe(true);
    expect(updater.getSnapshot().updateInfo).toEqual({
      version: "1.2.0",
      currentVersion: "1.0.0",
      notes: "fixed things",
      pubDate: "2026-08-01T00:00:00Z",
    });
  });

  it("distinguishes an unconfigured feed from a network error", async () => {
    const { updater } = createUpdater({ isUpdaterActive: () => false });

    await updater.check();
    const snapshot = updater.getSnapshot();
    expect(snapshot.status).toBe("error");
    expect(snapshot.errorCode).toBe(NO_FEED_CODE);
  });

  it("surfaces a check failure as an error with the cause message", async () => {
    const { updater } = createUpdater({
      checkForUpdates: async () => {
        throw new Error("ENOTFOUND example.test");
      },
    });

    await updater.check();
    expect(updater.getSnapshot()).toMatchObject({
      status: "error",
      error: "ENOTFOUND example.test",
    });
  });

  it("hides verbose HTTP response details from the renderer", async () => {
    const leakedCookie = "_gh_sess=should-not-reach-the-renderer";
    const { updater } = createUpdater({
      checkForUpdates: async () => {
        throw new Error(
          `Please double check your authentication token. Headers: { "set-cookie": "${leakedCookie}", "x-github-request-id": "request-id" }`,
        );
      },
    });

    await updater.check();
    const snapshot = updater.getSnapshot();
    expect(snapshot).toMatchObject({
      status: "error",
      error: "更新检查失败，请稍后重试。",
    });
    expect(snapshot.error).not.toContain(leakedCookie);
    expect(snapshot.error).not.toContain("Headers:");
  });

  it("shares one in-flight check across concurrent callers", async () => {
    let calls = 0;
    const { updater } = createUpdater({
      checkForUpdates: async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 0));
        return { updateInfo: { version: "1.0.0" } };
      },
    });

    await Promise.all([updater.check(), updater.check(), updater.check()]);
    expect(calls).toBe(1);
  });

  it("marks a hung check as stalled and starts a fresh check after recovery", async () => {
    let calls = 0;
    let now = 0;
    const { updater } = createUpdater(
      {
        checkForUpdates: async () => {
          calls += 1;
          if (calls === 1) {
            return new Promise(() => {});
          }
          return { updateInfo: { version: "2.0.0" } };
        },
      },
      {
        checkStallAfterMs: 1_000,
        now: () => now,
      },
    );
    void updater.check();
    now = 1_001;

    expect(updater.checkForStall()).toEqual({ operation: "check", stalled: true });
    expect(updater.getSnapshot()).toMatchObject({
      errorCode: "UPDATE_STALLED",
      stalledOperation: "check",
      status: "stalled",
    });
    expect(updater.recoverFromStall()).toEqual({ ok: true, operation: "check" });

    await expect(updater.check()).resolves.toBe(true);
    expect(calls).toBe(2);
    expect(updater.getSnapshot()).toMatchObject({
      stalledOperation: null,
      status: "available",
    });
  });
  it("treats download progress as activity and never offers recovery while bytes move", async () => {
    let now = 0;
    const { autoUpdater, updater } = createUpdater(
      {
        checkForUpdates: async () => ({ updateInfo: { version: "2.0.0" } }),
        downloadUpdate: async () => new Promise(() => {}),
      },
      {
        downloadStallAfterMs: 1_000,
        now: () => now,
      },
    );
    await updater.check();
    void updater.download();
    now = 900;
    autoUpdater.emit("download-progress", { total: 1_000, transferred: 10 });
    now = 1_800;

    expect(updater.checkForStall()).toEqual({ operation: null, stalled: false });
    expect(updater.getSnapshot()).toMatchObject({
      stalledOperation: null,
      status: "downloading",
    });
  });
  it("releases a hung download so a fresh update check can begin", async () => {
    let now = 0;
    const { updater } = createUpdater(
      {
        checkForUpdates: async () => ({ updateInfo: { version: "2.0.0" } }),
        downloadUpdate: async () => new Promise(() => {}),
      },
      {
        downloadStallAfterMs: 1_000,
        now: () => now,
      },
    );
    await updater.check();
    void updater.download();
    now = 1_001;

    expect(updater.checkForStall()).toEqual({ operation: "download", stalled: true });
    expect(updater.recoverFromStall()).toEqual({ ok: true, operation: "download" });
    expect(updater.getSnapshot()).toMatchObject({
      downloadProgress: null,
      stalledOperation: null,
      status: "idle",
      updateInfo: null,
    });
  });
  it("throttles download progress instead of pushing every chunk", async () => {
    const { autoUpdater, updater } = createUpdater({
      checkForUpdates: async () => ({ updateInfo: { version: "2.0.0" } }),
      downloadUpdate: async () => [],
    });
    const states: unknown[] = [];
    updater.onStateChange((snapshot: { downloadProgress: unknown }) => {
      if (snapshot.downloadProgress) states.push(snapshot.downloadProgress);
    });

    await updater.check();
    const download = updater.download();
    // 1000-byte total → these three land inside the same whole percent.
    autoUpdater.emit("download-progress", { total: 1000, transferred: 1 });
    autoUpdater.emit("download-progress", { total: 1000, transferred: 2 });
    autoUpdater.emit("download-progress", { total: 1000, transferred: 3 });
    autoUpdater.emit("download-progress", { total: 1000, transferred: 500 });
    await download;

    // The initial {0,null} plus one 1% tick plus the 50% tick — not four ticks.
    expect(states.length).toBeLessThanOrEqual(3);
  });

  it("moves to ready on update-downloaded", async () => {
    const { autoUpdater, updater } = createUpdater({
      checkForUpdates: async () => ({ updateInfo: { version: "2.0.0" } }),
      downloadUpdate: async () => {
        autoUpdater.emit("update-downloaded", { version: "2.0.0" });
        return [];
      },
    });

    await updater.check();
    await updater.download();
    expect(updater.getSnapshot().status).toBe("ready");
  });

  it("refuses to download when nothing is available", async () => {
    const { updater } = createUpdater();
    await expect(updater.download()).resolves.toBe(false);
  });

  it("routes to the releases page instead of faking an install on unsigned builds", async () => {
    const { openExternal, updater } = createUpdater(
      { checkForUpdates: async () => ({ updateInfo: { version: "2.0.0" } }) },
      { canInstallInPlace: false },
    );

    await updater.check();
    await expect(updater.download()).resolves.toBe(false);
    expect(updater.getSnapshot().status).toBe("manual-download");
    expect(openExternal).toHaveBeenCalledWith("https://example.test/releases");
  });

  it("refuses quitAndInstall unless a download is actually ready", () => {
    const { updater } = createUpdater();
    expect(updater.quitAndInstall()).toEqual({ ok: false, reason: "NOT_READY" });
  });

  it("refuses quitAndInstall on an unsigned build even when ready", async () => {
    const { autoUpdater, updater } = createUpdater(
      {
        checkForUpdates: async () => ({ updateInfo: { version: "2.0.0" } }),
        downloadUpdate: async () => [],
      },
      { canInstallInPlace: false },
    );

    await updater.check();
    // Force the ready state the way the real event would.
    autoUpdater.emit("update-downloaded", { version: "2.0.0" });
    expect(updater.quitAndInstall()).toEqual({ ok: false, reason: UNSIGNED_CODE });
  });

  it("installs when ready and signed", async () => {
    const quitAndInstall = vi.fn();
    const { autoUpdater, updater } = createUpdater({
      checkForUpdates: async () => ({ updateInfo: { version: "2.0.0" } }),
      quitAndInstall,
    });

    await updater.check();
    autoUpdater.emit("update-downloaded", { version: "2.0.0" });
    expect(updater.quitAndInstall()).toEqual({ ok: true });
    expect(updater.getSnapshot().status).toBe("installing");
    expect(quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it("clears a stale error when moving to a non-error status", async () => {
    const responses = [
      () => {
        throw new Error("network down");
      },
      () => ({ updateInfo: { version: "1.0.0" } }),
    ];
    const { updater } = createUpdater({
      checkForUpdates: async () => responses.shift()!(),
    });

    await updater.check();
    expect(updater.getSnapshot().status).toBe("error");

    await updater.check();
    const snapshot = updater.getSnapshot();
    expect(snapshot.status).toBe("up-to-date");
    expect(snapshot.error).toBeNull();
  });

  it("turns an autoUpdater error event into error state", async () => {
    const { autoUpdater, updater } = createUpdater();
    await updater.check();
    autoUpdater.emit("error", new Error("signature mismatch"));
    expect(updater.getSnapshot()).toMatchObject({
      status: "error",
      error: "signature mismatch",
    });
  });

  it("resets back to idle", async () => {
    const { updater } = createUpdater({
      checkForUpdates: async () => ({ updateInfo: { version: "3.0.0" } }),
    });
    await updater.check();
    updater.reset();
    expect(updater.getSnapshot()).toMatchObject({ status: "idle", updateInfo: null });
  });

  it("requires an autoUpdater and a version getter", () => {
    expect(() => createAppUpdater({ getCurrentVersion: () => "1.0.0" })).toThrow(TypeError);
    expect(() => createAppUpdater({ autoUpdater: createFakeAutoUpdater() })).toThrow(TypeError);
  });
});
