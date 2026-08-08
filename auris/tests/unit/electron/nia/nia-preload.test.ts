import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const niaIpc = require("../../../../electron/nia/nia-ipc.cjs");
const workflowIpc = require("../../../../electron/workflows/workflow-ipc.cjs");
const browserStatusIpc = require("../../../../electron/browser/browser-status-ipc.cjs");
const notesRecoveryIpc = require("../../../../electron/notes/notes-recovery-ipc.cjs");

type NiaPreload = {
  invoke(command: string, payload?: Record<string, unknown>): Promise<unknown>;
  subscribe(listener: (event: unknown) => void): boolean;
  unsubscribe(listener: (event: unknown) => void): boolean;
};

function loadMainPreload() {
  const exposed: Record<string, { nia?: NiaPreload }> = {};
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const invoke = vi.fn(async () => true);
  const ipcRenderer = {
    invoke,
    on: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
      const set = listeners.get(channel) ?? new Set();
      set.add(listener);
      listeners.set(channel, set);
    }),
    removeListener: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
      listeners.get(channel)?.delete(listener);
    }),
  };
  const source = readFileSync(resolve(process.cwd(), "electron/preload.cjs"), "utf8");
  runInNewContext(source, {
    Map,
    Object,
    Promise,
    Set,
    TypeError,
    clearTimeout,
    require: (id: string) => {
      if (id === "electron") {
        return {
          contextBridge: {
            exposeInMainWorld: (name: string, value: { nia?: NiaPreload }) => {
              exposed[name] = value;
            },
          },
          ipcRenderer,
        };
      }
      if (String(id).includes("nia-ipc")) return niaIpc;
      if (String(id).includes("workflow-ipc")) return workflowIpc;
      if (String(id).includes("browser-status-ipc")) return browserStatusIpc;
      if (String(id).includes("notes-recovery-ipc")) return notesRecoveryIpc;
      throw new Error(`Unexpected require: ${id}`);
    },
    setTimeout,
  });
  return { api: exposed.shadowingDesktop!.nia!, invoke, listeners };
}

describe("main Notes preload Nia bridge", () => {
  it("allows only fixed commands and performs one subscription handshake", async () => {
    const fixture = loadMainPreload();
    await fixture.api.invoke("start", { prompt: "hello" });
    expect(fixture.invoke).toHaveBeenCalledWith(niaIpc.NIA_COMMAND_CHANNEL, {
      command: "start",
      payload: { prompt: "hello" },
    });
    await expect(fixture.api.invoke("subscribe")).rejects.toThrow(/Unsupported Nia/u);

    const listener = vi.fn();
    expect(fixture.api.subscribe(listener)).toBe(true);
    expect(fixture.api.subscribe(listener)).toBe(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(fixture.invoke).toHaveBeenCalledWith(niaIpc.NIA_COMMAND_CHANNEL, {
      command: "subscribe",
      payload: {},
    });

    const wrapper = [...fixture.listeners.get(niaIpc.NIA_EVENT_CHANNEL)!][0]!;
    wrapper({}, { type: "delta", runId: "r", text: "x" });
    expect(listener).toHaveBeenCalledWith({ type: "delta", runId: "r", text: "x" });
    expect(fixture.api.unsubscribe(listener)).toBe(true);
  });
});
