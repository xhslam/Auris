import { EventEmitter } from "node:events";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const source = fs.readFileSync(require.resolve("../../../electron/terminal-remote-session-manager.cjs"), "utf8");
const protocol = require("../../../electron/terminal-daemon-protocol.cjs");
type Request = { id: string; type: string };
type Manager = {
  connect(): Promise<void>;
  ensureConnected(): Promise<void>;
  createSession(input: object): Promise<unknown>;
  resumeSession(input: object): Promise<unknown>;
  fetchSessions(): Promise<unknown>;
  upgradeDaemonNow(): Promise<void>;
  getDaemonStatus(): { connected: boolean };
  dispose(): void;
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
function observe<T>(promise: Promise<T>) {
  const state: { settled: boolean; error?: Error; value?: T } = { settled: false };
  const done = promise.then(value => { state.value = value; state.settled = true; }, error => { state.error = error; state.settled = true; });
  return { state, done };
}
class Socket extends EventEmitter {
  destroyed = false;
  requests: Request[] = [];
  blocked = new Set<string>();
  compatible = true;
  autoConnect = true;
  write(frame: string, _encoding: string, callback?: (error?: Error) => void) {
    void _encoding;
    const request = JSON.parse(frame) as Request;
    this.requests.push(request);
    callback?.();
    if (!this.blocked.has(request.type)) Promise.resolve().then(() => this.reply(request));
  }
  reply(request: Request, error?: string) {
    const result = request.type === "hello" ? {
      compatible: this.compatible, protocolVersion: this.compatible ? 1 : 99,
      appVersion: "test", activeSessionsCount: 0, waitingSessionsCount: 0,
    } : request.type === "list" ? [] : request.type === "resume" ? { session: { id: "resumed" } } : { id: "created" };
    this.emit("data", JSON.stringify({ id: request.id, ok: !error, error, result }) + "\n");
  }
  replyType(type: string, error?: string) {
    const request = [...this.requests].reverse().find(request => request.type === type);
    if (!request) throw new Error(`No ${type} request`);
    this.reply(request, error);
  }
  destroy() { this.destroyed = true; } // Close is deliberately delivered separately.
}
const managers: Manager[] = [];
function harness(configure: (socket: Socket, index: number) => void = () => {}) {
  const sockets: Socket[] = [];
  const launch = vi.fn((): Promise<{ socketPath: string }> => Promise.resolve({ socketPath: "fake" }));
  const connect = vi.fn(() => {
    const socket = new Socket();
    configure(socket, sockets.length);
    sockets.push(socket);
    if (socket.autoConnect) Promise.resolve().then(() => socket.emit("connect"));
    return socket;
  });
  const moduleStub = { exports: {} as { createRemoteTerminalSessionManager(options: object): Manager } };
  vm.runInNewContext(source, {
    module: moduleStub, process: { pid: 123 }, setTimeout, clearTimeout,
    require(id: string) {
      if (id === "node:net") return { connect };
      if (id === "node:events") return { EventEmitter };
      if (id === "./terminal-daemon-launcher.cjs") return { ensureDaemonRunning: launch };
      if (id === "./terminal-daemon-paths.cjs") return { resolveTerminalDaemonPaths: () => ({}) };
      if (id === "./terminal-daemon-protocol.cjs") return protocol;
      throw new Error(`Unexpected require: ${id}`);
    },
  });
  const manager = moduleStub.exports.createRemoteTerminalSessionManager({ paths: {} });
  managers.push(manager);
  return { manager, launch, connect, sockets };
}
// Drain promise continuations without advancing a connection timeout or sleeping.
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => vi.useFakeTimers());
afterEach(() => { managers.splice(0).forEach(manager => manager.dispose()); vi.clearAllTimers(); vi.useRealTimers(); });

describe("remote terminal connection coordination", () => {
  it("shares launcher startup across concurrent connect, create, resume and fetch calls", async () => {
    const { manager, launch, sockets } = harness();
    const gate = deferred<{ socketPath: string }>();
    launch.mockImplementation(() => gate.promise);
    const pending = [manager.connect(), manager.ensureConnected(), manager.createSession({}), manager.resumeSession({ sessionId: "saved" }), manager.fetchSessions()].map(observe);
    await flush();
    expect(pending.map(item => item.state.settled)).toEqual([false, false, false, false, false]);
    gate.resolve({ socketPath: "fake" });
    await flush();
    await Promise.all(pending.map(item => item.done));
    expect(pending.every(item => !item.state.error)).toBe(true);
    expect(launch).toHaveBeenCalledTimes(1);
    expect(sockets).toHaveLength(1);
    expect(sockets[0].requests.filter(request => request.type === "hello")).toHaveLength(1);
    expect(manager.getDaemonStatus().connected).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("waits for both hello and initial list even after the socket connects", async () => {
    const { manager, sockets } = harness(socket => { socket.blocked.add("hello"); socket.blocked.add("list"); });
    const initial = observe(manager.connect());
    await flush();
    const ready = observe(manager.ensureConnected());
    const created = observe(manager.createSession({}));
    await flush();
    expect(ready.state.settled).toBe(false);
    expect(created.state.settled).toBe(false);
    sockets[0].replyType("hello");
    await flush();
    expect(manager.getDaemonStatus().connected).toBe(false);
    expect(sockets[0].requests.map(request => request.type)).toEqual(["hello", "list"]);
    expect(ready.state.settled).toBe(false);
    sockets[0].blocked.delete("list");
    sockets[0].replyType("list");
    await flush();
    await Promise.all([initial.done, ready.done, created.done]);
    expect(created.state.error).toBeUndefined();
    expect(manager.getDaemonStatus().connected).toBe(true);
  });

  it("propagates a startup failure to all waiters and allows a later retry", async () => {
    const { manager, launch } = harness();
    const gate = deferred<{ socketPath: string }>();
    launch.mockImplementationOnce(() => gate.promise);
    const pending = [manager.connect(), manager.ensureConnected(), manager.createSession({})].map(observe);
    const error = new Error("launcher failed");
    gate.reject(error);
    await flush();
    await Promise.all(pending.map(item => item.done));
    expect(pending.map(item => item.state.error)).toEqual([error, error, error]);
    await manager.connect();
    expect(launch).toHaveBeenCalledTimes(2);
    expect(manager.getDaemonStatus().connected).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans up a failed handshake and retries using a new socket", async () => {
    const { manager, sockets } = harness((socket, index) => { if (!index) socket.blocked.add("hello"); });
    const pending = [manager.connect(), manager.createSession({})].map(observe);
    await flush();
    sockets[0].replyType("hello", "hello denied");
    await flush();
    await Promise.all(pending.map(item => item.done));
    expect(pending.every(item => item.state.error?.message === "hello denied")).toBe(true);
    expect(sockets[0].destroyed).toBe(true);
    await manager.connect();
    expect(sockets).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reconnects after one incompatible empty daemon without waiting on itself", async () => {
    const { manager, launch, sockets } = harness((socket, index) => { socket.compatible = index !== 0; });
    const pending = [manager.connect(), manager.ensureConnected(), manager.createSession({})].map(observe);
    await flush();
    expect(pending.every(item => item.state.settled && !item.state.error)).toBe(true);
    expect(launch).toHaveBeenCalledTimes(2);
    expect(sockets[0].destroyed).toBe(true);
    expect(sockets[0].requests.map(request => request.type)).toEqual(["hello", "shutdown"]);
    expect(manager.getDaemonStatus().connected).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds repeated incompatible upgrades instead of spawning forever", async () => {
    const { manager, launch } = harness((socket, index) => { socket.compatible = index >= 3; });
    const pending = observe(manager.connect());
    await flush();
    expect(pending.state.error?.message).toMatch(/incompatible|upgrade/i);
    expect(launch).toHaveBeenCalledTimes(2);
    expect(manager.getDaemonStatus().connected).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores an old socket close and data while new requests are pending", async () => {
    const { manager, sockets, launch } = harness();
    await manager.connect();
    const old = sockets[0];
    await manager.upgradeDaemonNow();
    sockets[1].blocked.add("create");
    const created = observe(manager.createSession({}));
    await flush();
    const request = [...sockets[1].requests].reverse().find(request => request.type === "create")!;
    old.emit("data", JSON.stringify({ id: request.id, ok: true, result: { id: "stale" } }) + "\n");
    old.emit("close");
    await flush();
    expect(created.state.settled).toBe(false);
    expect(manager.getDaemonStatus().connected).toBe(true);
    sockets[1].replyType("create");
    await created.done;
    expect(created.state.value).toEqual({ id: "created" });
    await vi.advanceTimersByTimeAsync(1500);
    expect(launch).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not duplicate a connection when connect is called while already ready", async () => {
    const { manager, sockets, launch } = harness();
    await manager.connect();
    await Promise.all([manager.connect(), manager.connect()]);
    expect(launch).toHaveBeenCalledTimes(1);
    expect(sockets).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels a startup waiter on dispose and never opens a late socket", async () => {
    const { manager, launch, connect } = harness();
    const gate = deferred<{ socketPath: string }>();
    launch.mockImplementation(() => gate.promise);
    const pending = observe(manager.connect());
    await flush();
    manager.dispose();
    await flush();
    expect(pending.state.error?.message).toMatch(/disposed/i);
    gate.resolve({ socketPath: "fake" });
    await flush();
    expect(connect).not.toHaveBeenCalled();
    const later = observe(manager.createSession({}));
    await flush();
    expect(later.state.error?.message).toMatch(/disposed/i);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects pending requests and clears their timers on dispose", async () => {
    const { manager, sockets } = harness();
    await manager.connect();
    sockets[0].blocked.add("create");
    const pending = observe(manager.createSession({}));
    await flush();
    expect(vi.getTimerCount()).toBe(1);
    manager.dispose();
    await flush();
    expect(pending.state.error?.message).toMatch(/disposed/i);
    expect(manager.getDaemonStatus().connected).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    sockets[0].emit("close");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels the reconnect timer when explicitly reconnecting or disposing", async () => {
    const { manager, sockets, launch } = harness();
    await manager.connect();
    sockets[0].destroy(); sockets[0].emit("close");
    expect(vi.getTimerCount()).toBe(1);
    await manager.connect();
    expect(vi.getTimerCount()).toBe(0);
    sockets[1].destroy(); sockets[1].emit("close");
    manager.dispose();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1500);
    expect(launch).toHaveBeenCalledTimes(2);
  });
});

describe("remote terminal disposal boundaries", () => {
  it("rejects cleanly when disposed before the connection microtask begins", async () => {
    const { manager, connect } = harness();
    const pending = observe(manager.connect());
    manager.dispose();
    await flush();
    expect(pending.state.error?.message).toMatch(/disposed/i);
    expect(connect).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels a socket that has not emitted connect yet", async () => {
    const { manager, sockets } = harness(socket => { socket.autoConnect = false; });
    const pending = observe(manager.connect());
    await flush();
    expect(sockets).toHaveLength(1);
    manager.dispose();
    await flush();
    expect(pending.state.error?.message).toMatch(/disposed/i);
    expect(sockets[0].destroyed).toBe(true);
    sockets[0].emit("connect"); sockets[0].emit("close");
    expect(sockets[0].requests).toHaveLength(0);
    expect(sockets[0].listenerCount("connect")).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["hello", "list"])("cancels a pending %s and prevents late initialization", async type => {
    const { manager, sockets } = harness(socket => { socket.blocked.add(type); });
    const pending = observe(manager.connect());
    await flush();
    expect(vi.getTimerCount()).toBe(1);
    manager.dispose();
    await flush();
    expect(pending.state.error?.message).toMatch(/disposed/i);
    sockets[0].replyType(type);
    await flush();
    expect(manager.getDaemonStatus().connected).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("remote terminal reconnect ownership", () => {
  it("cleans up a socket-connect error and can retry", async () => {
    const { manager, sockets } = harness((socket, index) => { if (!index) socket.autoConnect = false; });
    const pending = observe(manager.connect());
    await flush();
    sockets[0].emit("error", new Error("pipe refused"));
    await flush();
    expect(pending.state.error?.message).toBe("pipe refused");
    expect(sockets[0].destroyed).toBe(true);
    expect(sockets[0].listenerCount("connect")).toBe(0);
    await manager.connect();
    expect(manager.getDaemonStatus().connected).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects only the closed socket's requests and schedules one reconnect", async () => {
    const { manager, sockets, launch } = harness();
    await manager.connect();
    sockets[0].blocked.add("create");
    const pending = observe(manager.createSession({}));
    await flush();
    sockets[0].destroy(); sockets[0].emit("close"); sockets[0].emit("close");
    await flush();
    expect(pending.state.error?.message).toBe("Daemon socket disconnected");
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1500);
    expect(launch).toHaveBeenCalledTimes(2);
    expect(manager.getDaemonStatus().connected).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("coalesces concurrent explicit upgrades without a duplicate shutdown or connection", async () => {
    const { manager, sockets, launch } = harness();
    await manager.connect();
    await Promise.all([manager.upgradeDaemonNow(), manager.upgradeDaemonNow()]);
    expect(sockets[0].requests.filter(request => request.type === "shutdown")).toHaveLength(1);
    expect(launch).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
