import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  UX_SURFACES,
  createBrowserUxPolicy,
} = require("../../../../electron/browser/browser-ux-policy.cjs");
const {
  createBrowserDialogService,
} = require("../../../../electron/browser/browser-dialog-service.cjs");
const {
  createBrowserDownloadService,
} = require("../../../../electron/browser/browser-download-service.cjs");

describe("browser UX policy", () => {
  it("covers every browser-owned surface with an explicit fail-closed disposition", () => {
    const policy = createBrowserUxPolicy();
    expect(policy.surfaces).toEqual(UX_SURFACES);
    expect(policy.decide("alert")).toMatchObject({ disposition: "native-dialog" });
    expect(policy.decide("confirm")).toMatchObject({ disposition: "native-dialog" });
    expect(policy.decide("prompt")).toMatchObject({ disposition: "suppress" });
    expect(policy.decide("popup")).toMatchObject({ disposition: "deny" });
    expect(policy.decide("download")).toMatchObject({ disposition: "human-prompt" });
    expect(policy.decide("upload")).toMatchObject({ disposition: "human-prompt" });
    expect(policy.decide("certificate")).toMatchObject({ disposition: "deny" });
    expect(policy.decide("http-auth")).toMatchObject({ disposition: "human-prompt" });
    expect(policy.decide("camera")).toMatchObject({ disposition: "deny" });
    expect(policy.decide("microphone")).toMatchObject({ disposition: "deny" });
    expect(policy.decide("geolocation")).toMatchObject({ disposition: "deny" });
    expect(policy.decide("notifications")).toMatchObject({ disposition: "deny" });
    expect(policy.decide("external-protocol")).toMatchObject({ disposition: "deny" });
    expect(policy.decide("find")).toMatchObject({ disposition: "chrome-only" });
    expect(policy.decide("zoom")).toMatchObject({ disposition: "chrome-only" });
    expect(policy.decide("context-menu")).toMatchObject({ disposition: "chrome-only" });
    expect(policy.decide("print")).toMatchObject({ disposition: "deny" });
    expect(policy.decide("devtools")).toMatchObject({ disposition: "deny" });
    expect(policy.decide("devtools", { isDevelopmentBuild: true })).toMatchObject({
      disposition: "allow",
    });
    expect(policy.decide("pdf")).toMatchObject({ disposition: "engine-if-permitted" });
    expect(policy.decide("media")).toMatchObject({ disposition: "engine-if-permitted" });
    expect(policy.decide("fullscreen")).toMatchObject({ disposition: "deny" });
    expect(policy.decide("unknown-surface" as never)).toMatchObject({ disposition: "deny" });
  });

  it("keeps JS dialogs capability-gated when disableDialogs is set", () => {
    const policy = createBrowserUxPolicy({ disableDialogs: true });
    expect(() => policy.assertDialogCapability()).toThrowError(
      expect.objectContaining({ code: "CAPABILITY_NOT_VERIFIED" }),
    );
    expect(policy.decide("alert")).toMatchObject({ disposition: "deny" });
    expect(policy.decide("confirm")).toMatchObject({ disposition: "deny" });
    expect(policy.snapshot().disableDialogs).toBe(true);
  });

  it("ignores late dialog and download callbacks after dispose", () => {
    const uxPolicy = createBrowserUxPolicy();
    const dialogs = createBrowserDialogService({ uxPolicy });
    const downloads = createBrowserDownloadService({ uxPolicy });

    const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    const sessionListeners = new Map<string, Set<(...args: unknown[]) => void>>();
    const webContents = {
      debugger: {
        attach() {},
        detach() {},
        isAttached: () => true,
        on() {},
        removeListener() {},
        sendCommand: async () => ({}),
      },
      on(name: string, listener: (...args: unknown[]) => void) {
        const set = listeners.get(name) ?? new Set();
        set.add(listener);
        listeners.set(name, set);
      },
      removeListener(name: string, listener: (...args: unknown[]) => void) {
        listeners.get(name)?.delete(listener);
      },
      session: {
        on(name: string, listener: (...args: unknown[]) => void) {
          const set = sessionListeners.get(name) ?? new Set();
          set.add(listener);
          sessionListeners.set(name, set);
        },
        removeListener(name: string, listener: (...args: unknown[]) => void) {
          sessionListeners.get(name)?.delete(listener);
        },
      },
    };

    const disposeDialogs = dialogs.attach(webContents, {
      tabId: "tab-1",
      windowId: "window-1",
    });
    const disposeDownloads = downloads.attach(webContents, {
      tabId: "tab-1",
      windowId: "window-1",
    });
    expect(sessionListeners.get("will-download")?.size).toBe(1);

    disposeDialogs();
    disposeDownloads();

    expect(sessionListeners.get("will-download")?.size ?? 0).toBe(0);
    expect(dialogs.cancelAll(webContents)).toEqual({ cancelled: 0 });
    expect(downloads.cancelAll(webContents)).toEqual({ cancelled: 0 });
    expect(dialogs.snapshotPending(webContents)).toEqual([]);
  });
});
