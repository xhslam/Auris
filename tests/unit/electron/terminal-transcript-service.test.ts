import { createRequire } from "node:module";
import { mkdtempSync, realpathSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
const require = createRequire(import.meta.url);
const { createTerminalTranscriptService, parseTranscript } = require("../../../electron/terminal-transcript-service.cjs");
const temporary: string[] = [];
function setup() {
  const home = realpathSync(mkdtempSync(path.join(tmpdir(), "auris-transcript-")));
  temporary.push(home);
  const directory = path.join(home, "app", "terminal-transcripts");
  const service = createTerminalTranscriptService({ directory, homeDirectory: home, env: {} });
  const cli = path.join(home, ".claude", "projects", "project");
  mkdirSync(cli, { recursive: true });
  const file = path.join(cli, "session.jsonl");
  const bind = (sessionId: string, target = file) => {
    const token = service.sessionEnvironment(sessionId).AURIS_TRANSCRIPT_TOKEN;
    writeFileSync(path.join(directory, `${token}.json`), JSON.stringify({ path: target }));
    return token;
  };
  return { home, directory, service, file, bind };
}
const assistant = (text: string, uuid = "reply") => `${JSON.stringify({ type: "assistant", uuid, message: { role: "assistant", content: [{ type: "text", text }] } })}\n`;
afterEach(() => { for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true }); });
describe("terminal transcripts", () => {
  it("installs additive hooks only after opt-in and preserves byte identity on repeated enable", () => {
    const { home, service } = setup();
    expect(service.isEnabled()).toBe(false);
    mkdirSync(path.join(home, ".claude"), { recursive: true });
    const file = path.join(home, ".claude", "settings.json");
    writeFileSync(file, JSON.stringify({ permissions: { deny: ["secret"] }, hooks: { SessionStart: [{ hooks: [{ type: "command", command: "existing" }] }] } }));
    service.configure(true);
    const first = readFileSync(file, "utf8");
    expect(JSON.parse(first).hooks.SessionStart).toHaveLength(2);
    expect(JSON.parse(first).permissions.deny).toEqual(["secret"]);
    service.configure(true);
    expect(readFileSync(file, "utf8")).toBe(first);
    service.configure(false);
    expect(service.isEnabled()).toBe(false);
    expect(readFileSync(file, "utf8")).toBe(first);
  });
  it("validates all configurations before changing any, preserving invalid JSON", () => {
    const { home, service } = setup();
    mkdirSync(path.join(home, ".codex"), { recursive: true });
    const codex = path.join(home, ".codex", "hooks.json");
    writeFileSync(codex, "{broken");
    expect(() => service.configure(true)).toThrow();
    expect(readFileSync(codex, "utf8")).toBe("{broken");
    expect(readdirSync(path.join(home, ".claude"))).toEqual(["projects"]);
    expect(service.isEnabled()).toBe(false);
  });
  it("adds Antigravity's named invocation hooks, preserves existing handlers and remains idempotent", () => {
    const { home, service } = setup();
    const file = path.join(home, ".gemini", "config", "hooks.json");
    mkdirSync(path.dirname(file), { recursive: true });
    const existing = { guard: { PreToolUse: [{ matcher: "run_command", hooks: [{ command: "check" }] }] } };
    writeFileSync(file, JSON.stringify(existing));
    service.configure(true);
    const first = readFileSync(file, "utf8");
    const config = JSON.parse(first);
    expect(config.guard).toEqual(existing.guard);
    expect(config.hooks).toBeUndefined();
    expect(config["auris-terminal-transcript"].PreInvocation).toHaveLength(1);
    expect(config["auris-terminal-transcript"].PostInvocation).toEqual(config["auris-terminal-transcript"].PreInvocation);
    expect(config["auris-terminal-transcript"].PreInvocation[0].command).toContain("--antigravity");
    service.configure(true);
    expect(readFileSync(file, "utf8")).toBe(first);
    service.configure(false);
    expect(readFileSync(file, "utf8")).toBe(first);
  });
  it("leaves Claude and Codex configurations untouched when Antigravity hooks are invalid", () => {
    const { home, service } = setup();
    const file = path.join(home, ".gemini", "config", "hooks.json");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, '{"auris-terminal-transcript":{"PreInvocation":false}}');
    expect(() => service.configure(true)).toThrow("PreInvocation");
    expect(readFileSync(file, "utf8")).toBe('{"auris-terminal-transcript":{"PreInvocation":false}}');
    expect(readdirSync(path.join(home, ".claude"))).toEqual(["projects"]);
    expect(readdirSync(home)).not.toContain(".codex");
    expect(service.isEnabled()).toBe(false);
  });
  it("binds Antigravity's camelCase hook payload and reads only its exact CLI transcript location", async () => {
    const { home, directory, service, bind } = setup();
    service.configure(true);
    const conversationId = "11111111-2222-4333-8444-555555555555";
    const logs = path.join(home, ".gemini", "antigravity-cli", "brain", conversationId, ".system_generated", "logs");
    mkdirSync(logs, { recursive: true });
    const file = path.join(logs, "transcript.jsonl");
    const record = { type: "PLANNER_RESPONSE", source: "MODEL", status: "DONE", step_index: 7, content: "Antigravity reply", thinking: "private" };
    writeFileSync(file, `${JSON.stringify(record)}\n`);
    const token = service.sessionEnvironment("agy").AURIS_TRANSCRIPT_TOKEN;
    const script = path.join(directory, "terminal-transcript-hook.cjs");
    const result = spawnSync(process.execPath, [script, "--antigravity"], {
      input: JSON.stringify({ conversationId, transcriptPath: file }),
      env: { ...process.env, AURIS_TRANSCRIPT_TOKEN: token }, encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({});
    expect((await service.read("agy")).messages).toEqual([{ id: "antigravity:7", text: "Antigravity reply" }]);
    const full = path.join(logs, "transcript_full.jsonl");
    writeFileSync(full, `${JSON.stringify(record)}\n`);
    bind("agy", full);
    expect((await service.read("agy")).messages).toEqual([{ id: "antigravity:7", text: "Antigravity reply" }]);
    const unexpected = path.join(logs, "private.jsonl");
    writeFileSync(unexpected, `${JSON.stringify(record)}\n`);
    bind("agy", unexpected);
    await expect(service.read("agy")).rejects.toThrow("执行记录不可用");
    service.configure(false);
    const disabled = spawnSync(process.execPath, [script, "--antigravity"], {
      input: JSON.stringify({ conversationId, transcriptPath: file }),
      env: { ...process.env, AURIS_TRANSCRIPT_TOKEN: token }, encoding: "utf8",
    });
    expect(JSON.parse(disabled.stdout)).toEqual({});
    expect(readdirSync(directory)).not.toContain(`${token}.json`);
  });
  it("previews only completed Antigravity model content, ignoring users, tools and reasoning", () => {
    const base = { type: "PLANNER_RESPONSE", source: "MODEL", status: "DONE", step_index: 0, content: "reply", thinking: "private", tool_calls: [{ args: { secret: "tool" } }] };
    const records = [base, { ...base, content: "updated" },
      { ...base, type: "USER_INPUT", content: "user" },
      { ...base, type: "GENERIC", content: "tool output" },
      { ...base, source: "USER", content: "user source" },
      { ...base, status: "RUNNING", content: "partial" },
      { ...base, content: undefined, thinking: "reasoning only" }];
    expect(parseTranscript(records.map((record) => JSON.stringify(record)).join("\n") + "\n")).toEqual([{ id: "antigravity:0", text: "updated" }]);
  });
  it("binds exact sessions in the same directory, clears restarts and returns unchanged revisions without message data", async () => {
    const { service, file, bind, home } = setup();
    service.configure(true);
    writeFileSync(file, assistant("first"));
    bind("one");
    const first = await service.read("one");
    expect(first.messages).toEqual([{ id: "reply:0", text: "first" }]);
    expect(first.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(first)).not.toContain(home);
    expect(await service.read("two")).toBeNull();
    expect(await service.read("one", first.revision)).toEqual({ revision: first.revision, messages: null });
    service.sessionEnvironment("one");
    expect(await service.read("one")).toBeNull();
    bind("one");
    service.forget("one");
    expect(await service.read("one")).toBeNull();
  });
  it("discards an in-flight read if its shell closes or preview is disabled", async () => {
    const { service, file, bind } = setup();
    service.configure(true);
    writeFileSync(file, assistant("old shell"));
    bind("one");
    const read = service.read("one");
    service.forget("one");
    expect(await read).toBeNull();
    bind("two");
    const second = service.read("two");
    service.configure(false);
    expect(await second).toBeNull();
  });
  it("rejects traversal, symlink escapes, non-jsonl and non-regular targets", async () => {
    const { service, home, file, bind } = setup();
    service.configure(true);
    const outside = path.join(home, "private.jsonl");
    writeFileSync(outside, assistant("must not leak"));
    bind("one", outside);
    await expect(service.read("one")).rejects.toThrow("执行记录不可用");
    symlinkSync(outside, file);
    bind("one");
    await expect(service.read("one")).rejects.toThrow("执行记录不可用");
    const directory = path.join(path.dirname(file), "folder.jsonl");
    mkdirSync(directory);
    bind("one", directory);
    await expect(service.read("one")).rejects.toThrow("执行记录不可用");
    const nonJsonl = path.join(path.dirname(file), "config.json");
    writeFileSync(nonJsonl, assistant("no"));
    bind("one", nonJsonl);
    await expect(service.read("one")).rejects.toThrow("执行记录不可用");
  });
  it("reads only the tail and complete records, preserving later messages after malformed lines", async () => {
    const { service, file, bind } = setup();
    service.configure(true);
    writeFileSync(file, `${assistant("old")}\n${"x".repeat(3 * 1024 * 1024)}\ninvalid\n${assistant("latest", "last")}{partial`);
    bind("one");
    expect((await service.read("one")).messages).toEqual([{ id: "last:0", text: "latest" }]);
    service.configure(false);
    expect(await service.read("one")).toBeNull();
  });
  it("does not expose user input, tools, reasoning or malformed records; caps assistant history", () => {
    const codex = JSON.stringify({ type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "codex" }, { type: "reasoning", text: "private" }] } });
    expect(parseTranscript(`invalid\n${codex}\n${JSON.stringify({ type: "assistant", message: { role: "user", content: [{ type: "text", text: "user" }] } })}\n`)).toEqual([{ id: "1:0", text: "codex" }]);
    expect(parseTranscript(Array.from({ length: 120 }, (_, i) => assistant(String(i), String(i))).join(""))).toHaveLength(100);
  });
  it("runs the installed hook without model output and makes it inert after disabling", () => {
    const { service, file, directory } = setup();
    service.configure(true);
    const token = service.sessionEnvironment("one").AURIS_TRANSCRIPT_TOKEN;
    const input = JSON.stringify({ hook_event_name: "SessionStart", transcript_path: file });
    const script = path.join(directory, "terminal-transcript-hook.cjs");
    const result = spawnSync(process.execPath, [script], { input, env: { ...process.env, AURIS_TRANSCRIPT_TOKEN: token }, encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(JSON.parse(readFileSync(path.join(directory, `${token}.json`), "utf8")).path).toBe(file);
    service.configure(false);
    spawnSync(process.execPath, [script], { input, env: { ...process.env, AURIS_TRANSCRIPT_TOKEN: token } });
    expect(readdirSync(directory)).not.toContain(`${token}.json`);
  });
});
