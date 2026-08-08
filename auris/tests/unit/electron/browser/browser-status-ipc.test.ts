import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  BROWSER_STATUS_COMMAND_CHANNEL,
  BROWSER_STATUS_EVENT_CHANNEL,
  createBrowserStatusIpc,
} = require("../../../../electron/browser/browser-status-ipc.cjs");
const { createBrowserLeaseManager } = require("../../../../electron/browser/browser-lease.cjs");

function fixture() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const ipcMain = {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler)),
    removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
  };
  let statusListener: ((snapshot: unknown) => void) | null = null;
  const snapshot = Object.freeze({ appWindows: [], pendingApprovalCount: 0, revision: 1, windows: [] });
  const statusService = {
    getSnapshot: vi.fn(() => snapshot),
    subscribe: vi.fn((listener: (value: unknown) => void) => { statusListener = listener; return vi.fn(); }),
  };
  const focusBrowserWindow = vi.fn(() => true);
  const focusBrowserTab = vi.fn(async () => true);
  const requireTrustedMainEvent = vi.fn();
  const ipc = createBrowserStatusIpc({ focusBrowserTab, focusBrowserWindow, ipcMain, requireTrustedMainEvent, statusService });
  ipc.register();
  return { focusBrowserTab, focusBrowserWindow, handlers, ipc, requireTrustedMainEvent, snapshot, statusListener: () => statusListener };
}

function sender() {
  const value = new EventEmitter() as EventEmitter & { send: ReturnType<typeof vi.fn>; isDestroyed: () => boolean };
  value.send = vi.fn();
  value.isDestroyed = () => false;
  return value;
}

describe("browser status IPC", () => {
  it("gets/subscribes and focuses only through the trusted main renderer", async () => {
    const test = fixture();
    const handle = test.handlers.get(BROWSER_STATUS_COMMAND_CHANNEL)!;
    const webContents = sender();
    const event = { sender: webContents };
    await expect(handle(event, { command: "getBrowserStatus" })).resolves.toBe(test.snapshot);
    await expect(handle(event, { command: "focusBrowserWindow", windowId: "window-1" })).resolves.toBe(true);
    await expect(handle(event, { command: "focusBrowserTab", windowId: "window-1", tabId: "tab-1" })).resolves.toBe(true);
    expect(test.focusBrowserWindow).toHaveBeenCalledWith("window-1");
    expect(test.focusBrowserTab).toHaveBeenCalledWith("window-1", "tab-1");
    await expect(handle(event, { command: "subscribe" })).resolves.toBe(true);
    test.statusListener()?.(test.snapshot);
    expect(webContents.send).toHaveBeenCalledWith(BROWSER_STATUS_EVENT_CHANNEL, test.snapshot);
    await expect(handle(event, { command: "unsubscribe" })).resolves.toBe(true);
    expect(test.requireTrustedMainEvent).toHaveBeenCalledTimes(5);
    expect(test.ipc.dispose()).toBe(true);
  });

  it("does not create or transfer authority while focusing", async () => {
    const leases = createBrowserLeaseManager({ randomBytes: () => Buffer.alloc(32, 7) });
    leases.acquire({ connectionId: "owner-one", controlEpoch: 0, navigationGeneration: 0, windowId: "window-1", tabId: "tab-1" });
    const before = leases.snapshot();
    const test = fixture();
    const handle = test.handlers.get(BROWSER_STATUS_COMMAND_CHANNEL)!;
    await handle({ sender: sender() }, { command: "focusBrowserWindow", windowId: "window-2" });
    await handle({ sender: sender() }, { command: "focusBrowserTab", windowId: "window-2", tabId: "tab-2" });
    expect(leases.snapshot()).toEqual(before);
  });

  it("rejects untrusted callers and malformed IDs", async () => {
    const test = fixture();
    test.requireTrustedMainEvent.mockImplementation(() => { throw new Error("untrusted"); });
    const handle = test.handlers.get(BROWSER_STATUS_COMMAND_CHANNEL)!;
    await expect(handle({ sender: sender() }, { command: "getBrowserStatus" })).rejects.toThrow("untrusted");
    test.requireTrustedMainEvent.mockImplementation(() => undefined);
    await expect(handle({ sender: sender() }, { command: "focusBrowserWindow", windowId: "../bad" })).rejects.toThrow(/Invalid/u);
  });
});
