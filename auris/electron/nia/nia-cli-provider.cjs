"use strict";

/**
 * Bounded CLI provider execution for Nia.
 *
 * shell:false, fixed argv from registry, prompt via stdin, dedicated temp cwd,
 * minimal env allowlist, bounded IO, cancel kills the process tree.
 */

const { spawn } = require("node:child_process");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { getCliAdapter } = require("./nia-cli-registry.cjs");

const NIA_CLI_PROVIDER_ERROR_CODES = Object.freeze([
  "INVALID_REQUEST",
  "SPAWN_FAILED",
  "TIMEOUT",
  "CANCELLED",
  "OUTPUT_TOO_LARGE",
  "NONZERO_EXIT",
  "RISK_ACCEPTANCE_REQUIRED",
  "ADAPTER_UNAVAILABLE",
]);

const ENV_ALLOWLIST = Object.freeze([
  "PATH",
  "PATHEXT",
  "SYSTEMROOT",
  "WINDIR",
  "HOME",
  "USERPROFILE",
  "TMPDIR",
  "TEMP",
  "TMP",
  "LANG",
  "LC_ALL",
  "TERM",
]);

class NiaCliProviderError extends Error {
  constructor(code, message, details) {
    if (!NIA_CLI_PROVIDER_ERROR_CODES.includes(code)) {
      throw new TypeError(`Unknown Nia CLI provider error code: ${code}`);
    }
    super(message);
    this.name = "NiaCliProviderError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function cliError(code, message, details) {
  return new NiaCliProviderError(code, message, details);
}

function buildAllowlistedEnv(sourceEnv = process.env) {
  const env = Object.create(null);
  for (const key of ENV_ALLOWLIST) {
    if (typeof sourceEnv[key] === "string") env[key] = sourceEnv[key];
  }
  return env;
}

function killProcessTree(child, signal = "SIGKILL") {
  if (!child || !child.pid) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        shell: false,
        stdio: "ignore",
        windowsHide: true,
      });
      return;
    }
    try {
      process.kill(-child.pid, signal);
    } catch {
      child.kill(signal);
    }
  } catch {
    try {
      child.kill(signal);
    } catch {
      // ignore
    }
  }
}

function createNiaCliProvider({
  spawnImpl = spawn,
  mkdtempImpl = fsp.mkdtemp,
  rmImpl = fsp.rm,
  whichImpl = null,
} = {}) {
  async function resolveExecutable(adapter) {
    const names = adapter.executableNames;
    if (typeof whichImpl === "function") {
      for (const name of names) {
        const resolved = whichImpl(name);
        if (resolved) return { command: resolved, argv0: name };
      }
      return null;
    }
    // Prefer bare documented name — PATH resolution via spawn without shell.
    return { command: names[0], argv0: names[0] };
  }

  async function executePrompt({
    provider,
    model: _model,
    prompt,
    signal = null,
    onDelta = null,
    detection = null,
  }) {
    if (!provider || provider.kind !== "cli") {
      throw cliError("INVALID_REQUEST", "A CLI provider config is required.");
    }
    if (typeof prompt !== "string" || prompt.length === 0) {
      throw cliError("INVALID_REQUEST", "Prompt must be a non-empty string.");
    }

    const adapter = getCliAdapter(provider.adapterId);
    if (adapter.toolModeDisable !== true) {
      if (provider.capabilities?.riskAccepted !== true) {
        throw cliError(
          "RISK_ACCEPTANCE_REQUIRED",
          `CLI adapter "${adapter.id}" cannot disable tool mode without explicit risk acceptance.`,
        );
      }
    }

    const resolved = detection?.path
      ? { command: detection.path, argv0: detection.command || adapter.executableNames[0] }
      : await resolveExecutable(adapter);
    if (!resolved) {
      throw cliError("ADAPTER_UNAVAILABLE", `CLI adapter "${adapter.id}" is not available.`);
    }

    // Reject any attempt to inject user executable paths via detection spoofing:
    // path must end with a documented executable name.
    const commandText = String(resolved.command);
    const argv0 = String(resolved.argv0);
    const baseName = path.basename(commandText).replace(/\.cmd$/iu, "").replace(/\.exe$/iu, "");
    if (
      /[;&|`$<>\r\n\0]/u.test(commandText) ||
      !adapter.executableNames.includes(baseName) ||
      !adapter.executableNames.includes(argv0)
    ) {
      throw cliError("INVALID_REQUEST", "Resolved executable is not a documented adapter name.");
    }

    const argv = [...adapter.generateArgv];
    // Ensure prompt never lands in argv.
    for (const arg of argv) {
      if (arg === prompt || (typeof arg === "string" && arg.includes(prompt.slice(0, 32)))) {
        throw cliError("INVALID_REQUEST", "Prompt must not appear in argv.");
      }
    }

    const timeoutMs = provider.bounds?.timeoutMs ?? 60_000;
    const maxOutputBytes = provider.bounds?.maxOutputBytes ?? 1_048_576;
    const tempRoot = await mkdtempImpl(path.join(os.tmpdir(), "auris-nia-cli-"));
    const env = buildAllowlistedEnv();

    let child = null;
    let settled = false;
    let exitCode = null;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let cancelled = false;

    const cleanup = async () => {
      try {
        await rmImpl(tempRoot, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    };

    try {
      child = spawnImpl(resolved.command, argv, {
        shell: false,
        cwd: tempRoot,
        env,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        detached: process.platform !== "win32",
      });
    } catch (error) {
      await cleanup();
      throw cliError(
        "SPAWN_FAILED",
        error instanceof Error ? error.message : "Failed to spawn CLI provider.",
      );
    }

    const abortHandler = () => {
      cancelled = true;
      killProcessTree(child);
    };
    if (signal) {
      if (signal.aborted) {
        abortHandler();
      } else {
        signal.addEventListener("abort", abortHandler, { once: true });
      }
    }

    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child);
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      stdoutBytes += Buffer.byteLength(text, "utf8");
      if (stdoutBytes > maxOutputBytes) {
        killProcessTree(child);
        return;
      }
      stdout += text;
      if (typeof onDelta === "function") onDelta(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      stderrBytes += Buffer.byteLength(text, "utf8");
      if (stderrBytes > maxOutputBytes) {
        killProcessTree(child);
        return;
      }
      if (stderr.length < 4_096) {
        stderr += text.slice(0, 4_096 - stderr.length);
      }
    });

    try {
      await new Promise((resolve, reject) => {
        child.once("error", (error) => {
          if (settled) return;
          settled = true;
          reject(cliError("SPAWN_FAILED", error.message));
        });
        child.once("close", (code) => {
          if (settled) return;
          settled = true;
          exitCode = typeof code === "number" ? code : null;
          resolve({ code });
        });
        try {
          child.stdin.write(prompt, "utf8");
          child.stdin.end();
        } catch (error) {
          if (!settled) {
            settled = true;
            reject(cliError("SPAWN_FAILED", error instanceof Error ? error.message : "stdin write failed"));
          }
        }
      });
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", abortHandler);
      await cleanup();
    }

    if (cancelled || signal?.aborted) {
      throw cliError("CANCELLED", "CLI provider run cancelled.");
    }
    if (timedOut) {
      throw cliError("TIMEOUT", `CLI provider timed out after ${timeoutMs}ms.`);
    }
    if (stdoutBytes > maxOutputBytes || stderrBytes > maxOutputBytes) {
      throw cliError("OUTPUT_TOO_LARGE", "CLI provider output exceeded bound.");
    }

    if (typeof exitCode === "number" && exitCode !== 0) {
      throw cliError(
        "NONZERO_EXIT",
        `CLI provider exited with code ${exitCode}${stderr ? `: ${stderr.slice(0, 200)}` : ""}`,
        { exitCode },
      );
    }

    return Object.freeze({
      text: stdout,
      logSafe: Object.freeze({
        command: resolved.argv0,
        argv,
        cwd: "[temp]",
        envKeys: Object.keys(env).sort(),
      }),
    });
  }

  return Object.freeze({
    ENV_ALLOWLIST,
    buildAllowlistedEnv,
    executePrompt,
    killProcessTree,
  });
}

module.exports = {
  ENV_ALLOWLIST,
  NIA_CLI_PROVIDER_ERROR_CODES,
  NiaCliProviderError,
  buildAllowlistedEnv,
  createNiaCliProvider,
  killProcessTree,
};
