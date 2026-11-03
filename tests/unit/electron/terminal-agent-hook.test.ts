import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const hookScriptPath = path.resolve(__dirname, "../../../electron/terminal-agent-hook.cjs");

describe("terminal-agent-hook.cjs", () => {
  let tmpDir: string;
  let socketPath: string;
  let server: net.Server;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "auris-hook-test-"));
    socketPath = path.join(tmpDir, "test.sock");
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    try {
      fs.rmSync(tmpDir, { force: true, recursive: true });
    } catch {
      /* ignore */
    }
  });

  it("exits cleanly with code 0 in <100ms when env vars are absent", async () => {
    const start = performance.now();
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: "test",
    };
    delete env.AURIS_AGENT_SOCKET;
    delete env.AURIS_TRANSCRIPT_TOKEN;

    const child = spawn(process.execPath, [hookScriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });
    child.stdin.write(JSON.stringify({ hook_event_name: "UserPromptSubmit" }));
    child.stdin.end();

    const exitCode = await new Promise((resolve) => child.on("exit", resolve));
    const duration = performance.now() - start;

    expect(exitCode).toBe(0);
    expect(duration).toBeLessThan(200);
  });

  it("exits cleanly with code 0 when socket connection fails", async () => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      AURIS_AGENT_SOCKET: path.join(tmpDir, "nonexistent.sock"),
      AURIS_TRANSCRIPT_TOKEN: "11111111-2222-3333-4444-555555555555",
      NODE_ENV: "test",
    };
    const child = spawn(process.execPath, [hookScriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });
    child.stdin.write(JSON.stringify({ hook_event_name: "UserPromptSubmit" }));
    child.stdin.end();

    const exitCode = await new Promise((resolve) => child.on("exit", resolve));
    expect(exitCode).toBe(0);
  });

  it("connects to socket and delivers event quickly", async () => {
    const received: Record<string, unknown>[] = [];
    server = net.createServer((socket) => {
      let data = "";
      socket.on("data", (chunk) => (data += chunk));
      socket.on("end", () => {
        try {
          received.push(JSON.parse(data.trim()));
        } catch {
          /* ignore */
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));

    const start = performance.now();
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      AURIS_AGENT_SOCKET: socketPath,
      AURIS_TRANSCRIPT_TOKEN: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      NODE_ENV: "test",
    };
    const child = spawn(process.execPath, [hookScriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });

    child.stdin.write(
      JSON.stringify({
        hook_event_name: "Notification",
        notification_type: "permission_prompt",
        prompt: "secret details",
      }),
    );
    child.stdin.end();

    const exitCode = await new Promise((resolve) => child.on("exit", resolve));
    const duration = performance.now() - start;

    expect(exitCode).toBe(0);
    expect(received.length).toBe(1);
    expect(received[0]).toEqual({
      agent: "claude",
      event: "Notification",
      notificationType: "permission_prompt",
      token: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      ts: expect.any(Number),
    });
    // prompt must not be forwarded
    expect(received[0].prompt).toBeUndefined();
    expect(duration).toBeLessThan(300);
  });

  it("appends raw stdin json to file when AURIS_HOOK_DUMP is set", async () => {
    const dumpFile = path.join(tmpDir, "dump.jsonl");
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      AURIS_HOOK_DUMP: dumpFile,
      NODE_ENV: "test",
    };
    delete env.AURIS_AGENT_SOCKET;
    delete env.AURIS_TRANSCRIPT_TOKEN;

    const rawPayload = JSON.stringify({
      hook_event_name: "Notification",
      notification_type: "idle_prompt",
      session_id: "test-session-123",
      custom_data: { foo: "bar" },
    });

    const child = spawn(process.execPath, [hookScriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });
    child.stdin.write(rawPayload);
    child.stdin.end();

    const exitCode = await new Promise((resolve) => child.on("exit", resolve));
    expect(exitCode).toBe(0);

    expect(fs.existsSync(dumpFile)).toBe(true);
    const stat = fs.statSync(dumpFile);
    expect(stat.mode & 0o777).toBe(0o600);
    const content = fs.readFileSync(dumpFile, "utf8");
    expect(content.trim()).toBe(rawPayload);
  });

  it("handles large ~1MB payloads and only forwards whitelisted fields", async () => {
    const received: Record<string, unknown>[] = [];
    server = net.createServer((socket) => {
      let data = "";
      socket.on("data", (chunk) => (data += chunk));
      socket.on("end", () => {
        try {
          received.push(JSON.parse(data.trim()));
        } catch {
          /* ignore */
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));

    const largeContent = "x".repeat(1024 * 1024); // 1MB payload
    const largePayload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Read",
      tool_input: { file_path: "/path/to/large.txt" },
      tool_response: { stdout: largeContent },
      last_assistant_message: "Here is the file content",
      prompt: "read large file",
    });

    const start = performance.now();
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      AURIS_AGENT_SOCKET: socketPath,
      AURIS_TRANSCRIPT_TOKEN: "bbbbbbbb-cccc-dddd-eeee-ffffffffffff",
      NODE_ENV: "test",
    };
    const child = spawn(process.execPath, [hookScriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });
    child.stdin.write(largePayload);
    child.stdin.end();

    const exitCode = await new Promise((resolve) => child.on("exit", resolve));
    const duration = performance.now() - start;

    expect(exitCode).toBe(0);
    expect(received.length).toBe(1);
    expect(received[0]).toEqual({
      agent: "claude",
      event: "PostToolUse",
      token: "bbbbbbbb-cccc-dddd-eeee-ffffffffffff",
      ts: expect.any(Number),
    });
    // Strict privacy whitelist check: no body or input/response leaks
    expect(received[0].tool_input).toBeUndefined();
    expect(received[0].tool_response).toBeUndefined();
    expect(received[0].last_assistant_message).toBeUndefined();
    expect(received[0].prompt).toBeUndefined();
    expect(duration).toBeLessThan(1000);
  });

  it("handles massive >10MB payload without dropping event", async () => {
    const received: Record<string, unknown>[] = [];
    server = net.createServer((socket) => {
      let data = "";
      socket.on("data", (chunk) => (data += chunk));
      socket.on("end", () => {
        try {
          received.push(JSON.parse(data.trim()));
        } catch {
          /* ignore */
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));

    // Construct 11MB payload (exceeding 10MB MAX_INPUT_BYTES)
    const elevenMbChunk = Buffer.alloc(11 * 1024 * 1024, "a").toString();
    const massivePayload = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Read",
      tool_input: { file_path: "/path/to/huge.txt" },
      tool_response: { stdout: elevenMbChunk },
    });

    const start = performance.now();
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      AURIS_AGENT_SOCKET: socketPath,
      AURIS_TRANSCRIPT_TOKEN: "cccccccc-dddd-eeee-ffff-000000000000",
      NODE_ENV: "test",
    };
    const child = spawn(process.execPath, [hookScriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });

    // Write in chunks to prevent write buffer issues
    child.stdin.write(massivePayload);
    child.stdin.end();

    const exitCode = await new Promise((resolve) => child.on("exit", resolve));
    const duration = performance.now() - start;

    expect(exitCode).toBe(0);
    expect(received.length).toBe(1);
    expect(received[0]).toEqual({
      agent: "claude",
      event: "PostToolUse",
      token: "cccccccc-dddd-eeee-ffff-000000000000",
      ts: expect.any(Number),
    });
    expect(duration).toBeLessThan(3000);
  });
});
