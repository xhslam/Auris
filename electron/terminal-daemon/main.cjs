"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  resolveTerminalDaemonPaths,
  ensureTerminalDaemonDirectories,
  writeDaemonPid,
  cleanupDaemonPid,
} = require("../terminal-daemon-paths.cjs");
const { createTerminalDaemonServer } = require("./server.cjs");

// Parse arguments (e.g. --channel=packaged or --channel=dev)
let channel = process.env.AURIS_CHANNEL || "dev";
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith("--channel=")) {
    channel = arg.slice("--channel=".length).trim();
  }
}

const paths = resolveTerminalDaemonPaths({ channel });
ensureTerminalDaemonDirectories(paths);

// Rolling file logger (5MB cap)
const MAX_LOG_SIZE = 5 * 1024 * 1024;

function writeDaemonLog(message) {
  try {
    ensureTerminalDaemonDirectories(paths);
    const line = `[${new Date().toISOString()}] [PID:${process.pid}] ${message}\n`;

    try {
      if (fs.existsSync(paths.logPath)) {
        const stat = fs.statSync(paths.logPath);
        if (stat.size >= MAX_LOG_SIZE) {
          const backupPath = `${paths.logPath}.1`;
          try {
            if (fs.existsSync(backupPath)) {
              fs.unlinkSync(backupPath);
            }
          } catch {
            /* ignore */
          }
          fs.renameSync(paths.logPath, backupPath);
        }
      }
    } catch {
      /* ignore rotation check errors */
    }

    fs.appendFileSync(paths.logPath, line, "utf8");
  } catch {
    /* ignore logging failure */
  }
}

writeDaemonLog(`terminal-daemon starting on channel: ${channel}`);

// Write PID file
writeDaemonPid(paths, process.pid);

let serverInstance = null;

async function bootstrap() {
  try {
    serverInstance = createTerminalDaemonServer({
      paths,
      logger: writeDaemonLog,
      appVersion: process.env.AURIS_APP_VERSION || "1.0.0",
    });

    await serverInstance.start();
    writeDaemonLog(`terminal-daemon started successfully (PID: ${process.pid})`);
  } catch (error) {
    writeDaemonLog(`terminal-daemon startup failed: ${error?.stack || error}`);
    cleanupDaemonPid(paths);
    process.exit(1);
  }
}

function handleSignal(signal) {
  writeDaemonLog(`terminal-daemon received ${signal}, shutting down...`);
  cleanupDaemonPid(paths);
  if (serverInstance) {
    serverInstance.stop().then(() => {
      writeDaemonLog("terminal-daemon stopped cleanly.");
      process.exit(0);
    }).catch(() => {
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

process.on("SIGTERM", () => handleSignal("SIGTERM"));
process.on("SIGINT", () => handleSignal("SIGINT"));
process.on("SIGHUP", () => handleSignal("SIGHUP"));

process.on("uncaughtException", (err) => {
  writeDaemonLog(`terminal-daemon uncaughtException: ${err?.stack || err}`);
});

process.on("unhandledRejection", (reason) => {
  writeDaemonLog(`terminal-daemon unhandledRejection: ${reason?.stack || reason}`);
});

bootstrap();
