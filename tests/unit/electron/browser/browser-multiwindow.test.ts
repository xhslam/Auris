import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createBrowserRegistry } = require("../../../../electron/browser/browser-registry.cjs");
const { createBrowserLeaseManager } = require("../../../../electron/browser/browser-lease.cjs");
const { parseBrowserChromePayload } = require("../../../../electron/browser/browser-ipc.cjs");

describe("explicit browser multi-window contracts", () => {
  it("creates tabs only in the selected window and never reuses window/tab IDs", () => {
    const registry = createBrowserRegistry();
    const first = registry.createWindow();
    const second = registry.createWindow();
    const firstTab = registry.createTab(first.windowId, { url: "https://one.example/" });
    const secondTab = registry.createTab(second.windowId, { url: "https://two.example/" });
    const selected = registry.createTab(second.windowId, { url: "https://two.example/selected" });
    expect(registry.getWindow(first.windowId).tabs.map((tab: { tabId: string }) => tab.tabId)).toEqual([firstTab.tabId]);
    expect(registry.getWindow(second.windowId).tabs.map((tab: { tabId: string }) => tab.tabId)).toEqual([secondTab.tabId, selected.tabId]);
    registry.closeWindow(first.windowId);
    const replacement = registry.createWindow();
    const replacementTab = registry.createTab(replacement.windowId);
    expect(replacement.windowId).not.toBe(first.windowId);
    expect(replacementTab.tabId).not.toBe(firstTab.tabId);
  });

  it("keeps active tabs and lease ownership independent across focus changes", () => {
    const registry = createBrowserRegistry();
    const first = registry.createWindow();
    const second = registry.createWindow();
    const firstTab = registry.createTab(first.windowId);
    const secondTab = registry.createTab(second.windowId);
    const leases = createBrowserLeaseManager({ randomBytes: () => Buffer.alloc(32, 5) });
    leases.acquire({ connectionId: "owner-one", controlEpoch: 0, navigationGeneration: 0, windowId: first.windowId, tabId: firstTab.tabId });
    const authority = leases.snapshot();
    registry.activateWindow(second.windowId);
    registry.activateTab(second.windowId, secondTab.tabId);
    expect(leases.snapshot()).toEqual(authority);
    expect(registry.getWindow(first.windowId).activeTabId).toBe(firstTab.tabId);
    expect(registry.getWindow(second.windowId).activeTabId).toBe(secondTab.tabId);
  });

  it("strictly parses explicit window controls without authority material", () => {
    expect(parseBrowserChromePayload("createWindow", {})).toEqual({});
    expect(parseBrowserChromePayload("focusWindow", { windowId: "window-2" })).toEqual({ windowId: "window-2" });
    expect(parseBrowserChromePayload("createTabInWindow", { windowId: "window-2", automationMode: "AiSandbox" })).toEqual({ windowId: "window-2", automationMode: "AiSandbox" });
    expect(() => parseBrowserChromePayload("focusWindow", { windowId: "window-2", leaseToken: "forged" })).toThrow(/Unknown/u);
    expect(() => parseBrowserChromePayload("createTabInWindow", { windowId: "window-2", moveTabId: "tab-1" })).toThrow(/Unknown/u);
  });

  it("strictly parses a renderer-measured embedded viewport", () => {
    expect(parseBrowserChromePayload("setViewport", {
      height: 500.4,
      visible: true,
      width: 800.6,
      x: 201.2,
      y: 113.8,
    })).toEqual({ height: 500, visible: true, width: 801, x: 201, y: 114 });
    expect(() => parseBrowserChromePayload("setViewport", {
      height: 500,
      visible: true,
      width: Number.NaN,
      x: 0,
      y: 0,
    })).toThrow(/finite/u);
    expect(() => parseBrowserChromePayload("setViewport", {
      height: 500,
      visible: true,
      width: 800,
      x: 0,
      y: 0,
      leaseToken: "forged",
    })).toThrow(/Unknown/u);
  });
});
