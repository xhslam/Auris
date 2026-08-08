const { spawn: spawnProcess } = require("node:child_process");
const { EventEmitter } = require("node:events");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

let nextSessionNumber = 1;

function createSessionId() {
  return `term-${nextSessionNumber++}`;
}

function normalizeSessionId(candidate) {
  return typeof candidate === "string" && SESSION_ID_PATTERN.test(candidate)
    ? candidate
    : createSessionId();
}

function isAbsoluteShellPath(candidate) {
  if (typeof candidate !== "string" || !candidate.trim()) {
    return false;
  }

  return (
    path.isAbsolute(candidate) ||
    path.win32.isAbsolute(candidate) ||
    path.posix.isAbsolute(candidate)
  );
}

function resolveWindowsShell(env) {
  if (
    isAbsoluteShellPath(env.ComSpec) &&
    /(?:^|\\)(?:pwsh|powershell)\.exe$/i.test(env.ComSpec)
  ) {
    return env.ComSpec;
  }

  const windowsRoot =
    (typeof env.SystemRoot === "string" && env.SystemRoot.trim()) ||
    (typeof env.windir === "string" && env.windir.trim()) ||
    "C:\\Windows";

  return path.win32.join(
    windowsRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
}

function resolveDefaultShell(platform, env) {
  if (platform === "win32") {
    return resolveWindowsShell(env);
  }

  return isAbsoluteShellPath(env.SHELL) ? env.SHELL : "/bin/sh";
}

function isPowerShell(shell) {
  return /(?:^|[\\/])(?:pwsh|powershell)(?:\.exe)?$/i.test(String(shell));
}

function isCmdShell(shell) {
  return /(?:^|[\\/])cmd(?:\.exe)?$/i.test(String(shell));
}

// Windows consoles default to the OEM code page (e.g. 936/GBK on Chinese
// Windows). xterm.js decodes the backend stream as UTF-8, so any non-ASCII
// output (Chinese paths, filenames, git status) turns into garbled diamonds
// unless we force the shell to emit UTF-8. We inject a small startup command
// that switches the console to code page 65001 and sets the .NET console /
// PowerShell output+input encodings to UTF-8, then drops into an interactive
// prompt (-NoExit / /K) so the user's profile still loads normally.
//
// mode is "pty" or "pipe". The Windows UTF-8 startup args apply to both
// backends, but POSIX only needs the -i interactive flag in the pipe
// fallback: under a real pty the shell already sees a TTY and prints a
// prompt, and passing -i there would change nothing while diverging from
// the historical (and tested) empty-args behavior.
function buildShellArgs(shell, platform, mode) {
  if (platform === "win32") {
    if (isPowerShell(shell)) {
      return [
        "-NoExit",
        "-Command",
        "chcp 65001 > $null; " +
          "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; " +
          "[Console]::InputEncoding = [System.Text.Encoding]::UTF8; " +
          "$OutputEncoding = [System.Text.Encoding]::UTF8",
      ];
    }

    if (isCmdShell(shell)) {
      return ["/K", "chcp 65001 > nul"];
    }

    return [];
  }

  // POSIX shells need -i so they print a prompt when attached to a pipe
  // instead of a TTY. Under a real pty we leave args empty.
  return mode === "pipe" ? ["-i"] : [];
}

function normalizePositiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function createTerminalEnvironment(baseEnv, cwd) {
  return {
    ...baseEnv,
    EDITOR: "auris",
    SHADOWING_WORKSPACE: cwd,
    TERM: "xterm-256color",
    TERM_PROGRAM: "auris",
  };
}

function loadOptionalPtyBackend(requireFn = require, logger = null) {
  // The homebridge fork ships prebuilt binaries for every recent Electron
  // ABI (including Electron 41 on macOS arm64 / x64), so try it first.
  // Vanilla node-pty's prebuild table tends to lag a couple of Electron
  // majors and ends up needing a from-source rebuild that we'd rather avoid.
  const candidates = ["@homebridge/node-pty-prebuilt-multiarch", "node-pty"];

  for (const packageName of candidates) {
    try {
      const loaded = requireFn(packageName);
      if (loaded && typeof loaded.spawn === "function") {
        return loaded;
      }
    } catch (error) {
      // Optional PTY backends may be absent or fail to load (native binding
      // missing / ABI mismatch). Surface the reason once so a maintainer can
      // tell pty-not-installed from pty-build-broken; we still fall through
      // to pipe-based spawning either way.
      const message = error instanceof Error ? error.message : String(error);
      logger?.(`terminal:pty-backend-load-failed ${packageName}: ${message}`);
    }
  }

  return null;
}

function toTerminalData(data) {
  if (typeof data === "string") {
    return data;
  }

  if (data instanceof Uint8Array || Buffer.isBuffer(data)) {
    return Buffer.from(data).toString("utf8");
  }

  return String(data ?? "");
}

function normalizePipeInput(data, platform) {
  const input = String(data);

  if (platform === "win32") {
    return input;
  }

  return input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function createTerminalSessionManager(options = {}) {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const emitter = new EventEmitter();
  const sessions = new Map();
  const homedir = options.homedir ?? (() => os.homedir());
  const logger = options.logger ?? null;
  const ptyBackend =
    options.ptyBackend === undefined
      ? loadOptionalPtyBackend(options.requireFn, options.logger ?? null)
      : options.ptyBackend;
  const spawnPipe = options.spawnProcess ?? spawnProcess;
  // Opt-in cwd existence check. If a caller does not pass cwdExistsSync we
  // skip validation entirely so existing tests that pass fake paths like
  // "C:\\vault" continue to work. Production callers in electron/main.cjs
  // wire this up to node:fs so a stale vault path (e.g. a config copied over
  // from another machine) silently falls back to the user's home directory
  // instead of crashing posix_spawnp.
  const cwdExistsSync = options.cwdExistsSync ?? null;

  function removeSession(sessionId) {
    sessions.delete(sessionId);
  }

  function emitExit(sessionId, exitCode, signal, errorMessage = null) {
    removeSession(sessionId);
    emitter.emit("exit", {
      errorMessage,
      exitCode: typeof exitCode === "number" ? exitCode : null,
      sessionId,
      signal: typeof signal === "string" ? signal : null,
    });
  }

  function emitData(sessionId, data) {
    emitter.emit("data", {
      data: toTerminalData(data),
      sessionId,
    });
  }

  function createSession(input = {}) {
    const requestedShell =
      typeof input.shell === "string" && input.shell.trim()
        ? input.shell.trim()
        : null;

    if (requestedShell && !isAbsoluteShellPath(requestedShell)) {
      throw new Error("Terminal shell must be an absolute shell path.");
    }

    const sessionId = normalizeSessionId(input.sessionId);
    if (sessions.has(sessionId)) {
      throw new Error(`Terminal session already exists: ${sessionId}`);
    }

    const requestedCwd =
      typeof input.cwd === "string" && input.cwd.trim()
        ? input.cwd.trim()
        : homedir();
    // If a caller provided a cwd-existence checker (production code does;
    // unit tests don't), validate the cwd. A configured vault path that no
    // longer exists on disk — e.g. when the project was copied between
    // machines — would otherwise make posix_spawnp throw before any error
    // handler is wired up.
    const cwd =
      cwdExistsSync && !cwdExistsSync(requestedCwd)
        ? (() => {
            const home = homedir();
            logger?.(
              `terminal:${sessionId}:cwd-missing falling back from ${requestedCwd} to ${home}`,
            );
            return home;
          })()
        : requestedCwd;
    const shell = requestedShell ?? resolveDefaultShell(platform, env);
    const cols = normalizePositiveInteger(input.cols, DEFAULT_COLS);
    const rows = normalizePositiveInteger(input.rows, DEFAULT_ROWS);
    const childEnv = createTerminalEnvironment(env, cwd);

    if (ptyBackend && typeof ptyBackend.spawn === "function") {
      let pty = null;
      try {
        pty = ptyBackend.spawn(shell, buildShellArgs(shell, platform, "pty"), {
          cols,
          cwd,
          env: childEnv,
          rows,
        });
      } catch (error) {
        // node-pty / posix_spawnp can throw synchronously when the cwd or
        // shell is invalid. Falling back to a pipe-backed shell gives the
        // user a usable terminal instead of a hard IPC failure.
        const message = error instanceof Error ? error.message : String(error);
        logger?.(`terminal:${sessionId}:pty-spawn-failed ${message}`);
      }

      if (pty) {
        sessions.set(sessionId, {
          backend: "pty",
          cwd,
          process: pty,
          shell,
        });

        pty.onData((data) => emitData(sessionId, data));
        pty.onExit((event) => {
          emitExit(sessionId, event?.exitCode, event?.signal);
        });

        return {
          backend: "pty",
          cols,
          cwd,
          id: sessionId,
          rows,
          shell,
        };
      }
    }

    // When falling back to pipe spawning (because node-pty failed to load),
    // POSIX shells need -i to print a prompt and Windows shells need the
    // UTF-8 startup command; buildShellArgs already encodes both.
    const pipeArgs = buildShellArgs(shell, platform, "pipe");

    let child = null;
    try {
      child = spawnPipe(shell, pipeArgs, {
        cwd,
        env: childEnv,
        windowsHide: false,
      });
    } catch (error) {
      // Synchronous spawn failure (e.g. cwd not accessible). Surface a clean
      // error to the renderer instead of letting the IPC handler reject with
      // a raw libc message that nobody can act on.
      const message = error instanceof Error ? error.message : String(error);
      logger?.(`terminal:${sessionId}:pipe-spawn-failed ${message}`);
      const friendlyMessage = `无法启动终端：${message}`;
      // Defer the event emission so the caller can attach listeners first.
      setImmediate(() => {
        emitData(sessionId, `\r\n${friendlyMessage}\r\n`);
        emitExit(sessionId, 1, null, message);
      });
      return {
        backend: "pipe",
        cols,
        cwd,
        id: sessionId,
        rows,
        shell,
      };
    }

    sessions.set(sessionId, {
      backend: "pipe",
      cwd,
      platform,
      process: child,
      shell,
    });

    child.stdout?.on("data", (data) => emitData(sessionId, data));
    child.stderr?.on("data", (data) => emitData(sessionId, data));
    child.once("error", (error) => {
      const message = error instanceof Error ? error.message : String(error);
      logger?.(`terminal:${sessionId}:error ${message}`);
      emitData(sessionId, `\r\nFailed to start shell: ${message}\r\n`);
      emitExit(sessionId, 1, null, message);
    });
    child.once("exit", (exitCode, signal) => {
      emitExit(sessionId, exitCode, signal);
    });

    return {
      backend: "pipe",
      cols,
      cwd,
      id: sessionId,
      rows,
      shell,
    };
  }

  function getSession(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new Error(`Terminal session not found: ${sessionId}`);
    }

    return session;
  }

  function write(sessionId, data) {
    const session = getSession(sessionId);
    if (session.backend === "pty") {
      session.process.write(String(data));
      return;
    }

    session.process.stdin?.write(normalizePipeInput(data, session.platform));
  }

  function resize(sessionId, size) {
    const session = getSession(sessionId);
    const cols = normalizePositiveInteger(size?.cols, DEFAULT_COLS);
    const rows = normalizePositiveInteger(size?.rows, DEFAULT_ROWS);

    if (typeof session.process.resize === "function") {
      session.process.resize(cols, rows);
    }
  }

  function kill(sessionId) {
    const session = getSession(sessionId);
    removeSession(sessionId);

    if (typeof session.process.kill === "function") {
      session.process.kill();
    }
  }

  function killAll() {
    [...sessions.keys()].forEach((sessionId) => {
      try {
        kill(sessionId);
      } catch (error) {
        logger?.(`terminal:${sessionId}:kill-error ${error?.stack ?? error}`);
      }
    });
  }

  function listSessions() {
    return [...sessions.entries()].map(([id, session]) => ({
      backend: session.backend,
      cwd: session.cwd,
      id,
      shell: session.shell,
    }));
  }

  function onData(listener) {
    emitter.on("data", listener);
    return () => emitter.off("data", listener);
  }

  function onExit(listener) {
    emitter.on("exit", listener);
    return () => emitter.off("exit", listener);
  }

  return {
    createSession,
    kill,
    killAll,
    listSessions,
    onData,
    onExit,
    resize,
    write,
  };
}

module.exports = {
  buildShellArgs,
  createTerminalSessionManager,
  isAbsoluteShellPath,
  isCmdShell,
  isPowerShell,
  loadOptionalPtyBackend,
  normalizePipeInput,
  resolveDefaultShell,
};
