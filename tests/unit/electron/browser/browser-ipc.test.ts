import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  BROWSER_CHROME_COMMANDS,
  BROWSER_COMMAND_CHANNEL,
  BROWSER_SNAPSHOT_CHANNEL,
  createBrowserIpc,
} = require("../../../../electron/browser/browser-ipc.cjs");

describe("browser chrome IPC", () => {
  it("freezes the exact chrome command allowlist", () => {
    expect(BROWSER_CHROME_COMMANDS).toEqual([
      "getSnapshot",
      "createWindow",
      "focusWindow",
      "closeWindow",
      "createTabInWindow",
      "createTab",
      "closeTab",
      "activateTab",
      "navigate",
      "goBack",
      "goForward",
      "reload",
      "stop",
      "bookmark",
      "removeBookmark",
      "find",
      "setZoom",
      "resolveApproval",
      "setChromeTheme",
      "setSideInset",
      "setViewport",
      "subscribe",
      "unsubscribe",
    ]);
    expect(Object.isFrozen(BROWSER_CHROME_COMMANDS)).toBe(true);
  });

  it("binds commands to the sender-owned controller", async () => {
    const fixture = createFixture();
    const sender = { id: 17 };
    const event = { sender };
    const controller = createController();
    fixture.controllers.set(sender, controller);

    await fixture.invoke(event, { command: "createTab", payload: { url: "https://example.com/" } });
    await fixture.invoke(event, { command: "activateTab", payload: { tabId: "browser-tab-1" } });
    await fixture.invoke(event, { command: "navigate", payload: { tabId: "browser-tab-1", url: "https://example.com/two" } });
    await fixture.invoke(event, { command: "setZoom", payload: { factor: 1.25 } });

    expect(controller.createTab).toHaveBeenCalledWith({ url: "https://example.com/" });
    expect(controller.activateTab).toHaveBeenCalledWith({ tabId: "browser-tab-1" });
    expect(controller.navigate).toHaveBeenCalledWith({ tabId: "browser-tab-1", url: "https://example.com/two" });
    expect(controller.setZoom).toHaveBeenCalledWith({ factor: 1.25 });
    expect(fixture.getController).toHaveBeenCalledWith(sender);
  });

  it("routes explicit multi-window intents through main window authority", async () => {
    const fixture = createFixture();
    const sender = { id: 19 };
    fixture.controllers.set(sender, createController());
    await fixture.invoke({ sender }, { command: "createWindow", payload: { url: "https://example.com/new" } });
    await fixture.invoke({ sender }, { command: "focusWindow", payload: { windowId: "browser-window-2" } });
    await fixture.invoke({ sender }, { command: "createTabInWindow", payload: { windowId: "browser-window-2", automationMode: "Human" } });
    await fixture.invoke({ sender }, { command: "closeWindow", payload: { windowId: "browser-window-2" } });
    expect(fixture.windowAuthority.createWindow).toHaveBeenCalledWith({ url: "https://example.com/new" });
    expect(fixture.windowAuthority.focusWindow).toHaveBeenCalledWith({ windowId: "browser-window-2" });
    expect(fixture.windowAuthority.createTabInWindow).toHaveBeenCalledWith({ windowId: "browser-window-2", automationMode: "Human" });
    expect(fixture.windowAuthority.closeWindow).toHaveBeenCalledWith({ windowId: "browser-window-2" });
  });

  it("resolves only strict decisions for the sender-owned approval window", async () => {
    const fixture = createFixture();
    const sender = { id: 17 };
    const controller = createController();
    (controller as Record<string, unknown>).currentWindowId = "browser-window-1";
    fixture.controllers.set(sender, controller);

    await fixture.invoke({ sender }, {
      command: "resolveApproval",
      payload: { approvalId: "approval-one", decision: "allow_once" },
    });
    expect(fixture.approvalAuthority.resolve).toHaveBeenCalledWith({
      approvalId: "approval-one",
      decision: "allow_once",
      windowId: "browser-window-1",
    });
    for (const payload of [
      { approvalId: "approval-one", decision: "always" },
      { approvalId: "bad id", decision: "deny" },
      { approvalId: "approval-one", decision: "deny", leaseToken: "secret" },
    ]) {
      await expect(fixture.invoke({ sender }, { command: "resolveApproval", payload })).rejects.toThrow();
    }
  });

  it("projects approvals into the initial snapshot and republishes on authority changes", async () => {
    const fixture = createFixture();
    const sender = { isDestroyed: vi.fn(() => false), send: vi.fn() };
    const controller = createController();
    (controller as Record<string, unknown>).currentWindowId = "browser-window-1";
    controller.getSnapshot.mockResolvedValue({ windows: [] });
    fixture.controllers.set(sender, controller);
    fixture.ipc.subscribe(sender);

    await expect(fixture.invoke({ sender }, {
      command: "getSnapshot",
      payload: {},
    })).resolves.toMatchObject({
      currentWindowId: "browser-window-1",
      pendingApprovals: [{ approvalId: "approval-browser-window-1" }],
    });

    const onApprovalChanged = fixture.approvalAuthority.subscribe.mock.calls[0]![0];
    onApprovalChanged();
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith(
      BROWSER_SNAPSHOT_CHANNEL,
      expect.objectContaining({
        currentWindowId: "browser-window-1",
        pendingApprovals: [{ approvalId: "approval-browser-window-1" }],
      }),
    ));
  });

  it("registers main snapshot delivery only for an owning chrome sender and cleans destroy/unsubscribe", async () => {
    const fixture = createFixture();
    const destroyedListeners = new Map<string, () => void>();
    const sender = {
      isDestroyed: vi.fn(() => false),
      once: vi.fn((event: string, listener: () => void) => destroyedListeners.set(event, listener)),
      removeListener: vi.fn((event: string) => destroyedListeners.delete(event)),
      send: vi.fn(),
    };
    const controller = createController();
    (controller as Record<string, unknown>).currentWindowId = "browser-window-1";
    fixture.controllers.set(sender, controller);

    await expect(fixture.invoke({ sender }, { command: "subscribe", payload: {} }))
      .resolves.toBe(true);
    fixture.ipc.publish({ windows: [] });
    expect(sender.send).toHaveBeenCalledWith(
      BROWSER_SNAPSHOT_CHANNEL,
      expect.objectContaining({ currentWindowId: "browser-window-1" }),
    );
    await expect(fixture.invoke({ sender }, { command: "unsubscribe", payload: {} }))
      .resolves.toBe(true);
    expect(sender.removeListener).toHaveBeenCalledWith("destroyed", expect.any(Function));

    await fixture.invoke({ sender }, { command: "subscribe", payload: {} });
    destroyedListeners.get("destroyed")?.();
    expect(fixture.ipc.unsubscribe(sender)).toBe(false);

    await expect(fixture.invoke({ sender: {} }, { command: "subscribe", payload: {} }))
      .rejects.toThrow(/owning browser chrome/i);
  });

  it("rejects unknown commands, keys, IDs, URLs, and oversized input", async () => {
    const fixture = createFixture();
    const sender = {};
    fixture.controllers.set(sender, createController());
    const event = { sender };

    for (const request of [
      { command: "openDevTools", payload: {} },
      { command: "navigate", payload: { url: "file:///tmp/x" } },
      { command: "navigate", payload: { url: "https://user:pass@example.com/" } },
      { command: "closeTab", payload: { tabId: "bad id" } },
      { command: "closeTab", payload: { tabId: "browser-tab-1", webContentsId: 7 } },
      { command: "getSnapshot", payload: { windowId: "browser-window-1" } },
      { command: "find", payload: { text: "x".repeat(100_000) } },
      { command: "setZoom", payload: { factor: 50 } },
    ]) {
      await expect(fixture.invoke(event, request), JSON.stringify(request)).rejects.toThrow();
    }
  });

  it("rejects callers without an owning chrome window", async () => {
    const fixture = createFixture();
    await expect(
      fixture.invoke({ sender: {} }, { command: "getSnapshot", payload: {} }),
    ).rejects.toThrow(/owning browser chrome/i);
  });

  it("publishes only frozen snapshots and cleans up destroyed subscribers", () => {
    const fixture = createFixture();
    const alive = { isDestroyed: vi.fn(() => false), send: vi.fn() };
    const destroyed = { isDestroyed: vi.fn(() => true), send: vi.fn() };
    fixture.controllers.set(alive, createController());
    fixture.ipc.subscribe(alive);
    fixture.ipc.subscribe(destroyed);

    const snapshot = Object.freeze({ windows: Object.freeze([]) });
    fixture.ipc.publish(snapshot);
    fixture.ipc.publish(snapshot);

    expect(alive.send).toHaveBeenCalledWith(BROWSER_SNAPSHOT_CHANNEL, snapshot);
    expect(alive.send).toHaveBeenCalledTimes(2);
    expect(destroyed.send).not.toHaveBeenCalled();
    expect(fixture.ipc.unsubscribe(alive)).toBe(true);
    expect(fixture.ipc.unsubscribe(alive)).toBe(false);
  });

  it("projects the owning window identity into each subscription", () => {
    const fixture = createFixture();
    const first = { isDestroyed: vi.fn(() => false), send: vi.fn() };
    const second = { isDestroyed: vi.fn(() => false), send: vi.fn() };
    const firstController = createController();
    const secondController = createController();
    (firstController as Record<string, unknown>).currentWindowId = "browser-window-1";
    (secondController as Record<string, unknown>).currentWindowId = "browser-window-2";
    fixture.controllers.set(first, firstController);
    fixture.controllers.set(second, secondController);
    fixture.ipc.subscribe(first);
    fixture.ipc.subscribe(second);

    fixture.ipc.publish(Object.freeze({ windows: Object.freeze([]) }));

    expect(first.send).toHaveBeenCalledWith(
      BROWSER_SNAPSHOT_CHANNEL,
      expect.objectContaining({
        currentWindowId: "browser-window-1",
        pendingApprovals: [{ approvalId: "approval-browser-window-1" }],
      }),
    );
    expect(second.send).toHaveBeenCalledWith(
      BROWSER_SNAPSHOT_CHANNEL,
      expect.objectContaining({ currentWindowId: "browser-window-2" }),
    );
  });

  it("publishes a fresh snapshot after chrome state mutations", async () => {
    const fixture = createFixture();
    const sender = { isDestroyed: vi.fn(() => false), send: vi.fn() };
    const controller = createController();
    (controller as Record<string, unknown>).currentWindowId = "browser-window-1";
    controller.getSnapshot.mockResolvedValue({ windows: [] });
    fixture.controllers.set(sender, controller);
    fixture.ipc.subscribe(sender);

    await fixture.invoke(
      { sender },
      { command: "bookmark", payload: { tabId: "browser-tab-1" } },
    );

    expect(sender.send).toHaveBeenCalledWith(
      BROWSER_SNAPSHOT_CHANNEL,
      expect.objectContaining({ currentWindowId: "browser-window-1", windows: [] }),
    );
  });

  it("registers and disposes the fixed command channel", () => {
    const fixture = createFixture();
    expect(fixture.ipcMain.handle).toHaveBeenCalledWith(BROWSER_COMMAND_CHANNEL, expect.any(Function));
    fixture.ipc.dispose();
    expect(fixture.ipcMain.removeHandler).toHaveBeenCalledWith(BROWSER_COMMAND_CHANNEL);
  });
});

function createFixture() {
  const handlers = new Map<string, (event: unknown, request: unknown) => Promise<unknown>>();
  const ipcMain = {
    handle: vi.fn((channel: string, handler: (event: unknown, request: unknown) => Promise<unknown>) => {
      handlers.set(channel, handler);
    }),
    removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
  };
  const controllers = new Map<object, ReturnType<typeof createController>>();
  const getController = vi.fn((sender: object) => controllers.get(sender) ?? null);
  const approvalAuthority = {
    resolve: vi.fn(async () => ({ allowed: true })),
    snapshot: vi.fn(({ windowId }: { windowId: string }) => ({
      pendingApprovals: [{ approvalId: `approval-${windowId}` }],
    })),
    subscribe: vi.fn(() => vi.fn()),
  };
  const windowAuthority = {
    closeWindow: vi.fn(async () => true),
    createTabInWindow: vi.fn(async () => true),
    createWindow: vi.fn(async () => true),
    focusWindow: vi.fn(async () => true),
  };
  const ipc = createBrowserIpc({ approvalAuthority, getControllerForWebContents: getController, ipcMain, windowAuthority });
  ipc.register();
  return {
    approvalAuthority,
    controllers,
    getController,
    ipc,
    ipcMain,
    windowAuthority,
    invoke: (event: unknown, request: unknown) => handlers.get(BROWSER_COMMAND_CHANNEL)!(event, request),
  };
}

function createController() {
  const controller: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const command of BROWSER_CHROME_COMMANDS.filter((item: string) => item !== "subscribe")) {
    controller[command] = vi.fn(async (payload: unknown) => ({ command, payload }));
  }
  return controller;
}
