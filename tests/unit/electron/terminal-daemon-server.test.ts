import { createRequire } from "node:module";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

const { createTerminalDaemonServer } = require("../../../electron/terminal-daemon/server.cjs");
const { resolveTerminalDaemonPaths } = require("../../../electron/terminal-daemon-paths.cjs");
const { formatNdjson, createNdjsonParser } = require("../../../electron/terminal-daemon-protocol.cjs");

type SessionRecord = { id: string };
type RequestResults = {
  hello: {
    protocolVersion: number;
    compatible: boolean;
    daemonPid: number;
    activeSessionsCount: number;
  };
  create: SessionRecord;
  write: boolean;
  resume: { session: SessionRecord; replayedData: string };
  list: SessionRecord[];
  kill: boolean;
  shutdown: { shuttingDown: boolean; runningCount: number };
};
type ServerMessage = {
  id?: string;
  ok?: boolean;
  result?: unknown;
  error?: string;
  type?: string;
};
type ClientEvent = ServerMessage & { type: "event" };

describe("terminal-daemon-server", () => {
  let tempHome: string;
  let serverInstance: ReturnType<typeof createTerminalDaemonServer> | null = null;
  let paths: ReturnType<typeof resolveTerminalDaemonPaths>;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join("/tmp", "auris-d-"));
    paths = resolveTerminalDaemonPaths({
      home: tempHome,
      channel: "dev",
    });
  });

  afterEach(async () => {
    if (serverInstance) {
      await serverInstance.stop();
      serverInstance = null;
    }
    try {
      fs.rmSync(tempHome, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  function connectClient(socketPath: string) {
    return new Promise<{
      socket: net.Socket;
      send: <K extends keyof RequestResults>(req: { type: K } & Record<string, unknown>) => Promise<RequestResults[K]>;
      onEvent: (fn: (event: ClientEvent) => void) => void;
      close: () => void;
    }>((resolve, reject) => {
      const socket = net.connect(socketPath);
      let nextId = 1;
      const pending = new Map<string, { resolve: (res: unknown) => void; reject: (err: Error) => void }>();
      const eventListeners: Array<(event: ClientEvent) => void> = [];

      const parser = createNdjsonParser((msg: ServerMessage) => {
        if (msg.id && pending.has(msg.id)) {
          const p = pending.get(msg.id)!;
          pending.delete(msg.id);
          if (msg.ok) p.resolve(msg.result);
          else p.reject(new Error(msg.error));
        } else if (msg.type === "event") {
          eventListeners.forEach((l) => l(msg as ClientEvent));
        }
      });

      socket.on("data", (chunk) => parser.feed(chunk));
      socket.once("error", reject);
      socket.once("connect", () => {
        resolve({
          socket,
          send: <K extends keyof RequestResults>(req: { type: K } & Record<string, unknown>) => {
            const id = `req-${nextId++}`;
            return new Promise<RequestResults[K]>((res, rej) => {
              pending.set(id, { resolve: (result) => res(result as RequestResults[K]), reject: rej });
              socket.write(formatNdjson({ id, ...req }));
            });
          },
          onEvent: (fn) => eventListeners.push(fn),
          close: () => socket.destroy(),
        });
      });
    });
  }

  it("starts daemon and sets 0600 on socket files", async () => {
    serverInstance = createTerminalDaemonServer({
      paths,
      sessionManagerOptions: {
        ptyBackend: null, // use pipe for predictable testing
      },
    });

    await serverInstance.start();

    expect(fs.existsSync(paths.daemonSocketPath)).toBe(true);
    expect(fs.existsSync(paths.agentSocketPath)).toBe(true);

    if (process.platform !== "win32") {
      const daemonStat = fs.statSync(paths.daemonSocketPath);
      const agentStat = fs.statSync(paths.agentSocketPath);
      expect((daemonStat.mode & 0o777).toString(8)).toBe("600");
      expect((agentStat.mode & 0o777).toString(8)).toBe("600");
    }
  });

  it("handles hello handshake and reports compatibility", async () => {
    serverInstance = createTerminalDaemonServer({
      paths,
      appVersion: "1.0.26",
      sessionManagerOptions: { ptyBackend: null },
    });
    await serverInstance.start();

    const client = await connectClient(paths.daemonSocketPath);
    try {
      const result = await client.send({
        type: "hello",
        protocolVersion: 1,
        minCompatibleVersion: 1,
        appVersion: "1.0.26",
        clientPid: process.pid,
      });

      expect(result.protocolVersion).toBe(1);
      expect(result.compatible).toBe(true);
      expect(result.daemonPid).toBe(process.pid);
      expect(result.activeSessionsCount).toBe(0);
    } finally {
      client.close();
    }
  });

  it("creates, writes, resumes, and replays session ring buffer output", async () => {
    serverInstance = createTerminalDaemonServer({
      paths,
      maxBufferLength: 1000,
      sessionManagerOptions: { ptyBackend: null },
    });
    await serverInstance.start();

    const client = await connectClient(paths.daemonSocketPath);
    try {
      await client.send({
        type: "hello",
        protocolVersion: 1,
        minCompatibleVersion: 1,
        appVersion: "1.0.26",
      });

      const session = await client.send({
        type: "create",
        input: { cwd: tempHome, cols: 80, rows: 24 },
      });
      expect(session.id).toBeDefined();

      // Write data to shell
      await client.send({
        type: "write",
        sessionId: session.id,
        data: "echo DAEMON_TEST_OK\n",
      });

      // Wait a moment for shell output
      await new Promise((r) => setTimeout(r, 100));

      // Resume from sequence 0 (full replay)
      const resumeResult = await client.send({
        type: "resume",
        sessionId: session.id,
        fromSequence: 0,
      });

      expect(resumeResult.session.id).toBe(session.id);
      expect(resumeResult.replayedData).toContain("DAEMON_TEST_OK");

      // Verify list returns this session
      const list = await client.send({ type: "list" });
      expect(list.some((s) => s.id === session.id)).toBe(true);

      // Kill session
      await client.send({ type: "kill", sessionId: session.id });
    } finally {
      client.close();
    }
  });

  it("responds to shutdown commands according to mode", async () => {
    let exitCalled = false;
    serverInstance = createTerminalDaemonServer({
      paths,
      sessionManagerOptions: { ptyBackend: null },
      exitFn: () => { exitCalled = true; },
    });
    await serverInstance.start();

    const client = await connectClient(paths.daemonSocketPath);
    try {
      await client.send({
        type: "hello",
        protocolVersion: 1,
        minCompatibleVersion: 1,
      });

      // When 0 sessions, shutdown if-empty triggers
      const res = await client.send({
        type: "shutdown",
        mode: "if-empty",
      });
      expect(res.shuttingDown).toBe(true);
      await new Promise((r) => setTimeout(r, 20));
      expect(exitCalled).toBe(true);
    } finally {
      client.close();
    }
  });
});
