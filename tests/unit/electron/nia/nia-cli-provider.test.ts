import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  ENV_ALLOWLIST,
  NiaCliProviderError,
  createNiaCliProvider,
} = require("../../../../electron/nia/nia-cli-provider.cjs");

function createFakeChild({
  stdoutChunks = ["hello"],
  stderrChunks = [] as string[],
  exitCode = 0,
  delayMs = 5,
} = {}) {
  const child = new EventEmitter() as EventEmitter & {
    pid: number;
    stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
    stdout: EventEmitter & { setEncoding: ReturnType<typeof vi.fn> };
    stderr: EventEmitter & { setEncoding: ReturnType<typeof vi.fn> };
    kill: ReturnType<typeof vi.fn>;
  };
  child.pid = 4242;
  child.stdin = {
    write: vi.fn(),
    end: vi.fn(),
  };
  child.stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  child.stderr = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  child.kill = vi.fn();

  setTimeout(() => {
    for (const chunk of stdoutChunks) child.stdout.emit("data", chunk);
    for (const chunk of stderrChunks) child.stderr.emit("data", chunk);
    setTimeout(() => child.emit("close", exitCode), delayMs);
  }, 0);
  return child;
}

describe("nia-cli-provider", () => {
  it("uses a frozen minimal env allowlist", () => {
    expect(ENV_ALLOWLIST).toContain("PATH");
    expect(ENV_ALLOWLIST).not.toContain("ANTHROPIC_API_KEY");
    expect(ENV_ALLOWLIST).not.toContain("OPENAI_API_KEY");
    expect(Object.isFrozen(ENV_ALLOWLIST)).toBe(true);
  });

  it("spawns shell:false with fixed argv, stdin prompt, and temp cwd", async () => {
    const child = createFakeChild({ stdoutChunks: ["ok"] });
    const spawnImpl = vi.fn((
      _command: string,
      _argv: string[],
      _options: { env: Record<string, string> },
    ) => child);
    const mkdtempImpl = vi.fn(async () => "/tmp/auris-nia-cli-test");
    const rmImpl = vi.fn(async () => undefined);
    const provider = createNiaCliProvider({ spawnImpl, mkdtempImpl, rmImpl });

    const result = await provider.executePrompt({
      provider: {
        kind: "cli",
        adapterId: "claude",
        capabilities: { riskAccepted: false, toolModeDisable: true },
        bounds: { timeoutMs: 5_000, maxOutputBytes: 8_192 },
      },
      prompt: "secret-prompt-value",
      detection: { path: "/usr/local/bin/claude", command: "claude" },
    });

    expect(spawnImpl).toHaveBeenCalledWith(
      "/usr/local/bin/claude",
      ["-p", "--output-format", "text", "--tools", ""],
      expect.objectContaining({
        shell: false,
        cwd: "/tmp/auris-nia-cli-test",
        stdio: ["pipe", "pipe", "pipe"],
      }),
    );
    const env = spawnImpl.mock.calls[0]![2].env as Record<string, string>;
    expect(Object.keys(env).every((key) => ENV_ALLOWLIST.includes(key))).toBe(true);
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(child.stdin.write).toHaveBeenCalledWith("secret-prompt-value", "utf8");
    expect(spawnImpl.mock.calls[0]![1]).not.toContain("secret-prompt-value");
    expect(result.text).toBe("ok");
    expect(result.logSafe.cwd).toBe("[temp]");
    expect(rmImpl).toHaveBeenCalled();
  });

  it("rejects undocumented executable paths and requires risk acceptance for agentic adapters", async () => {
    const provider = createNiaCliProvider({
      spawnImpl: vi.fn(),
      mkdtempImpl: vi.fn(async () => "/tmp/x"),
      rmImpl: vi.fn(async () => undefined),
    });

    await expect(
      provider.executePrompt({
        provider: {
          kind: "cli",
          adapterId: "claude",
          capabilities: { toolModeDisable: true },
          bounds: { timeoutMs: 1_000, maxOutputBytes: 1_024 },
        },
        prompt: "hi",
        detection: { path: "/tmp/evil-bin", command: "evil-bin" },
      }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });

    await expect(
      provider.executePrompt({
        provider: {
          kind: "cli",
          adapterId: "codex",
          capabilities: { toolModeDisable: false, riskAccepted: false },
          bounds: { timeoutMs: 1_000, maxOutputBytes: 1_024 },
        },
        prompt: "hi",
        detection: { path: "/usr/bin/codex", command: "codex" },
      }),
    ).rejects.toMatchObject({ code: "RISK_ACCEPTANCE_REQUIRED" });
  });

  it("bounds stdout/stderr flooding and cancels by killing the process tree", async () => {
    const floodChild = createFakeChild({
      stdoutChunks: ["x".repeat(2_000)],
      delayMs: 50,
    });
    const flood = createNiaCliProvider({
      spawnImpl: vi.fn(() => floodChild),
      mkdtempImpl: vi.fn(async () => "/tmp/auris-nia-cli-flood"),
      rmImpl: vi.fn(async () => undefined),
    });
    await expect(
      flood.executePrompt({
        provider: {
          kind: "cli",
          adapterId: "claude",
          capabilities: { toolModeDisable: true },
          bounds: { timeoutMs: 5_000, maxOutputBytes: 512 },
        },
        prompt: "flood",
        detection: { path: "/usr/bin/claude", command: "claude" },
      }),
    ).rejects.toMatchObject({ code: "OUTPUT_TOO_LARGE" });

    const cancelChild = createFakeChild({ stdoutChunks: [], delayMs: 200 });
    const cancelProvider = createNiaCliProvider({
      spawnImpl: vi.fn(() => cancelChild),
      mkdtempImpl: vi.fn(async () => "/tmp/auris-nia-cli-cancel"),
      rmImpl: vi.fn(async () => undefined),
    });
    const controller = new AbortController();
    const pending = cancelProvider.executePrompt({
      provider: {
        kind: "cli",
        adapterId: "claude",
        capabilities: { toolModeDisable: true },
        bounds: { timeoutMs: 5_000, maxOutputBytes: 8_192 },
      },
      prompt: "cancel-me",
      signal: controller.signal,
      detection: { path: "/usr/bin/claude", command: "claude" },
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
    expect(cancelChild.kill).toHaveBeenCalled();
  });

  it("rejects adversarial argv injection attempts via shell metacharacters in detection", async () => {
    const provider = createNiaCliProvider({
      spawnImpl: vi.fn(() => createFakeChild()),
      mkdtempImpl: vi.fn(async () => "/tmp/auris-nia-cli-adv"),
      rmImpl: vi.fn(async () => undefined),
    });

    await expect(
      provider.executePrompt({
        provider: {
          kind: "cli",
          adapterId: "claude",
          capabilities: { toolModeDisable: true },
          bounds: { timeoutMs: 1_000, maxOutputBytes: 1_024 },
        },
        prompt: "$(rm -rf /)",
        detection: { path: "/usr/bin/claude; rm -rf /", command: "claude" },
      }),
    ).rejects.toBeInstanceOf(NiaCliProviderError);
  });
});
