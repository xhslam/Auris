"use strict";

/**
 * The PATH the user actually has in their interactive shell, probed safely on startup.
 *
 * Derived from Mochi's src/main/shell-path.ts at commit 80bf695.
 *
 * ## Problem
 * macOS GUI applications launched from Finder/Dock/Spotlight inherit launchd's minimal PATH
 * (typically `/usr/bin:/bin:/usr/sbin:/sbin`). CLI tools (Codex, Claude, Gemini, Node, etc.)
 * installed via version managers (mise, nvm, asdf, fnm, pnpm, bun) or custom prefixes
 * (~/.local/bin, /opt/homebrew/bin) are missing from launchd's PATH.
 *
 * Furthermore, CLI binaries are often npm shims (`#!/usr/bin/env node`). Spawning them
 * with launchd's PATH fails at `env node` even if located by absolute path, because `node`
 * is not in launchd's PATH.
 *
 * ## Solution
 * Probe the user's interactive login shell (`$SHELL -ilc 'printf %s "$PATH"'`), bounded by
 * a 4-second timeout, take the last non-empty line (to ignore terminal banners), and widen
 * the app's PATH by keeping launchd entries first and appending shell entries without duplicates.
 */

const { spawn } = require("node:child_process");

const MAX_PROBE_OUTPUT = 64 * 1024;
const SHELL_PATH_TIMEOUT_MS = 4000;

function runProbe(command, args, options = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, [...args], {
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"],
        env: options.env,
      });
    } catch {
      resolve({ status: null, stdout: "", failed: true, timedOut: false });
      return;
    }

    let stdout = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      if (stdout.length >= MAX_PROBE_OUTPUT) return;
      stdout += String(chunk).slice(0, MAX_PROBE_OUTPUT - stdout.length);
    });

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout?.removeAllListeners("data");
      child.stdout?.destroy();
      resolve(result);
    };

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore kill error
      }
      finish({ status: null, stdout, failed: true, timedOut: true });
    }, options.timeoutMs ?? SHELL_PATH_TIMEOUT_MS);

    child.on("error", () => finish({ status: null, stdout, failed: true, timedOut: false }));
    child.on("close", (code) => finish({ status: code, stdout, failed: false, timedOut: false }));
  });
}

async function shellPath({
  platform = process.platform,
  env = process.env,
  run = runProbe,
  timeoutMs = SHELL_PATH_TIMEOUT_MS,
} = {}) {
  // Windows GUI processes inherit the machine and user PATH from the registry.
  if (platform === "win32") return null;

  const shell = env ? env.SHELL : undefined;
  if (!shell || typeof shell !== "string" || shell.trim() === "") return null;

  const asked = await run(shell, ["-ilc", 'printf %s "$PATH"'], {
    platform,
    env,
    timeoutMs,
  });

  if (asked.failed || asked.timedOut || asked.status !== 0) return null;

  // An interactive shell may print a banner; take the last non-empty line containing a directory slash.
  const line = asked.stdout
    .split("\n")
    .map((one) => one.trim())
    .filter((one) => one !== "")
    .pop();

  if (!line || !line.includes("/")) return null;
  return line;
}

/**
 * Widen current PATH with shell PATH, keeping existing entries first and deduplicating.
 */
function widenPath(current, fromShell) {
  const separator = ":";
  const mine = (current || "").split(separator).filter(Boolean);
  const theirs = (fromShell || "").split(separator).filter(Boolean);
  return [...new Set([...mine, ...theirs])].join(separator);
}

module.exports = {
  MAX_PROBE_OUTPUT,
  SHELL_PATH_TIMEOUT_MS,
  runProbe,
  shellPath,
  widenPath,
};
