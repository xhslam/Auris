import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const {
  isPidAlive,
  resolveTerminalDaemonPaths,
  ensureTerminalDaemonDirectories,
  readDaemonPid,
  writeDaemonPid,
  cleanupDaemonPid,
  cleanupStaleSocket,
} = require("../../../electron/terminal-daemon-paths.cjs");

describe("terminal-daemon-paths", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "auris-paths-test-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("resolves isolated paths for dev and packaged channels on posix", () => {
    const devPaths = resolveTerminalDaemonPaths({
      home: tempDir,
      platform: "darwin",
      channel: "dev",
    });

    expect(devPaths.channel).toBe("dev");
    expect(devPaths.runDir).toBe(path.join(tempDir, ".auris", "run", "dev"));
    expect(devPaths.daemonSocketPath).toBe(path.join(tempDir, ".auris", "run", "dev", "daemon.sock"));
    expect(devPaths.agentSocketPath).toBe(path.join(tempDir, ".auris", "run", "dev", "agent.sock"));
    expect(devPaths.pidPath).toBe(path.join(tempDir, ".auris", "run", "dev", "daemon.pid"));
    expect(devPaths.logPath).toBe(path.join(tempDir, ".auris", "logs", "daemon.log"));

    const packagedPaths = resolveTerminalDaemonPaths({
      home: tempDir,
      platform: "darwin",
      channel: "packaged",
    });
    expect(packagedPaths.channel).toBe("packaged");
    expect(packagedPaths.runDir).toBe(path.join(tempDir, ".auris", "run", "packaged"));
  });

  it("resolves named pipes on win32", () => {
    const winPaths = resolveTerminalDaemonPaths({
      home: tempDir,
      platform: "win32",
      channel: "dev",
    });

    expect(winPaths.daemonSocketPath).toBe("\\\\.\\pipe\\auris-daemon-dev");
    expect(winPaths.agentSocketPath).toBe("\\\\.\\pipe\\auris-agent-dev");
  });

  it("ensures directory permissions are 0700 on posix", () => {
    const paths = resolveTerminalDaemonPaths({
      home: tempDir,
      platform: "darwin",
      channel: "dev",
    });

    ensureTerminalDaemonDirectories(paths);

    expect(fs.existsSync(paths.runDir)).toBe(true);
    expect(fs.existsSync(paths.logDir)).toBe(true);

    if (process.platform !== "win32") {
      const runStat = fs.statSync(paths.runDir);
      expect((runStat.mode & 0o777).toString(8)).toBe("700");
    }
  });

  it("writes, reads, and cleans up daemon pid", () => {
    const paths = resolveTerminalDaemonPaths({
      home: tempDir,
      platform: "darwin",
      channel: "dev",
    });

    expect(readDaemonPid(paths)).toBeNull();

    writeDaemonPid(paths, 12345);
    expect(readDaemonPid(paths)).toBe(12345);

    if (process.platform !== "win32") {
      const pidStat = fs.statSync(paths.pidPath);
      expect((pidStat.mode & 0o777).toString(8)).toBe("600");
    }

    cleanupDaemonPid(paths);
    expect(readDaemonPid(paths)).toBeNull();
  });

  it("correctly evaluates isPidAlive", () => {
    expect(isPidAlive(process.pid)).toBe(true);
    expect(isPidAlive(999999)).toBe(false);
    expect(isPidAlive(null as unknown as number)).toBe(false);
  });

  it("cleans stale socket files on posix", () => {
    const dummySocket = path.join(tempDir, "test.sock");
    fs.writeFileSync(dummySocket, "fake-socket");
    expect(fs.existsSync(dummySocket)).toBe(true);

    cleanupStaleSocket(dummySocket, "darwin");
    expect(fs.existsSync(dummySocket)).toBe(false);
  });
});
