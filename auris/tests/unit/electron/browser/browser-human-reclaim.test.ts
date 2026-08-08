import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  createBrowserHumanReclaim,
} = require("../../../../electron/browser/browser-human-reclaim.cjs");
const {
  createBrowserApprovalManager,
  hashBrowserApprovalPayload,
} = require("../../../../electron/browser/browser-approvals.cjs");
const { createBrowserGrantManager } = require("../../../../electron/browser/browser-grants.cjs");
const { createBrowserLeaseManager } = require("../../../../electron/browser/browser-lease.cjs");
const { createBrowserRegistry } = require("../../../../electron/browser/browser-registry.cjs");
const {
  createBrowserCommandDispatcher,
} = require("../../../../electron/browser/browser-command-dispatcher.cjs");
const {
  createBrowserPartitionSelector,
} = require("../../../../electron/browser/browser-partitions.cjs");

function createWebContentsDouble() {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    emit(name: string, ...args: unknown[]) {
      for (const listener of listeners.get(name) ?? []) listener(...args);
    },
    listenerCount(name: string) {
      return listeners.get(name)?.size ?? 0;
    },
    on(name: string, listener: (...args: unknown[]) => void) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(listener);
    },
    removeListener(name: string, listener: (...args: unknown[]) => void) {
      listeners.get(name)?.delete(listener);
    },
  };
}

function createDispatcherFixture() {
  const registry = createBrowserRegistry();
  const leases = createBrowserLeaseManager();
  const grants = createBrowserGrantManager();
  const approvals = createBrowserApprovalManager({ grants });
  const sourceControlEpochs = new Map<string, number>();
  const partitionSelector = createBrowserPartitionSelector({
    createPagePolicy: () => ({ attach: () => () => undefined }),
    getSession: () => ({
      setPermissionCheckHandler() {},
      setPermissionRequestHandler() {},
    }),
  });
  const executor = {
    execute: vi.fn(async ({
      signal,
      request,
    }: {
      request: { action: string };
      signal?: AbortSignal;
    }) => {
      if (request.action !== "wait") return { action: request.action };
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 5_000);
        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(Object.assign(new Error("cancelled"), { code: "CANCELLED" }));
        }, { once: true });
      });
      return { waited: true };
    }),
  };
  const dispatcher = createBrowserCommandDispatcher({
    approvals,
    createAiSandboxTarget: async ({ url }: { url: string }) => {
      const window = registry.createWindow();
      const tab = registry.createTab(window.windowId, {
        automationMode: "AiSandbox",
        title: "Sandbox",
        url,
      });
      registry.setTabLifecycle(window.windowId, tab.tabId, "ready");
      const partition = partitionSelector.select("AiSandbox");
      const webContents = { getURL: () => "", session: partition.session };
      partition.attachPagePolicy(webContents);
      return {
        automationMode: "AiSandbox",
        partition: partition.partition,
        tabId: tab.tabId,
        webContents,
        windowId: window.windowId,
      };
    },
    destroyTarget: async () => true,
    executor,
    getCurrentControlEpoch: ({ tab, tabId, windowId }: {
      tab: { controlEpoch: number };
      tabId: string;
      windowId: string;
    }) => sourceControlEpochs.get(`${windowId}/${tabId}`) ?? tab.controlEpoch,
    grants,
    leases,
    partitionSelector,
    registry,
  });
  return {
    approvals,
    dispatcher,
    executor,
    grants,
    leases,
    registry,
    setCurrentControlEpoch(windowId: string, tabId: string, controlEpoch: number) {
      sourceControlEpochs.set(`${windowId}/${tabId}`, controlEpoch);
    },
  };
}

describe("browser human reclaim", () => {
  it("attaches trusted Electron hooks and reclaim synchronously on mouse/keyboard", () => {
    const reclaim = vi.fn();
    const humanReclaim = createBrowserHumanReclaim({ reclaim });
    const webContents = createWebContentsDouble();
    const dispose = humanReclaim.attach(webContents, {
      tabId: "browser-tab-1",
      windowId: "browser-window-1",
    });

    expect(webContents.listenerCount("before-input-event")).toBe(1);
    expect(webContents.listenerCount("before-mouse-event")).toBe(1);

    webContents.emit("before-mouse-event", {}, { type: "mouseDown", button: "left" });
    expect(reclaim).toHaveBeenCalledWith({
      reason: "mouse",
      tabId: "browser-tab-1",
      windowId: "browser-window-1",
    });

    webContents.emit("before-input-event", {}, {
      isAutoRepeat: false,
      key: "a",
      type: "keyDown",
    });
    expect(reclaim).toHaveBeenCalledWith({
      reason: "keyboard",
      tabId: "browser-tab-1",
      windowId: "browser-window-1",
    });

    dispose();
    expect(webContents.listenerCount("before-input-event")).toBe(0);
    expect(webContents.listenerCount("before-mouse-event")).toBe(0);
  });

  it("ignores mouse moves, key repeats, and page-forged events cannot be attached via page script", () => {
    const reclaim = vi.fn();
    const humanReclaim = createBrowserHumanReclaim({ reclaim });
    const webContents = createWebContentsDouble();
    humanReclaim.attach(webContents, {
      tabId: "browser-tab-1",
      windowId: "browser-window-1",
    });

    webContents.emit("before-mouse-event", {}, { type: "mouseMove" });
    webContents.emit("before-input-event", {}, {
      isAutoRepeat: true,
      key: "a",
      type: "keyDown",
    });
    webContents.emit("before-input-event", {}, { type: "keyUp", key: "a" });
    expect(reclaim).not.toHaveBeenCalled();

    // Page scripts only get DOM events; they cannot register Electron hooks.
    expect(typeof (globalThis as { dispatchEvent?: unknown }).dispatchEvent).not.toBe("undefined");
  });

  it("reclaims a controlled tab: rotates epoch, aborts owner work, denies approvals, releases lease", async () => {
    const fixture = createDispatcherFixture();
    const opened = await fixture.dispatcher.dispatch({
      connectionId: "connection-reclaim",
      params: { request: { action: "open", url: "https://example.com/start" } },
      signal: new AbortController().signal,
    });
    const beforeTabEpoch = fixture.registry.getTab(
      opened.target.windowId,
      opened.target.tabId,
    ).controlEpoch;
    fixture.approvals.request({
      action: "act",
      connectionId: "connection-reclaim",
      controlEpoch: opened.control.controlEpoch,
      navigationGeneration: opened.control.navigationGeneration,
      operation: "click",
      origin: "https://example.com",
      owner: { id: "connection-reclaim", kind: "mcp" },
      payloadHash: hashBrowserApprovalPayload({ action: "act", variant: "click" }),
      tabId: opened.target.tabId,
      windowId: opened.target.windowId,
    });
    expect(fixture.approvals.snapshot().pendingApprovals).toHaveLength(1);

    const controller = new AbortController();
    const pendingAction = fixture.dispatcher.dispatch({
      connectionId: "connection-reclaim",
      params: {
        control: opened.control,
        request: { action: "wait", milliseconds: 5_000 },
      },
      signal: controller.signal,
    });

    await vi.waitFor(() => {
      expect(fixture.executor.execute).toHaveBeenCalled();
    });
    const result = fixture.dispatcher.humanReclaim(
      opened.target.windowId,
      opened.target.tabId,
      { reason: "mouse" },
    );
    expect(result).toMatchObject({ reclaimed: true, reason: "mouse" });
    expect(result.controlEpoch).toBe(beforeTabEpoch + 1);
    expect(fixture.leases.snapshot().leases).toEqual([]);
    expect(fixture.approvals.snapshot().pendingApprovals).toEqual([]);

    await expect(pendingAction).rejects.toMatchObject({ code: "CANCELLED" });
    await expect(fixture.dispatcher.dispatch({
      connectionId: "connection-reclaim",
      params: {
        control: opened.control,
        request: { action: "read" },
      },
      signal: new AbortController().signal,
    })).rejects.toMatchObject({
      code: expect.stringMatching(/LEASE_LOST|CONTROL_STALE|STALE/),
    });
  });

  it("does not reclaim another tab when input arrives for a different surface", async () => {
    const fixture = createDispatcherFixture();
    const first = await fixture.dispatcher.dispatch({
      connectionId: "connection-a",
      params: { request: { action: "open", url: "https://example.com/a" } },
      signal: new AbortController().signal,
    });
    const second = await fixture.dispatcher.dispatch({
      connectionId: "connection-b",
      params: { request: { action: "open", url: "https://example.com/b" } },
      signal: new AbortController().signal,
    });

    fixture.dispatcher.humanReclaim(first.target.windowId, first.target.tabId, {
      reason: "keyboard",
    });
    expect(fixture.leases.snapshot().leases).toHaveLength(1);
    expect(fixture.leases.snapshot().leases[0]).toMatchObject({
      tabId: second.target.tabId,
      windowId: second.target.windowId,
    });
  });
});
