/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { WORKFLOW_COMMAND_CHANNEL, createWorkflowIpc } = require("../../../../electron/workflows/workflow-ipc.cjs");

function fixture() {
  const handlers = new Map<string, (...args: any[]) => any>();
  const listeners = new Map<string, (...args: any[]) => any>();
  let runtimeListener: ((event: unknown) => void) | null = null;
  const runtime = {
    start: vi.fn(async ({ ownerId }: { ownerId: string }) => ({ runId: "run-1", ownerId })),
    getState: vi.fn((runId: string, ownerId: string) => ({ runId, ownerId })),
    cancel: vi.fn((runId: string, ownerId: string) => ({ runId, ownerId, status: "cancelled" })),
    disconnect: vi.fn(),
    subscribe: vi.fn((_ownerId: string, next: (event: unknown) => void) => { runtimeListener = next; return vi.fn(); }),
  };
  const ipcMain = {
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => handlers.set(channel, handler)),
    removeHandler: vi.fn(),
    on: vi.fn((channel: string, handler: (...args: any[]) => any) => listeners.set(channel, handler)),
  };
  const ipc = createWorkflowIpc({ ipcMain, runtime, resolveCallerKind: () => "notes" });
  ipc.register();
  const sender = Object.assign(new EventEmitter(), { id: 7, isDestroyed: () => false, send: vi.fn() });
  return { handlers, listeners, runtime, runtimeListener: () => runtimeListener, sender };
}

describe("workflow IPC", () => {
  it("binds start/state/cancel to the trusted sender owner and rejects spoof keys", async () => {
    const value = fixture();
    const handle = value.handlers.get(WORKFLOW_COMMAND_CHANNEL)!;
    await expect(handle({ sender: value.sender }, {
      command: "start",
      payload: { request: { source: "x", target: { windowId: "w", tabId: "t" } }, ownerId: "spoof" },
    })).rejects.toThrow(/Unknown workflow IPC key/u);
    await handle({ sender: value.sender }, { command: "start", payload: { request: { source: "x" } } });
    expect(value.runtime.start).toHaveBeenCalledWith({ ownerId: "notes:7", request: { source: "x" } });
    await handle({ sender: value.sender }, { command: "cancel", payload: { runId: "run-1" } });
    expect(value.runtime.cancel).toHaveBeenCalledWith("run-1", "notes:7");
  });

  it("subscribes once, forwards owned events, and disconnects on navigation", () => {
    const value = fixture();
    value.listeners.get(`${WORKFLOW_COMMAND_CHANNEL}:subscribe`)?.({ sender: value.sender });
    value.runtimeListener()?.({ type: "step_started", runId: "run-1" });
    expect(value.sender.send).toHaveBeenCalledWith("auris-workflow:event", { type: "step_started", runId: "run-1" });
    value.sender.emit("did-navigate");
    expect(value.runtime.disconnect).toHaveBeenCalledWith("notes:7");
  });

  it("routes library and family-discriminated commands through the shared facade", async () => {
    const value = fixture();
    const request = vi.fn(async (input) => input);
    Object.assign(value.runtime, { request });
    const handle = value.handlers.get(WORKFLOW_COMMAND_CHANNEL)!;
    await handle({ sender: value.sender }, { command: "list", payload: {} });
    await handle({ sender: value.sender }, {
      command: "validate",
      payload: { family: "nia_yaml", source: "name: demo" },
    });
    expect(request).toHaveBeenNthCalledWith(1, { ownerId: "notes:7", action: "list" });
    expect(request).toHaveBeenNthCalledWith(2, {
      ownerId: "notes:7",
      action: "validate",
      family: "nia_yaml",
      source: "name: demo",
    });
  });
});
