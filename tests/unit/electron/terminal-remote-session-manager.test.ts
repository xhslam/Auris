import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const { createTerminalDaemonServer } = require("../../../electron/terminal-daemon/server.cjs");
const { createRemoteTerminalSessionManager } = require("../../../electron/terminal-remote-session-manager.cjs");
const { resolveTerminalDaemonPaths } = require("../../../electron/terminal-daemon-paths.cjs");

describe("terminal-remote-session-manager", () => {
  let tempHome: string;
  let serverInstance: any = null;
  let paths: any = null;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join("/tmp", "auris-remote-test-"));
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

    const receivedData: any[] = [];
    const receivedExit: any[] = [];
    remoteManager.onData((p: any) => receivedData.push(p));
    remoteManager.onExit((p: any) => receivedExit.push(p));

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

    // Write command
    remoteManager.write(session.id, "echo REMOTE_OK\n");

    // Wait for data event
    await new Promise((r) => setTimeout(r, 120));
    expect(receivedData.some((d) => d.sessionId === session.id && d.data.includes("REMOTE_OK"))).toBe(true);

    // Kill session
    remoteManager.kill(session.id);
    await new Promise((r) => setTimeout(r, 60));
    expect(remoteManager.listSessions()).toHaveLength(0);

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

    let statusUpdate: any = null;
    remoteManager.onDaemonStatus((s: any) => { statusUpdate = s; });

    await remoteManager.connect();

    // Verify it detected incompatible version with active tasks
    const status = remoteManager.getDaemonStatus();
    expect(status.needsUpgrade).toBe(true);
    expect(status.protocolCompatible).toBe(false);
    expect(status.activeSessionsCount).toBe(1);
    expect(statusUpdate?.needsUpgrade).toBe(true);

    // Verify session was NOT killed
    expect(serverInstance.sessionManager.listSessions()).toHaveLength(1);

    remoteManager.dispose();
  });
});
