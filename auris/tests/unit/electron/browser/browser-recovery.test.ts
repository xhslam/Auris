import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createBrowserRecovery } = require(
  "../../../../electron/browser/browser-recovery.cjs",
);
const { createBrowserRegistry } = require(
  "../../../../electron/browser/browser-registry.cjs",
);

describe("browser recovery", () => {
  it("auto-reloads the first three consecutive failures then enters manual-only", () => {
    const recovery = createBrowserRecovery({
      backoffMs: [0, 10, 20],
      maxAutoReloads: 3,
    });
    expect(recovery.noteFailure("w1", "t1", { kind: "crash" })).toEqual({
      action: "auto-reload",
      delayMs: 0,
      streak: 1,
    });
    expect(recovery.noteFailure("w1", "t1", { kind: "unresponsive" })).toEqual({
      action: "auto-reload",
      delayMs: 10,
      streak: 2,
    });
    expect(recovery.noteFailure("w1", "t1", { kind: "failed-load" })).toEqual({
      action: "auto-reload",
      delayMs: 20,
      streak: 3,
    });
    expect(recovery.noteFailure("w1", "t1", { kind: "crash" })).toEqual({
      action: "manual-only",
      streak: 4,
    });
    expect(recovery.decide("w1", "t1")).toEqual({
      action: "manual-only",
      streak: 4,
    });
    expect(recovery.snapshot("w1", "t1")).toMatchObject({
      mode: "manual-only",
      streak: 4,
    });
  });

  it("resets the streak after a successful load", () => {
    const recovery = createBrowserRecovery({ maxAutoReloads: 3 });
    recovery.noteFailure("w1", "t1", { kind: "crash" });
    recovery.noteFailure("w1", "t1", { kind: "crash" });
    expect(recovery.noteSuccessfulLoad("w1", "t1")).toMatchObject({
      mode: "ok",
      streak: 0,
    });
    expect(recovery.noteFailure("w1", "t1", { kind: "crash" })).toMatchObject({
      action: "auto-reload",
      streak: 1,
    });
  });

  it("purges authority and registry runtime so restored Human tabs keep no history or identities", () => {
    const purge = vi.fn();
    const recovery = createBrowserRecovery({ onAuthorityPurge: purge });
    const registry = createBrowserRegistry();
    const window = registry.createWindow();
    const tab = registry.createTab(window.windowId, {
      automationMode: "Human",
      history: { entries: ["https://a.example/", "https://b.example/"], index: 1 },
      profileIdentity: "profile-1",
      sessionIdentity: "session-1",
      title: "Before",
      url: "https://b.example/",
    });
    const beforeEpoch = tab.controlEpoch;
    const beforeNav = tab.navigationGeneration;

    recovery.noteFailure(window.windowId, tab.tabId, { kind: "crash" });
    expect(purge).toHaveBeenCalledWith(window.windowId, tab.tabId, { kind: "crash" });

    const reset = registry.resetTabRuntimeAuthority(window.windowId, tab.tabId, {
      automationMode: "Human",
      title: "Recovered",
      url: "https://b.example/",
    });
    expect(reset).toMatchObject({
      automationMode: "Human",
      crashMode: "ok",
      crashStreak: 0,
      profileIdentity: null,
      sessionIdentity: null,
      title: "Recovered",
      url: "https://b.example/",
    });
    expect(reset.controlEpoch).toBeGreaterThan(beforeEpoch);
    expect(reset.navigationGeneration).toBeGreaterThan(beforeNav);
    expect(registry.getHistory(window.windowId, tab.tabId)).toEqual({
      entries: ["https://b.example/"],
      index: 0,
    });
  });
});
