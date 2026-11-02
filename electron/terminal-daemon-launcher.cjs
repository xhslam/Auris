"use strict";

const net = require("node:net");
const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const {
  isPidAlive,
  resolveTerminalDaemonPaths,
  readDaemonPid,
  cleanupDaemonPid,
  cleanupStaleSocket,
  ensureTerminalDaemonDirectories,
} = require("./terminal-daemon-paths.cjs");

function resolveDaemonEntry(options = {}) {
  const isPackaged = options.isPackaged ?? false;
  if (isPackaged && process.resourcesPath) {
    const unpacked = path.join(
      process.resourcesPath,
      "app.asar.unpacked",
      "electron",
      "terminal-daemon",
      "main.cjs"
    );
    if (fs.existsSync(unpacked)) {
      return unpacked;
    }
  }
  return path.join(__dirname, "terminal-daemon", "main.cjs");
}

function probeDaemonSocket(socketPath, timeoutMs = 400) {
  return new Promise((resolve) => {
    let settled = false;
    const socket = net.connect(socketPath);

    function cleanup() {
      if (!settled) {
        settled = true;
        try {
          socket.destroy();
        } catch {
          /* ignore */
        }
      }
    }

    const timer = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);

    socket.once("connect", () => {
      clearTimeout(timer);
      cleanup();
      resolve(true);
    });

    socket.once("error", () => {
      clearTimeout(timer);
      cleanup();
      resolve(false);
    });
  });
}

async function ensureDaemonRunning(options = {}) {
  const paths = options.paths ?? resolveTerminalDaemonPaths(options);
  const logger = options.logger ?? null;
  const execPath = options.execPath ?? process.execPath;
  const appVersion = options.appVersion ?? "1.0.0";
  const daemonEntry = options.daemonEntry ?? resolveDaemonEntry(options);

  ensureTerminalDaemonDirectories(paths);

  // 1. Try probing existing socket
  const isAlive = await probeDaemonSocket(paths.daemonSocketPath);
  if (isAlive) {
    logger?.("terminal-launcher: existing daemon is responsive.");
    return { paths, socketPath: paths.daemonSocketPath };
  }

  // 2. Check stale PID file
  const pid = readDaemonPid(paths);
  if (pid) {
    if (isPidAlive(pid)) {
      logger?.(`terminal-launcher: killing hung daemon process PID: ${pid}`);
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        /* ignore */
      }
      await new Promise((r) => setTimeout(r, 200));
      if (isPidAlive(pid)) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          /* ignore */
        }
      }
    }
    cleanupDaemonPid(paths);
  }

  // Clean stale socket
  cleanupStaleSocket(paths.daemonSocketPath, paths.platform);
  cleanupStaleSocket(paths.agentSocketPath, paths.platform);

  // 3. Spawn daemon
  logger?.(`terminal-launcher: spawning daemon ${daemonEntry} on channel ${paths.channel}`);

  const child = childProcess.spawn(
    execPath,
    [daemonEntry, `--channel=${paths.channel}`],
    {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        AURIS_CHANNEL: paths.channel,
        AURIS_APP_VERSION: appVersion,
      },
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }
  );
  child.unref();

  // 4. Poll until responsive (up to 3500ms)
  const startTime = Date.now();
  const maxWaitMs = 3500;
  let delay = 50;

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 200);

    const ready = await probeDaemonSocket(paths.daemonSocketPath, 200);
    if (ready) {
      logger?.(`terminal-launcher: daemon ready after ${Date.now() - startTime}ms`);
      return { paths, socketPath: paths.daemonSocketPath };
    }
  }

  throw new Error(`Failed to start terminal daemon within ${maxWaitMs}ms`);
}

module.exports = {
  resolveDaemonEntry,
  probeDaemonSocket,
  ensureDaemonRunning,
};
