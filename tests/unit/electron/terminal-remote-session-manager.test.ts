import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

const { createTerminalDaemonServer } = require("../../../electron/terminal-daemon/server.cjs");
const { createRemoteTerminalSessionManager } = require("../../../electron/terminal-remote-session-manager.cjs");
const { resolveTerminalDaemonPaths } = require("../../../electron/terminal-daemon-paths.cjs");

describe("terminal-remote-session-manager", () => {
  let tempHome: string;
  let serverInstance: ReturnType<typeof createTerminalDaemonServer> | null = null;
  let paths: ReturnType<typeof resolveTerminalDaemonPaths>;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "auris-remote-test-"));
    paths = resolveTerminalDaemonPaths({
      home: tempHome,
      channel: "dev",
    });
    // Never share the developer App's global Windows daemon pipes.
    if (process.platform === "win32") {
      const pipe = String.raw`\\.\pipe\auris-test-${process.pid}-${path.basename(tempHome)}`;
      paths.daemonSocketPath = `${pipe}-daemon`;
      paths.agentSocketPath = `${pipe}-agent`;
    }
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

  it("connects to daemon, syncs sessions, and forwards pty data and exit events", async () => {
    serverInstance = createTerminalDaemonServer({
      paths,
      sessionManagerOptions: { ptyBackend: null },
      exitFn: () => {},
    });
    await serverInstance.start();

    const remoteManager = createRemoteTerminalSessionManager({
      paths,
      appVersion: "1.0.26",
    });

    const receivedData: { sessionId: string; data: string; sequence?: number }[] = [];
    const receivedExit: unknown[] = [];
    remoteManager.onData((p: (typeof receivedData)[number]) => receivedData.push(p));
    remoteManager.onExit((p: unknown) => receivedExit.push(p));

    await remoteManager.connect();
    expect(remoteManager.getDaemonStatus().connected).toBe(true);

    // Create session
    const session = await remoteManager.createSession({
      cwd: tempHome,
      cols: 80,
      rows: 24,
    });
    expect(session.id).toBeDefined();
    expect(remoteManager.listSessions()).toHaveLength(1);

    // A synchronous list must reflect acknowledged remote geometry changes.
    remoteManager.resize(session.id, { cols: 100, rows: 30 });
    await expect.poll(() => remoteManager.listSessions()[0]).toMatchObject({ cols: 100, rows: 30 });

    // Write command
    remoteManager.write(session.id, "echo REMOTE_OK\n");

    await expect.poll(() => receivedData.some((event) =>
      event.sessionId === session.id && event.data.includes("REMOTE_OK"),
    ), { timeout: 3000 }).toBe(true);

    // Kill session
    remoteManager.kill(session.id);
    await expect.poll(() => remoteManager.listSessions(), { timeout: 3000 }).toHaveLength(0);

    remoteManager.dispose();
  });

  it("handles incompatible version with active sessions without killing them", async () => {
    // Start server claiming protocolVersion 99
    serverInstance = createTerminalDaemonServer({
      paths,
      protocolVersion: 99,
      minCompatibleVersion: 99,
      sessionManagerOptions: { ptyBackend: null },
      exitFn: () => {},
    });
    await serverInstance.start();

    // Create an active session on server directly
    serverInstance.sessionManager.createSession({ cwd: tempHome });
    expect(serverInstance.sessionManager.listSessions()).toHaveLength(1);

    const remoteManager = createRemoteTerminalSessionManager({
      paths,
      appVersion: "1.0.26",
    });

    const statusUpdate: { current: { needsUpgrade: boolean } | null } = { current: null };
    remoteManager.onDaemonStatus((s: { needsUpgrade: boolean }) => { statusUpdate.current = s; });

    await remoteManager.connect();

    // Verify it detected incompatible version with active tasks
    const status = remoteManager.getDaemonStatus();
    expect(status.needsUpgrade).toBe(true);
    expect(status.protocolCompatible).toBe(false);
    expect(status.activeSessionsCount).toBe(1);
    expect(statusUpdate.current?.needsUpgrade).toBe(true);

    // Verify session was NOT killed
    expect(serverInstance.sessionManager.listSessions()).toHaveLength(1);

    remoteManager.dispose();
  });
});
