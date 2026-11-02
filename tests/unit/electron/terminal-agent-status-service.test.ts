import { createRequire } from "node:module";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  createTerminalAgentStatusService,
  resolveSocketPath,
  cleanStaleSockets,
  sanitizeAgentEvent,
} = require("../../../electron/terminal-agent-status-service.cjs");

describe("terminal-agent-status-service", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "auris-agent-test-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { force: true, recursive: true });
    } catch {
      /* ignore */
    }
  });

  it("resolves short socket path under run directory", () => {
    const socketPath = resolveSocketPath({
      home: tmpDir,
      pid: 12345,
      platform: "darwin",
    });
    expect(socketPath).toBe(path.join(tmpDir, ".auris", "run", "agent-12345.sock"));
    expect(socketPath.length).toBeLessThan(104);
  });

  it("sanitizes agent event strictly and strips unexpected content", () => {
    expect(sanitizeAgentEvent(null)).toBeNull();
    expect(sanitizeAgentEvent({})).toBeNull();
    expect(sanitizeAgentEvent({ token: "not-a-uuid", agent: "claude", event: "UserPromptSubmit" })).toBeNull();

    const valid = sanitizeAgentEvent({
      agent: "Claude",
      event: "Notification",
      notificationType: "permission_prompt",
      prompt: "SECRET PROMPT",
      token: "12345678-1234-1234-1234-123456789abc",
      ts: 1700000000000,
    });

    expect(valid).toEqual({
      agent: "claude",
      event: "Notification",
      notificationType: "permission_prompt",
      token: "12345678-1234-1234-1234-123456789abc",
      ts: 1700000000000,
    });
    expect((valid as { prompt?: unknown }).prompt).toBeUndefined();
  });

  it("starts socket server, receives payload, emits event and cleans up on stop", async () => {
    const runDir = path.join(tmpDir, "run");
    const service = createTerminalAgentStatusService({
      pid: process.pid,
      platform: process.platform,
      runDir,
    });

    const received: any[] = [];
    service.onEvent((evt: any) => received.push(evt));

    const socketPath = await service.start();
    expect(fs.existsSync(socketPath)).toBe(true);

    // Connect and send an event
    await new Promise<void>((resolve, reject) => {
      const client = net.createConnection(socketPath, () => {
        client.write(
          JSON.stringify({
            agent: "claude",
            event: "UserPromptSubmit",
            token: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            ts: Date.now(),
          }) + "\n",
        );
        client.end();
      });
      client.on("close", () => resolve());
      client.on("error", reject);
    });

    expect(received.length).toBe(1);
    expect(received[0].event).toBe("UserPromptSubmit");
    expect(received[0].token).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");

    await service.stop();
    if (process.platform !== "win32") {
      expect(fs.existsSync(socketPath)).toBe(false);
    }
  });

  it("cleans dead socket files and leaves active ones untouched", () => {
    const runDir = path.join(tmpDir, "run");
    fs.mkdirSync(runDir, { recursive: true });
    const deadSocket = path.join(runDir, "agent-9999999.sock");
    const liveSocket = path.join(runDir, `agent-${process.pid}.sock`);
    fs.writeFileSync(deadSocket, "");
    fs.writeFileSync(liveSocket, "");

    cleanStaleSockets(runDir, 1);
    expect(fs.existsSync(deadSocket)).toBe(false);
    expect(fs.existsSync(liveSocket)).toBe(true);
  });
});
