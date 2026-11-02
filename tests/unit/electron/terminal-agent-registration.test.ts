import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  copyAgentHookScript,
  registerClaudeCodeHooks,
  inspectCodexNotify,
  CLAUDE_AGENT_EVENTS,
} = require("../../../electron/terminal-agent-registration.cjs");

describe("terminal-agent-registration", () => {
  let tmpDir: string;
  let sourceHookPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "auris-reg-test-"));
    sourceHookPath = path.join(tmpDir, "source-hook.cjs");
    fs.writeFileSync(sourceHookPath, "// test hook content");
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { force: true, recursive: true });
    } catch {
      /* ignore */
    }
  });

  it("copies hook script to ~/.auris/hooks/ and does not overwrite if unchanged", () => {
    const dest = copyAgentHookScript(sourceHookPath, { home: tmpDir });
    expect(fs.existsSync(dest)).toBe(true);
    expect(fs.readFileSync(dest, "utf8")).toBe("// test hook content");

    const stat1 = fs.statSync(dest);
    copyAgentHookScript(sourceHookPath, { home: tmpDir });
    const stat2 = fs.statSync(dest);
    expect(stat1.mtimeMs).toBe(stat2.mtimeMs);
  });

  it("registers Claude Code hooks idempotently preserving other hooks", () => {
    const claudeDir = path.join(tmpDir, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
    const initialConfig = {
      hooks: {
        SessionStart: [
          {
            hooks: [
              { command: "python custom_start.py", timeout: 10, type: "command" },
            ],
          },
        ],
      },
      userSetting: "preserved",
    };
    fs.writeFileSync(
      path.join(claudeDir, "settings.json"),
      JSON.stringify(initialConfig, null, 2),
    );

    const hookScript = path.join(tmpDir, ".auris", "hooks", "terminal-agent-hook.cjs");
    const result1 = registerClaudeCodeHooks(hookScript, { home: tmpDir });
    expect(result1.status).toBe("ok");
    expect(result1.modified).toBe(true);

    const saved = JSON.parse(fs.readFileSync(path.join(claudeDir, "settings.json"), "utf8"));
    expect(saved.userSetting).toBe("preserved");
    // User's custom hook is preserved
    expect(saved.hooks.SessionStart[0].hooks[0].command).toBe("python custom_start.py");
    // Auris hook is appended
    const aurisHook = saved.hooks.SessionStart[1].hooks[0];
    expect(aurisHook.command).toContain("terminal-agent-hook.cjs");
    expect(aurisHook.timeout).toBe(5);

    // All events registered
    for (const eventName of CLAUDE_AGENT_EVENTS) {
      expect(saved.hooks[eventName]).toBeDefined();
    }

    // Second call is idempotent
    const result2 = registerClaudeCodeHooks(hookScript, { home: tmpDir });
    expect(result2.status).toBe("ok");
    expect(result2.modified).toBe(false);
  });

  it("refuses to overwrite corrupt settings.json and reports invalid_json", () => {
    const claudeDir = path.join(tmpDir, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
    const brokenPath = path.join(claudeDir, "settings.json");
    fs.writeFileSync(brokenPath, "{ broken json ...", "utf8");

    const logger = vi.fn();
    const result = registerClaudeCodeHooks("/path/to/hook.cjs", { home: tmpDir, logger });
    expect(result.status).toBe("invalid_json");
    expect(fs.readFileSync(brokenPath, "utf8")).toBe("{ broken json ...");
    expect(logger).toHaveBeenCalled();
  });

  it("inspects Codex notify and flags existing configuration", () => {
    const codexDir = path.join(tmpDir, ".codex");
    fs.mkdirSync(codexDir, { recursive: true });
    const configPath = path.join(codexDir, "config.toml");
    fs.writeFileSync(configPath, 'notify = ["echo", "done"]\nmodel = "gpt-5"\n');

    const result = inspectCodexNotify({ home: tmpDir });
    expect(result.status).toBe("skipped_existing");
    expect(result.hasNotify).toBe(true);
  });
});
