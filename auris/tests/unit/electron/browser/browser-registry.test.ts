import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createBrowserIdFactory } = require(
  "../../../../electron/browser/browser-ids.cjs",
);
const { createBrowserRegistry } = require(
  "../../../../electron/browser/browser-registry.cjs",
);

function createFixture() {
  let clock = 1_000;
  const registry = createBrowserRegistry({
    ids: createBrowserIdFactory(),
    now: () => ++clock,
  });
  return { registry };
}

describe("browser registry", () => {
  it("allocates monotonic process-local IDs without reuse", () => {
    const firstFactory = createBrowserIdFactory();
    expect(firstFactory.nextWindowId()).toBe("browser-window-1");
    expect(firstFactory.nextWindowId()).toBe("browser-window-2");
    expect(firstFactory.nextTabId()).toBe("browser-tab-1");
    expect(firstFactory.nextTabId()).toBe("browser-tab-2");

    const secondFactory = createBrowserIdFactory();
    expect(secondFactory.nextWindowId()).toBe("browser-window-1");
    expect(secondFactory.nextTabId()).toBe("browser-tab-1");
  });

  it("keeps ordered tabs with exactly one active tab", () => {
    const { registry } = createFixture();
    const window = registry.createWindow();
    const first = registry.createTab(window.windowId, {
      url: "https://example.com/one",
    });
    const second = registry.createTab(window.windowId, {
      url: "https://example.com/two",
    });

    expect(registry.snapshot().windows[0].tabs.map((tab: { tabId: string }) => tab.tabId)).toEqual([
      first.tabId,
      second.tabId,
    ]);
    expect(registry.getWindow(window.windowId).activeTabId).toBe(second.tabId);

    registry.activateTab(window.windowId, first.tabId);
    const snapshot = registry.getWindow(window.windowId);
    expect(snapshot.activeTabId).toBe(first.tabId);
    expect(snapshot.tabs.filter((tab: { active: boolean }) => tab.active)).toHaveLength(1);
  });

  it("tracks the most recently active window without guessing after all close", () => {
    const { registry } = createFixture();
    const first = registry.createWindow();
    const second = registry.createWindow();
    expect(registry.getMostRecentWindow()?.windowId).toBe(second.windowId);

    registry.activateWindow(first.windowId);
    expect(registry.getMostRecentWindow()?.windowId).toBe(first.windowId);

    registry.closeWindow(first.windowId);
    expect(registry.getMostRecentWindow()?.windowId).toBe(second.windowId);
    registry.closeWindow(second.windowId);
    expect(registry.getMostRecentWindow()).toBeNull();
  });

  it("supports explicit multiple windows and independent active tabs", () => {
    const { registry } = createFixture();
    const firstWindow = registry.createWindow();
    const secondWindow = registry.createWindow();
    const firstTab = registry.createTab(firstWindow.windowId, {});
    const secondTab = registry.createTab(secondWindow.windowId, {});

    expect(registry.snapshot().windows).toHaveLength(2);
    expect(registry.getWindow(firstWindow.windowId).activeTabId).toBe(firstTab.tabId);
    expect(registry.getWindow(secondWindow.windowId).activeTabId).toBe(secondTab.tabId);
  });

  it("updates restorable geometry and retains only explicit Human tabs", () => {
    const { registry } = createFixture();
    const window = registry.createWindow();
    const human = registry.createTab(window.windowId, { automationMode: "Human" });
    const ai = registry.createTab(window.windowId, { automationMode: "AiSandbox" });

    expect(registry.updateWindowBounds(window.windowId, {
      height: 800,
      width: 1200,
      x: 30,
      y: 40,
    })).toBe(true);
    expect(registry.setTabRetained(window.windowId, human.tabId, true)).toBe(true);
    expect(registry.setTabRetained(window.windowId, ai.tabId, true)).toBe(false);
    expect(registry.getWindow(window.windowId)).toMatchObject({
      bounds: { height: 800, width: 1200, x: 30, y: 40 },
      tabs: [
        expect.objectContaining({ retained: true }),
        expect.objectContaining({ retained: false }),
      ],
    });
  });

  it("increments navigation generation only for document identity changes", () => {
    const { registry } = createFixture();
    const window = registry.createWindow();
    const tab = registry.createTab(window.windowId, {
      url: "https://example.com/one",
    });

    registry.updateTab(window.windowId, tab.tabId, {
      loading: true,
      title: "Loading",
    });
    expect(registry.getTab(window.windowId, tab.tabId).navigationGeneration).toBe(0);

    registry.commitNavigation(window.windowId, tab.tabId, {
      title: "Two",
      url: "https://example.com/two",
    });
    expect(registry.getTab(window.windowId, tab.tabId)).toMatchObject({
      navigationGeneration: 1,
      title: "Two",
      url: "https://example.com/two",
    });
  });

  it("keeps back-forward history in process memory without exposing it in snapshots", () => {
    const { registry } = createFixture();
    const window = registry.createWindow();
    const tab = registry.createTab(window.windowId, {
      url: "https://example.com/one",
    });
    registry.commitNavigation(window.windowId, tab.tabId, {
      url: "https://example.com/two",
    });
    registry.commitNavigation(window.windowId, tab.tabId, {
      url: "https://example.com/three",
    });

    expect(registry.getHistory(window.windowId, tab.tabId)).toEqual({
      entries: [
        "https://example.com/one",
        "https://example.com/two",
        "https://example.com/three",
      ],
      index: 2,
    });
    registry.commitNavigation(window.windowId, tab.tabId, {
      url: "https://example.com/two",
    });
    expect(registry.getHistory(window.windowId, tab.tabId).index).toBe(1);
    expect(registry.snapshot().windows[0].tabs[0]).not.toHaveProperty("history");
    expect(registry.exportWindowSession(window.windowId).tabs[0].history.index).toBe(1);
  });

  it("rejects a late navigation event from an older requested generation", () => {
    const { registry } = createFixture();
    const window = registry.createWindow();
    const tab = registry.createTab(window.windowId, {
      url: "https://example.com/start",
    });
    const firstGeneration = registry.beginNavigation(window.windowId, tab.tabId);
    const secondGeneration = registry.beginNavigation(window.windowId, tab.tabId);

    expect(registry.commitNavigation(window.windowId, tab.tabId, {
      expectedGeneration: secondGeneration,
      url: "https://example.com/second",
    })).toBe(true);
    expect(registry.commitNavigation(window.windowId, tab.tabId, {
      expectedGeneration: firstGeneration,
      url: "https://example.com/late-first",
    })).toBe(false);
    expect(registry.getTab(window.windowId, tab.tabId)).toMatchObject({
      navigationGeneration: secondGeneration,
      url: "https://example.com/second",
    });
  });

  it("enforces lifecycle transitions and rejects late events", () => {
    const { registry } = createFixture();
    const window = registry.createWindow();
    const tab = registry.createTab(window.windowId, {});

    registry.setTabLifecycle(window.windowId, tab.tabId, "ready");
    registry.setTabLifecycle(window.windowId, tab.tabId, "hibernated");
    registry.setTabLifecycle(window.windowId, tab.tabId, "ready");
    registry.setTabLifecycle(window.windowId, tab.tabId, "crashed");
    expect(registry.getTab(window.windowId, tab.tabId).lifecycle).toBe("crashed");

    expect(registry.closeTab(window.windowId, tab.tabId)).toBe(true);
    expect(registry.updateTab(window.windowId, tab.tabId, { title: "late" })).toBe(false);
    expect(registry.commitNavigation(window.windowId, tab.tabId, { url: "https://late.test" })).toBe(false);
    expect(registry.setTabLifecycle(window.windowId, tab.tabId, "ready")).toBe(false);
  });

  it("closes background, active, and last tabs deterministically", () => {
    const { registry } = createFixture();
    const window = registry.createWindow();
    const first = registry.createTab(window.windowId, {});
    const second = registry.createTab(window.windowId, {});
    const third = registry.createTab(window.windowId, {});

    registry.activateTab(window.windowId, second.tabId);
    registry.closeTab(window.windowId, first.tabId);
    expect(registry.getWindow(window.windowId).activeTabId).toBe(second.tabId);

    registry.closeTab(window.windowId, second.tabId);
    expect(registry.getWindow(window.windowId).activeTabId).toBe(third.tabId);

    registry.closeTab(window.windowId, third.tabId);
    expect(registry.getWindow(window.windowId)).toBeNull();
    expect(registry.closeTab(window.windowId, third.tabId)).toBe(false);
  });

  it("rejects duplicate explicit IDs and never reuses closed IDs", () => {
    const { registry } = createFixture();
    const window = registry.createWindow({ windowId: "fixture-window" });
    expect(() => registry.createWindow({ windowId: "fixture-window" })).toThrow(/duplicate/i);

    const tab = registry.createTab(window.windowId, { tabId: "fixture-tab" });
    expect(() => registry.createTab(window.windowId, { tabId: "fixture-tab" })).toThrow(/duplicate/i);
    registry.closeTab(window.windowId, tab.tabId);
    const nextWindow = registry.createWindow();
    expect(() => registry.createTab(nextWindow.windowId, { tabId: "fixture-tab" })).toThrow(/duplicate/i);
  });

  it("returns deeply frozen snapshots without internal mutable records", () => {
    const { registry } = createFixture();
    const window = registry.createWindow({ bounds: { x: 1, y: 2, width: 900, height: 700 } });
    registry.createTab(window.windowId, {
      automationMode: "Human",
      profileIdentity: "profile-default",
      retained: true,
      sessionIdentity: "session-default",
    });

    const snapshot = registry.snapshot();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.windows)).toBe(true);
    expect(Object.isFrozen(snapshot.windows[0])).toBe(true);
    expect(Object.isFrozen(snapshot.windows[0].tabs)).toBe(true);
    expect(Object.isFrozen(snapshot.windows[0].tabs[0])).toBe(true);
    expect(() => snapshot.windows.push({})).toThrow();
    expect(registry.snapshot().windows).toHaveLength(1);
    expect(snapshot.windows[0].tabs[0]).not.toHaveProperty("leaseToken");
  });
});
