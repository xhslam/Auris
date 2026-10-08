const { spawn: spawnProcess } = require("node:child_process");
const { EventEmitter } = require("node:events");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const MAX_OUTPUT_BUFFER_LENGTH = 200_000;
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
  // Match VMark v0.9.94 shell_env's COMSPEC default (ISC; see
  // docs/vmark-port/UPSTREAM-LICENSE.txt). Do not force a profile-heavy
  // PowerShell on users whose native default is cmd. Node env keys are
  // case-insensitive on Windows, but injected/test environments are not.
  for (const key of Object.keys(env)) {
    if (key.toUpperCase() === "COMSPEC" && isAbsoluteShellPath(env[key])) {
      return env[key].trim();
    }
  }

  const windowsRoot =
    (typeof env.SystemRoot === "string" && env.SystemRoot.trim()) ||
    (typeof env.windir === "string" && env.windir.trim()) ||
    "C:\\Windows";

  return path.win32.join(windowsRoot, "System32", "cmd.exe");
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

function isUtf8Locale(locale) {
  return /(?:utf-?8)/i.test(String(locale ?? ""));
}

function createTerminalEnvironment(baseEnv, cwd, platform) {
  const effectiveLocale = baseEnv.LC_ALL || baseEnv.LC_CTYPE || baseEnv.LANG;
  const localeFallback = platform === "darwin" ? "en_US.UTF-8" : "C.UTF-8";
  const localeEnv =
    platform !== "win32" && !isUtf8Locale(effectiveLocale)
      ? {
          LANG: localeFallback,
          LC_CTYPE: localeFallback,
          ...(baseEnv.LC_ALL ? { LC_ALL: localeFallback } : {}),
        }
      : {};

  return {
    ...baseEnv,
    ...localeEnv,
    EDITOR: "auris",
    SHADOWING_WORKSPACE: cwd,
    TERM: "xterm-256color",
    TERM_PROGRAM: "auris",
  };
}

// Package preference order per platform.
//
// On win32 vanilla node-pty is the only one of the two that actually ships a
// working native binding (prebuilds/win32-x64 with conpty.node + conpty.dll +
// OpenConsole.exe), so it must come first. The homebridge fork only ships
// linux-* prebuilds; on Windows its JS layer still requires cleanly and still
// exposes a `spawn` function, so a naive "require succeeded" probe picks it and
// then blows up at spawn time with "Cannot find module
// '../build/Debug/conpty.node'". That silent mis-pick is what forced every
// Windows session down to the pipe fallback (no TTY -> no resize, no
// interactive CLIs, "stdin is not a terminal").
//
// On macOS/Linux the homebridge fork keeps its original advantage: it ships
// prebuilds for recent Electron ABIs, while vanilla node-pty's table lags and
// would need a from-source rebuild.
function getPtyPackagePreference(platform) {
  return platform === "win32"
    ? ["node-pty", "@homebridge/node-pty-prebuilt-multiarch"]
    : ["@homebridge/node-pty-prebuilt-multiarch", "node-pty"];
}

// Returns every PTY package whose JS layer loaded, in preference order.
//
// We deliberately do NOT decide here which one works: on Windows node-pty
// resolves its native module lazily inside the WindowsPtyAgent constructor, so
// a require-time check cannot tell a healthy install from a broken one. The
// caller probes each candidate with a real spawn instead.
function loadPtyBackendCandidates(
  requireFn = require,
  logger = null,
  platform = process.platform,
) {
  const candidates = [];

  for (const packageName of getPtyPackagePreference(platform)) {
    try {
      const loaded = requireFn(packageName);
      if (loaded && typeof loaded.spawn === "function") {
        candidates.push({ backend: loaded, name: packageName });
      }
    } catch (error) {
      // Optional PTY backends may be absent or fail to load (native binding
      // missing / ABI mismatch). Surface the reason once so a maintainer can
      // tell pty-not-installed from pty-build-broken; we still fall through
      // to the next candidate and ultimately to pipe-based spawning.
      const message = error instanceof Error ? error.message : String(error);
      logger?.(`terminal:pty-backend-load-failed ${packageName}: ${message}`);
    }
  }

  return candidates;
}

// Backward-compatible single-backend accessor.
function loadOptionalPtyBackend(
  requireFn = require,
  logger = null,
  platform = process.platform,
) {
  return loadPtyBackendCandidates(requireFn, logger, platform)[0]?.backend ?? null;
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
  const endedSessions = new Map();
  const homedir = options.homedir ?? (() => os.homedir());
  const logger = options.logger ?? null;
  // PTY candidates in preference order. Tests may inject a single backend via
  // options.ptyBackend (or null to force the pipe path); production resolves
  // the real package list. Each candidate is probed with an actual spawn in
  // createSession because Windows resolves its native binding lazily.
  let ptyCandidates = options.ptyBackend === undefined
    ? null
    : options.ptyBackend
      ? [{ backend: options.ptyBackend, name: "injected" }]
      : [];
  function getPtyCandidates() {
    // Enumerating dormant sessions must not load native modules or run shells.
    ptyCandidates ??= loadPtyBackendCandidates(options.requireFn, logger, platform);
    return ptyCandidates;
  }
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
    options.onSessionRemoved?.(sessionId);
  }

  function emitExit(sessionId, exitCode, signal, errorMessage = null) {
    const session = sessions.get(sessionId);
    // Pipe error/exit notifications can both fire for the same failure.
    if (!session && endedSessions.has(sessionId)) return;
    const exit = {
      errorMessage,
      exitCode: typeof exitCode === "number" ? exitCode : null,
      sessionId,
      signal: typeof signal === "string" ? signal : null,
    };
    const record = session ? serializeSession(sessionId, session) : null;
    if (record) {
      endedSessions.set(sessionId, { ...record, exit });
      // Bounded read-only tombstones bridge the race where a live tab exits
      // before renderer attach. They are never saved as running recovery tabs.
      if (endedSessions.size > 50) endedSessions.delete(endedSessions.keys().next().value);
    }
    removeSession(sessionId);
    emitter.emit("exit", { ...exit, ...(record ? { output: record.output, outputSequence: record.outputSequence } : {}) });
  }

  function emitData(sessionId, data) {
    const normalizedData = toTerminalData(data);
    const session = sessions.get(sessionId);
    if (session) {
      session.output = `${session.output ?? ""}${normalizedData}`.slice(
        -MAX_OUTPUT_BUFFER_LENGTH,
      );
      session.outputSequence = (session.outputSequence ?? 0) + 1;
    }
    emitter.emit("data", {
      data: normalizedData,
      sessionId,
      ...(session ? { sequence: session.outputSequence } : {}),
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
    endedSessions.delete(sessionId);

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
    const childEnv = {
      ...createTerminalEnvironment(env, cwd, platform),
      ...options.sessionEnvironment?.(sessionId),
    };
    const workspaceInstanceId =
      typeof input.workspaceInstanceId === "string" &&
      input.workspaceInstanceId.trim()
        ? input.workspaceInstanceId.trim()
        : null;

    // Probe each PTY candidate with a real spawn. On Windows node-pty resolves
    // conpty.node lazily inside the WindowsPtyAgent constructor, so a package
    // whose JS layer loaded fine can still blow up here (that is exactly how a
    // fork without win32 prebuilds silently degraded every session to a pipe).
    // Trying each candidate in turn means one broken fork no longer costs us the
    // real TTY.
    const ptyFailures = [];
    const candidates = getPtyCandidates();

    for (const candidate of candidates) {
      let pty = null;
      try {
        pty = candidate.backend.spawn(
          shell,
          buildShellArgs(shell, platform, "pty"),
          {
            cols,
            cwd,
            env: childEnv,
            rows,
          },
        );
      } catch (error) {
        // node-pty / posix_spawnp can throw synchronously when the native
        // binding, cwd, or shell is unusable. Record it and try the next
        // candidate before considering the pipe fallback.
        const message = error instanceof Error ? error.message : String(error);
        ptyFailures.push(`${candidate.name}: ${message}`);
        logger?.(
          `terminal:${sessionId}:pty-spawn-failed ${candidate.name}: ${message}`,
        );
        continue;
      }

      if (pty) {
        logger?.(`terminal:${sessionId}:pty-ready ${candidate.name}`);
        sessions.set(sessionId, {
          backend: "pty",
          cols,
          cwd,
          process: pty,
          ptyPackage: candidate.name,
          rows,
          shell,
          output: "",
          outputSequence: 0,
          workspaceInstanceId,
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
          output: "",
          outputSequence: 0,
          ptyPackage: candidate.name,
          workspaceInstanceId,
        };
      }
    }

    // Every PTY candidate failed. A pipe-backed shell has no TTY: PowerShell
    // cannot learn the column count, resize is impossible, and interactive CLIs
    // that require a terminal (codex, claude, ...) refuse to start. Make this
    // degradation loud in the log rather than letting it look like a working
    // terminal that mysteriously misbehaves.
    if (candidates.length > 0) {
      logger?.(
        `terminal:${sessionId}:pty-unavailable falling back to pipe (no TTY; ` +
          `resize and interactive CLIs will not work) after ${candidates.length} ` +
          `candidate(s): ${ptyFailures.join(" | ") || "spawn returned nothing"}`,
      );
    }

    // When falling back to pipe spawning, POSIX shells need -i to print a
    // prompt and Windows shells need the UTF-8 startup command; buildShellArgs
    // already encodes both.
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
        output: "",
        workspaceInstanceId,
      };
    }

    sessions.set(sessionId, {
      backend: "pipe",
      cols,
      cwd,
      platform,
      process: child,
      rows,
      shell,
      output: "",
      outputSequence: 0,
      workspaceInstanceId,
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
      output: "",
      outputSequence: 0,
      ptyPackage: null,
      workspaceInstanceId,
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

    // Remember the requested geometry either way so listSessions can report
    // what the renderer asked for even when the backend cannot honour it.
    session.cols = cols;
    session.rows = rows;

    if (typeof session.process.resize === "function") {
      session.process.resize(cols, rows);
      return;
    }

    // Pipe-backed shells have no TTY, so there is no way to tell the child
    // process its new window size. Log it once per session instead of failing
    // silently: a terminal whose layout never reflows is a visible bug, and
    // this line is the breadcrumb that explains why.
    if (!session.resizeUnsupportedLogged) {
      session.resizeUnsupportedLogged = true;
      logger?.(
        `terminal:${sessionId}:resize-unsupported backend=${session.backend} (no TTY; layout will not reflow)`,
      );
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

  function serializeSession(id, session) {
    return {
      backend: session.backend,
      cols: session.cols ?? DEFAULT_COLS,
      cwd: session.cwd,
      id,
      // ptyPackage is null for pipe sessions; it lets the UI and bug reports
      // distinguish "real ConPTY via node-pty" from a silent pipe fallback.
      ptyPackage: session.ptyPackage ?? null,
      output: session.output ?? "",
      outputSequence: session.outputSequence ?? 0,
      rows: session.rows ?? DEFAULT_ROWS,
      shell: session.shell,
      workspaceInstanceId: session.workspaceInstanceId ?? null,
    };
  }
  function listSessions() {
    return [...sessions.entries()].map(([id, session]) => serializeSession(id, session));
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
    getEndedSession: (sessionId) => endedSessions.get(sessionId) ?? null,
    onData,
    onExit,
    resize,
    write,
  };
}

module.exports = {
  buildShellArgs,
  createTerminalEnvironment,
  createTerminalSessionManager,
  getPtyPackagePreference,
  isAbsoluteShellPath,
  isCmdShell,
  isPowerShell,
  loadOptionalPtyBackend,
  loadPtyBackendCandidates,
  normalizePipeInput,
  resolveDefaultShell,
};
