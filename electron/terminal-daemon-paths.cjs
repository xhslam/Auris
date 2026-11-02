"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function isPidAlive(pid) {
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function resolveTerminalDaemonPaths(options = {}) {
  const home = options.home ?? os.homedir();
  const platform = options.platform ?? process.platform;
  const channel = options.channel ?? process.env.AURIS_CHANNEL ?? (options.isPackaged ? "packaged" : "dev");
  const normalizedChannel = channel === "packaged" ? "packaged" : "dev";

  const runDir = path.join(home, ".auris", "run", normalizedChannel);
  const logDir = path.join(home, ".auris", "logs");
  const logPath = path.join(logDir, "daemon.log");
  const pidPath = path.join(runDir, "daemon.pid");

  let daemonSocketPath;
  let agentSocketPath;

  if (platform === "win32") {
    daemonSocketPath = `\\\\.\\pipe\\auris-daemon-${normalizedChannel}`;
    agentSocketPath = `\\\\.\\pipe\\auris-agent-${normalizedChannel}`;
  } else {
    daemonSocketPath = path.join(runDir, "daemon.sock");
    agentSocketPath = path.join(runDir, "agent.sock");
  }

  return {
    channel: normalizedChannel,
    platform,
    home,
    runDir,
    logDir,
    logPath,
    pidPath,
    daemonSocketPath,
    agentSocketPath,
  };
}

function ensureTerminalDaemonDirectories(paths) {
  if (!paths) return;
  if (paths.runDir) {
    try {
      fs.mkdirSync(paths.runDir, { recursive: true, mode: 0o700 });
      if (paths.platform !== "win32") {
        fs.chmodSync(paths.runDir, 0o700);
      }
    } catch {
      /* ignore */
    }
  }
  if (paths.logDir) {
    try {
      fs.mkdirSync(paths.logDir, { recursive: true, mode: 0o700 });
      if (paths.platform !== "win32") {
        fs.chmodSync(paths.logDir, 0o700);
      }
    } catch {
      /* ignore */
    }
  }
}

function readDaemonPid(paths) {
  try {
    if (!paths?.pidPath || !fs.existsSync(paths.pidPath)) {
      return null;
    }
    const content = fs.readFileSync(paths.pidPath, "utf8").trim();
    const pid = Number.parseInt(content, 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function writeDaemonPid(paths, pid = process.pid) {
  try {
    ensureTerminalDaemonDirectories(paths);
    fs.writeFileSync(paths.pidPath, `${pid}\n`, { mode: 0o600 });
    if (paths.platform !== "win32") {
      fs.chmodSync(paths.pidPath, 0o600);
    }
  } catch {
    /* ignore write failures */
  }
}

function cleanupDaemonPid(paths) {
  try {
    if (paths?.pidPath && fs.existsSync(paths.pidPath)) {
      fs.unlinkSync(paths.pidPath);
    }
  } catch {
    /* ignore unlink failure */
  }
}

function cleanupStaleSocket(socketPath, platform = process.platform) {
  if (!socketPath || platform === "win32") return;
  try {
    if (fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath);
    }
  } catch {
    /* ignore */
  }
}

module.exports = {
  isPidAlive,
  resolveTerminalDaemonPaths,
  ensureTerminalDaemonDirectories,
  readDaemonPid,
  writeDaemonPid,
  cleanupDaemonPid,
  cleanupStaleSocket,
};
