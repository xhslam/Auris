import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const browserIpc = require("../../../../electron/browser/browser-ipc.cjs");
const niaIpc = require("../../../../electron/nia/nia-ipc.cjs");
const workflowIpc = require("../../../../electron/workflows/workflow-ipc.cjs");

type PreloadApi = {
  invoke(command: string, payload?: Record<string, unknown>): Promise<unknown>;
  subscribe(listener: (...args: unknown[]) => void): boolean;
  unsubscribe(listener: (...args: unknown[]) => void): boolean;
};

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function loadPreload(invoke: ReturnType<typeof vi.fn>) {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const ipcRenderer = {
    invoke,
    on: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
      const current = listeners.get(channel) ?? new Set();
      current.add(listener);
      listeners.set(channel, current);
    }),
    removeListener: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
      listeners.get(channel)?.delete(listener);
    }),
  };
  const exposed: Record<string, PreloadApi> = {};
  const source = readFileSync(resolve(process.cwd(), "electron/browser/browser-preload.cjs"), "utf8");
  runInNewContext(source, {
    Map,
    Object,
    Promise,
    Set,
    TypeError,
    clearTimeout,
    console,
    require: (id: string) => {
      if (id === "electron") {
        return {
          contextBridge: {
            exposeInMainWorld: (name: string, value: PreloadApi) => {
              exposed[name] = value;
            },
          },
          ipcRenderer,
        };
      }
      if (String(id).includes("browser-ipc")) return browserIpc;
      if (String(id).includes("nia-ipc")) return niaIpc;
      if (String(id).includes("workflow-ipc")) return workflowIpc;
      throw new Error(`Unexpected preload require: ${id}`);
    },
    setTimeout,
  });
  return { api: exposed.aurisBrowser!, niaApi: exposed.aurisNia!, invoke };
}

function commandCalls(invoke: ReturnType<typeof vi.fn>) {
  return invoke.mock.calls.map((call) => call[1]?.command);
}

describe("browser preload subscription handshake", () => {
  afterEach(() => vi.useRealTimers());

  it("registers main delivery for the first renderer listener and unregisters after the last", async () => {
    const fixture = loadPreload(vi.fn(async () => true));
    const first = vi.fn();
    const second = vi.fn();
    expect(fixture.api.subscribe(first)).toBe(true);
    expect(fixture.api.subscribe(second)).toBe(true);
    await flushMicrotasks();
    expect(commandCalls(fixture.invoke)).toEqual(["subscribe"]);

    expect(fixture.api.unsubscribe(first)).toBe(true);
    await flushMicrotasks();
    expect(commandCalls(fixture.invoke)).toEqual(["subscribe"]);
    expect(fixture.api.unsubscribe(second)).toBe(true);
    await flushMicrotasks();
    expect(commandCalls(fixture.invoke)).toEqual(["subscribe", "unsubscribe"]);
  });

  it("retries a rejected subscribe with a bounded timer and cancels retry when no longer desired", async () => {
    vi.useFakeTimers();
    const invoke = vi.fn()
      .mockRejectedValueOnce(new Error("subscribe failed"))
      .mockRejectedValueOnce(new Error("subscribe still failed"))
      .mockResolvedValue(true);
    const fixture = loadPreload(invoke);
    const listener = vi.fn();
    fixture.api.subscribe(listener);
    await flushMicrotasks();
    expect(commandCalls(invoke)).toEqual(["subscribe"]);
    await vi.advanceTimersByTimeAsync(249);
    expect(commandCalls(invoke)).toEqual(["subscribe"]);
    await vi.advanceTimersByTimeAsync(1);
    await flushMicrotasks();
    expect(commandCalls(invoke)).toEqual(["subscribe", "subscribe"]);
    await vi.advanceTimersByTimeAsync(499);
    expect(commandCalls(invoke)).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    await flushMicrotasks();
    expect(commandCalls(invoke)).toEqual(["subscribe", "subscribe", "subscribe"]);

    const cancellingInvoke = vi.fn().mockRejectedValue(new Error("offline"));
    const cancelling = loadPreload(cancellingInvoke);
    const cancelledListener = vi.fn();
    cancelling.api.subscribe(cancelledListener);
    await flushMicrotasks();
    cancelling.api.unsubscribe(cancelledListener);
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(commandCalls(cancellingInvoke)).toEqual(["subscribe"]);
  });

  it("serializes rapid unsubscribe and remount transitions", async () => {
    const resolvers: Array<() => void> = [];
    const invoke = vi.fn(() => new Promise<boolean>((resolvePromise) => {
      resolvers.push(() => resolvePromise(true));
    }));
    const fixture = loadPreload(invoke);
    const first = vi.fn();
    const second = vi.fn();

    fixture.api.subscribe(first);
    await flushMicrotasks();
    fixture.api.unsubscribe(first);
    expect(commandCalls(invoke)).toEqual(["subscribe"]);
    resolvers.shift()?.();
    await flushMicrotasks();
    expect(commandCalls(invoke)).toEqual(["subscribe", "unsubscribe"]);

    fixture.api.subscribe(second);
    resolvers.shift()?.();
    await vi.waitFor(() => expect(commandCalls(invoke)).toEqual([
      "subscribe",
      "unsubscribe",
      "subscribe",
    ]));
    resolvers.shift()?.();
    await flushMicrotasks();
    expect(commandCalls(invoke)).toEqual(["subscribe", "unsubscribe", "subscribe"]);
  });

  it("retries a rejected unsubscribe without a busy loop", async () => {
    vi.useFakeTimers();
    const invoke = vi.fn()
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error("unsubscribe failed"))
      .mockResolvedValueOnce(true);
    const fixture = loadPreload(invoke);
    const listener = vi.fn();
    fixture.api.subscribe(listener);
    await flushMicrotasks();
    fixture.api.unsubscribe(listener);
    await flushMicrotasks();
    expect(commandCalls(invoke)).toEqual(["subscribe", "unsubscribe"]);
    await vi.advanceTimersByTimeAsync(249);
    expect(commandCalls(invoke)).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    await flushMicrotasks();
    expect(commandCalls(invoke)).toEqual(["subscribe", "unsubscribe", "unsubscribe"]);
  });

  it("exposes an independent allowlisted Nia bridge and subscription handshake", async () => {
    const fixture = loadPreload(vi.fn(async () => true));
    await fixture.niaApi.invoke("start", { prompt: "hello" });
    expect(fixture.invoke).toHaveBeenCalledWith(niaIpc.NIA_COMMAND_CHANNEL, {
      command: "start",
      payload: { prompt: "hello" },
    });
    await expect(fixture.niaApi.invoke("subscribe")).rejects.toThrow(/Unsupported Nia/u);

    const listener = vi.fn();
    expect(fixture.niaApi.subscribe(listener)).toBe(true);
    await flushMicrotasks();
    expect(fixture.invoke).toHaveBeenCalledWith(niaIpc.NIA_COMMAND_CHANNEL, {
      command: "subscribe",
      payload: {},
    });
    expect(fixture.niaApi.unsubscribe(listener)).toBe(true);
    await flushMicrotasks();
    expect(fixture.invoke).toHaveBeenCalledWith(niaIpc.NIA_COMMAND_CHANNEL, {
      command: "unsubscribe",
      payload: {},
    });
  });
});
