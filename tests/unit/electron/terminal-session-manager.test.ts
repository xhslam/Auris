import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  createTerminalSessionManager,
  getPtyPackagePreference,
  loadPtyBackendCandidates,
  resolveDefaultShell,
  buildShellArgs,
} = require("../../../electron/terminal-session-manager.cjs");

type FakePty = {
  emitData: (data: string) => void;
  emitExit: (exitCode: number) => void;
  kill: ReturnType<typeof vi.fn>;
  onData: (listener: (data: string) => void) => void;
  onExit: (listener: (event: { exitCode: number }) => void) => void;
  resize: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
};

function createFakePty(): FakePty {
  const dataListeners: Array<(data: string) => void> = [];
  const exitListeners: Array<(event: { exitCode: number }) => void> = [];

  return {
    emitData(data) {
      dataListeners.forEach((listener) => listener(data));
    },
    emitExit(exitCode) {
      exitListeners.forEach((listener) => listener({ exitCode }));
    },
    kill: vi.fn(),
    onData(listener) {
      dataListeners.push(listener);
    },
    onExit(listener) {
      exitListeners.push(listener);
    },
    resize: vi.fn(),
    write: vi.fn(),
  };
}

describe("terminal-session-manager", () => {
  it("preserves an authorized cwd with trailing spaces at the actual spawn boundary", () => {
    const pty = createFakePty();
    const spawn = vi.fn(() => pty);
    const selected = "/projects/customer ";
    const manager = createTerminalSessionManager({ platform: "darwin", env: { SHELL: "/bin/zsh" }, homedir: () => "/home", cwdExistsSync: () => true, ptyBackend: { spawn } });
    expect(manager.createSession({ cwd: selected, requireCwd: true }).cwd).toBe(selected);
    expect(spawn).toHaveBeenCalledWith("/bin/zsh", [], expect.objectContaining({ cwd: selected }));
  });

  it("does not fall back to home when a required project cwd becomes unavailable", () => {
    const spawn = vi.fn(() => createFakePty());
    const manager = createTerminalSessionManager({ homedir: () => "/home", cwdExistsSync: () => false, ptyBackend: { spawn } });
    expect(() => manager.createSession({ cwd: "/projects/deleted", requireCwd: true })).toThrow("已失效");
    expect(spawn).not.toHaveBeenCalled();
  });

  it("uses the same COMSPEC cmd default as VMark rather than forcing PowerShell", () => {
    const pty = createFakePty();
    const spawnPty = vi.fn<(...args: unknown[]) => typeof pty>(() => pty);
    const manager = createTerminalSessionManager({
      env: {
        ComSpec: "C:\\Windows\\System32\\cmd.exe",
        SystemRoot: "C:\\Windows",
      },
      homedir: () => "C:\\Users\\test",
      platform: "win32",
      ptyBackend: {
        spawn: spawnPty,
      },
    });

    const session = manager.createSession({
      sessionId: "term-vmark-default",
    });

    expect(session.shell).toBe("C:\\Windows\\System32\\cmd.exe");
    expect(spawnPty).toHaveBeenCalledWith(
      "C:\\Windows\\System32\\cmd.exe",
      ["/K", "chcp 65001 > nul"],
      expect.any(Object),
    );
  });

  it.each([
    [{ COMSPEC: "D:\\Windows\\System32\\cmd.exe" }, "D:\\Windows\\System32\\cmd.exe"],
    [{ ComSpec: "C:\\Tools\\pwsh.exe" }, "C:\\Tools\\pwsh.exe"],
    [{ COMSPEC: "cmd.exe", SystemRoot: "D:\\Windows" }, "D:\\Windows\\System32\\cmd.exe"],
    [{ COMSPEC: "", windir: "E:\\Windows" }, "E:\\Windows\\System32\\cmd.exe"],
    [{}, "C:\\Windows\\System32\\cmd.exe"],
  ])("resolves a Windows shell without PATH probing or profile changes (%j)", (env, expected) => {
    expect(resolveDefaultShell("win32", env)).toBe(expected);
  });

  it("keeps explicit PowerShell sessions and their UTF-8 startup", () => {
    const pty = createFakePty();
    const spawn = vi.fn<(...args: unknown[]) => typeof pty>(() => pty);
    const shell = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
    const manager = createTerminalSessionManager({
      env: { ComSpec: "C:\\Windows\\System32\\cmd.exe" },
      platform: "win32", homedir: () => "C:\\Users\\test", ptyBackend: { spawn },
    });
    expect(manager.createSession({ shell }).shell).toBe(shell);
    expect(spawn).toHaveBeenCalledWith(shell, buildShellArgs(shell, "win32", "pty"), expect.any(Object));
    expect(buildShellArgs(shell, "win32", "pty").join(" ")).toContain("[Console]::InputEncoding");
  });

  it("creates a pty-backed terminal session and streams data through the manager", () => {
    const pty = createFakePty();
    const spawnPty = vi.fn<(...args: unknown[]) => typeof pty>(() => pty);
    const manager = createTerminalSessionManager({
      env: {
        ComSpec: "C:\\Windows\\System32\\cmd.exe",
        SystemRoot: "C:\\Windows",
      },
      homedir: () => "C:\\Users\\test",
      platform: "win32",
      ptyBackend: {
        spawn: spawnPty,
      },
    });
    const onData = vi.fn();
    const onExit = vi.fn();

    manager.onData(onData);
    manager.onExit(onExit);

    const session = manager.createSession({
      cols: 120,
      cwd: "C:\\vault",
      rows: 32,
      sessionId: "term-1",
      workspaceInstanceId: "path:win32:C:\\vault",
    });

    expect(session).toMatchObject({
      backend: "pty",
      cwd: "C:\\vault",
      id: "term-1",
      workspaceInstanceId: "path:win32:C:\\vault",
      shell: "C:\\Windows\\System32\\cmd.exe",
    });
    expect(spawnPty).toHaveBeenCalledWith(
      "C:\\Windows\\System32\\cmd.exe",
      ["/K", "chcp 65001 > nul"],
      expect.objectContaining({
        cols: 120,
        cwd: "C:\\vault",
        rows: 32,
      }),
    );
    expect((spawnPty.mock.calls[0]?.[2] as { env?: Record<string, string> })?.env).toMatchObject({
      EDITOR: "auris",
      SHADOWING_WORKSPACE: "C:\\vault",
      TERM: "xterm-256color",
      TERM_PROGRAM: "auris",
    });

    manager.write("term-1", "npm test\r");
    manager.resize("term-1", { cols: 140, rows: 40 });
    pty.emitData("ready\r\n");
    pty.emitExit(0);

    expect(pty.write).toHaveBeenCalledWith("npm test\r");
    expect(pty.resize).toHaveBeenCalledWith(140, 40);
    expect(onData).toHaveBeenCalledWith({
      data: "ready\r\n",
      sessionId: "term-1",
      sequence: 1,
    });
    expect(onExit).toHaveBeenCalledWith(
      expect.objectContaining({
        exitCode: 0,
        sessionId: "term-1",
      }),
    );
    expect(manager.listSessions()).toEqual([]);
  });

  it("buffers bounded output for renderer detach and replay", () => {
    const pty = createFakePty();
    const manager = createTerminalSessionManager({
      env: { SHELL: "/bin/zsh" },
      homedir: () => "/Users/test",
      platform: "darwin",
      ptyBackend: { spawn: vi.fn<(...args: unknown[]) => typeof pty>(() => pty) },
    });

    const created = manager.createSession({
      sessionId: "term-buffered",
      workspaceInstanceId: "path:darwin:/workspace",
    });
    pty.emitData("before detach\r\n");

    expect(created.output).toBe("");
    expect(manager.listSessions()).toEqual([
      expect.objectContaining({
        id: "term-buffered",
        output: "before detach\r\n",
        outputSequence: 1,
        workspaceInstanceId: "path:darwin:/workspace",
      }),
    ]);

    pty.emitData("x".repeat(200_010));
    const [record] = manager.listSessions();
    expect(record.output).toHaveLength(200_000);
    expect(record.output.endsWith("x".repeat(32))).toBe(true);
  });

  it("retains an ended output snapshot without listing or starting it as live", () => {
    const pty = createFakePty();
    const spawnPty = vi.fn<(...args: unknown[]) => typeof pty>(() => pty);
    const manager = createTerminalSessionManager({ ptyBackend: { spawn: spawnPty }, env: {}, platform: "win32", homedir: () => "C:\\vault" });
    const onExit = vi.fn(); manager.onExit(onExit);
    manager.createSession({ sessionId: "ended-tab" });
    pty.emitData("final output"); pty.emitExit(7);
    expect(manager.listSessions()).toEqual([]);
    expect(manager.getEndedSession("ended-tab")).toMatchObject({ id: "ended-tab", output: "final output", outputSequence: 1, exit: { exitCode: 7 } });
    expect(onExit).toHaveBeenCalledWith(expect.objectContaining({ output: "final output", outputSequence: 1, exitCode: 7 }));
    expect(spawnPty).toHaveBeenCalledTimes(1);
    pty.emitExit(7);
    expect(onExit).toHaveBeenCalledTimes(1);
    manager.createSession({ sessionId: "ended-tab" });
    expect(manager.getEndedSession("ended-tab")).toBeNull();
  });

  it("does not load native PTY modules just to enumerate sessions", () => {
    const requireFn = vi.fn(() => ({ spawn: vi.fn(() => createFakePty()) }));
    const manager = createTerminalSessionManager({ requireFn, env: {}, platform: "win32", homedir: () => "C:\\Users\\test" });
    expect(manager.listSessions()).toEqual([]);
    expect(requireFn).not.toHaveBeenCalled();
    manager.createSession();
    expect(requireFn).toHaveBeenCalledWith("node-pty");
  });

  it("rejects renderer-provided relative shell paths", () => {
    const manager = createTerminalSessionManager({
      env: {
        ComSpec: "C:\\Windows\\System32\\cmd.exe",
        SystemRoot: "C:\\Windows",
      },
      homedir: () => "C:\\Users\\test",
      platform: "win32",
      ptyBackend: {
        spawn: vi.fn(() => createFakePty()),
      },
    });

    expect(() =>
      manager.createSession({
        sessionId: "term-2",
        shell: "powershell.exe",
      }),
    ).toThrow(/absolute shell path/i);
  });

  it("falls back to the home directory when the requested cwd does not exist", () => {
    const pty = createFakePty();
    const spawnPty = vi.fn<(...args: unknown[]) => typeof pty>(() => pty);
    const manager = createTerminalSessionManager({
      cwdExistsSync: (candidate: string) => candidate === "/Users/test",
      env: { SHELL: "/bin/zsh" },
      homedir: () => "/Users/test",
      platform: "darwin",
      ptyBackend: { spawn: spawnPty },
    });

    const session = manager.createSession({
      cwd: "/Users/test/Documents/missing-vault",
      sessionId: "term-stale-cwd",
    });

    expect(session.cwd).toBe("/Users/test");
    expect(spawnPty).toHaveBeenCalledWith(
      "/bin/zsh",
      [],
      expect.objectContaining({ cwd: "/Users/test" }),
    );
  });

  it("forces a UTF-8 locale for POSIX shells when the desktop process inherited C locale", () => {
    const pty = createFakePty();
    const spawnPty = vi.fn<(...args: unknown[]) => typeof pty>(() => pty);
    const manager = createTerminalSessionManager({
      env: {
        LANG: "C",
        LC_ALL: "C",
        SHELL: "/bin/zsh",
      },
      homedir: () => "/Users/test",
      platform: "darwin",
      ptyBackend: { spawn: spawnPty },
    });

    manager.createSession({
      cwd: "/Users/test/Desktop/大学markdown",
      sessionId: "term-utf8-locale",
    });

    expect(spawnPty).toHaveBeenCalledWith(
      "/bin/zsh",
      [],
      expect.objectContaining({
        env: expect.objectContaining({
          LANG: "en_US.UTF-8",
          LC_ALL: "en_US.UTF-8",
          LC_CTYPE: "en_US.UTF-8",
        }),
      }),
    );
  });

  it("preserves an existing UTF-8 locale for POSIX shells", () => {
    const spawnPty = vi.fn<(...args: unknown[]) => ReturnType<typeof createFakePty>>(() => createFakePty());
    const manager = createTerminalSessionManager({
      env: {
        LANG: "zh_CN.UTF-8",
        SHELL: "/bin/zsh",
      },
      homedir: () => "/Users/test",
      platform: "darwin",
      ptyBackend: { spawn: spawnPty },
    });

    manager.createSession({ sessionId: "term-existing-utf8-locale" });

    expect(
      (spawnPty.mock.calls[0]?.[2] as { env: Record<string, string> }).env,
    ).toMatchObject({
      LANG: "zh_CN.UTF-8",
    });
    expect(
      (spawnPty.mock.calls[0]?.[2] as { env: Record<string, string> }).env,
    ).not.toHaveProperty("LC_CTYPE");
  });

  it("falls back to pipe spawn when the pty backend throws synchronously", () => {
    const ptySpawn = vi.fn(() => {
      throw new Error("posix_spawnp failed.");
    });
    const child = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      once: vi.fn(),
    };
    const spawnPipe = vi.fn(() => child);
    const manager = createTerminalSessionManager({
      env: { SHELL: "/bin/zsh" },
      homedir: () => "/Users/test",
      platform: "darwin",
      ptyBackend: { spawn: ptySpawn },
      spawnProcess: spawnPipe,
    });

    const session = manager.createSession({
      cwd: "/Users/test",
      sessionId: "term-pty-throws",
    });

    expect(session.backend).toBe("pipe");
    expect(ptySpawn).toHaveBeenCalledTimes(1);
    expect(spawnPipe).toHaveBeenCalledTimes(1);
  });

  it("normalizes xterm carriage returns for POSIX pipe-backed shells", () => {
    const child = {
      stdin: { write: vi.fn() },
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      once: vi.fn(),
    };
    const manager = createTerminalSessionManager({
      env: { SHELL: "/bin/zsh" },
      homedir: () => "/Users/test",
      platform: "darwin",
      ptyBackend: null,
      spawnProcess: vi.fn(() => child),
    });

    manager.createSession({
      cwd: "/Users/test",
      sessionId: "term-pipe-posix",
    });

    manager.write("term-pipe-posix", "echo READY\r");

    expect(child.stdin.write).toHaveBeenCalledWith("echo READY\n");
  });

  it("rejects duplicate session ids without replacing the existing process", () => {
    const firstPty = createFakePty();
    const spawnPty = vi.fn(() => firstPty);
    const manager = createTerminalSessionManager({
      env: {
        ComSpec: "C:\\Windows\\System32\\cmd.exe",
        SystemRoot: "C:\\Windows",
      },
      homedir: () => "C:\\Users\\test",
      platform: "win32",
      ptyBackend: {
        spawn: spawnPty,
      },
    });

    manager.createSession({
      sessionId: "term-duplicate",
    });

    expect(() =>
      manager.createSession({
        sessionId: "term-duplicate",
      }),
    ).toThrow(/already exists/i);
    expect(spawnPty).toHaveBeenCalledTimes(1);
    expect(manager.listSessions()).toEqual([
      expect.objectContaining({
        id: "term-duplicate",
      }),
    ]);
  });

  // The regression this guards: the loader used to try the homebridge fork
  // first on every platform. That fork ships no win32 prebuild, but its JS
  // layer still loads and still exposes spawn(), so the old require-time check
  // accepted it and every Windows session silently degraded to a pipe (no TTY,
  // no resize, interactive CLIs refusing to start).
  it("prefers vanilla node-pty on win32 and the homebridge fork elsewhere", () => {
    expect(getPtyPackagePreference("win32")).toEqual([
      "node-pty",
      "@homebridge/node-pty-prebuilt-multiarch",
    ]);
    expect(getPtyPackagePreference("darwin")).toEqual([
      "@homebridge/node-pty-prebuilt-multiarch",
      "node-pty",
    ]);
  });

  it("collects every loadable pty package in preference order", () => {
    const nodePty = { spawn: vi.fn() };
    const requireFn = vi.fn((name: string) => {
      if (name === "node-pty") {
        return nodePty;
      }
      throw new Error(`Cannot find module '${name}'`);
    });
    const logger = vi.fn();

    const candidates = loadPtyBackendCandidates(requireFn, logger, "win32");

    expect(candidates).toEqual([{ backend: nodePty, name: "node-pty" }]);
    expect(logger).toHaveBeenCalledWith(
      expect.stringContaining("@homebridge/node-pty-prebuilt-multiarch"),
    );
  });

  it("probes the next pty candidate when an earlier one fails to spawn", () => {
    const workingPty = createFakePty();
    const brokenSpawn = vi.fn(() => {
      // Mirrors the real failure: node-pty resolves conpty.node lazily inside
      // the WindowsPtyAgent constructor, so a package whose JS layer loaded
      // fine still throws here.
      throw new Error("Cannot find module '../build/Debug/conpty.node'");
    });
    const workingSpawn = vi.fn(() => workingPty);
    const logger = vi.fn();
    const manager = createTerminalSessionManager({
      env: {
        ComSpec: "C:\\Windows\\System32\\cmd.exe",
        SystemRoot: "C:\\Windows",
      },
      homedir: () => "C:\\Users\\test",
      logger,
      platform: "win32",
      requireFn: (name: string) => {
        if (name === "node-pty") {
          return { spawn: brokenSpawn };
        }
        return { spawn: workingSpawn };
      },
    });

    const session = manager.createSession({ sessionId: "term-fallback-chain" });

    expect(session.backend).toBe("pty");
    expect(brokenSpawn).toHaveBeenCalledTimes(1);
    expect(workingSpawn).toHaveBeenCalledTimes(1);
    expect(manager.listSessions()).toEqual([
      expect.objectContaining({
        id: "term-fallback-chain",
        ptyPackage: "@homebridge/node-pty-prebuilt-multiarch",
      }),
    ]);
  });

  it("logs a loud degradation notice when every pty candidate fails", () => {
    const child = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      once: vi.fn(),
    };
    const logger = vi.fn();
    const manager = createTerminalSessionManager({
      env: {
        ComSpec: "C:\\Windows\\System32\\cmd.exe",
        SystemRoot: "C:\\Windows",
      },
      homedir: () => "C:\\Users\\test",
      logger,
      platform: "win32",
      requireFn: () => ({
        spawn: () => {
          throw new Error("native binding missing");
        },
      }),
      spawnProcess: vi.fn(() => child),
    });

    const session = manager.createSession({ sessionId: "term-all-fail" });

    expect(session.backend).toBe("pipe");
    expect(logger).toHaveBeenCalledWith(
      expect.stringContaining("pty-unavailable"),
    );
    expect(manager.listSessions()).toEqual([
      expect.objectContaining({ id: "term-all-fail", ptyPackage: null }),
    ]);
  });

  it("forwards resize to pty sessions and flags pipe sessions as unresizable", () => {
    const pty = createFakePty();
    const ptyManager = createTerminalSessionManager({
      env: { SHELL: "/bin/zsh" },
      homedir: () => "/Users/test",
      platform: "darwin",
      ptyBackend: { spawn: vi.fn<(...args: unknown[]) => typeof pty>(() => pty) },
    });

    ptyManager.createSession({ sessionId: "term-resize-pty" });
    ptyManager.resize("term-resize-pty", { cols: 137, rows: 40 });

    expect(pty.resize).toHaveBeenCalledWith(137, 40);

    // A pipe-backed child has no resize(); the manager must say so instead of
    // silently swallowing the call, because a terminal whose layout never
    // reflows is exactly the bug this logging explains.
    const logger = vi.fn();
    const pipeManager = createTerminalSessionManager({
      env: { SHELL: "/bin/zsh" },
      homedir: () => "/Users/test",
      logger,
      platform: "darwin",
      ptyBackend: null,
      spawnProcess: vi.fn(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        once: vi.fn(),
      })),
    });

    pipeManager.createSession({ sessionId: "term-resize-pipe" });
    pipeManager.resize("term-resize-pipe", { cols: 137, rows: 40 });
    pipeManager.resize("term-resize-pipe", { cols: 90, rows: 30 });

    const resizeLogs = logger.mock.calls.filter(([message]) =>
      String(message).includes("resize-unsupported"),
    );

    expect(resizeLogs).toHaveLength(1);
  });
});
