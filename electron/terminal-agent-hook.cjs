#!/usr/bin/env node
"use strict";

const net = require("node:net");

const token = process.env.AURIS_TRANSCRIPT_TOKEN;
const socketPath = process.env.AURIS_AGENT_SOCKET;
const dumpPath = process.env.AURIS_HOOK_DUMP;

if (!dumpPath && (!token || !socketPath || !/^[a-f0-9-]{36}$/i.test(token))) {
  process.exit(0);
}

let input = "";
let truncated = false;
process.stdin.setEncoding("utf8");

const MAX_INPUT_BYTES = 10 * 1024 * 1024; // 10MB to accommodate large tool payloads (e.g. Read)

process.stdin.on("data", (chunk) => {
  if (input.length < MAX_INPUT_BYTES) {
    const remaining = MAX_INPUT_BYTES - input.length;
    input += chunk.slice(0, remaining);
    if (chunk.length > remaining) {
      truncated = true;
    }
  } else {
    truncated = true;
  }
});

process.stdin.on("end", () => {
  if (dumpPath) {
    try {
      const fsSync = require("node:fs");
      const exists = fsSync.existsSync(dumpPath);
      fsSync.appendFileSync(dumpPath, input.endsWith("\n") ? input : input + "\n", {
        encoding: "utf8",
        mode: 0o600,
      });
      if (!exists) {
        try {
          fsSync.chmodSync(dumpPath, 0o600);
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (!token || !socketPath || !/^[a-f0-9-]{36}$/i.test(token)) {
    process.exit(0);
  }
  let eventName = "";
  let notificationType;

  if (!truncated) {
    try {
      const parsed = JSON.parse(input);
      if (parsed && typeof parsed === "object") {
        eventName = typeof parsed.hook_event_name === "string" ? parsed.hook_event_name : "";
        if (typeof parsed.notification_type === "string") {
          notificationType = parsed.notification_type;
        }
      }
    } catch {
      /* fall through to regex */
    }
  }

  // If truncated or JSON.parse failed, extract event from buffered text via regex
  if (!eventName) {
    const matchEvent = input.match(/"hook_event_name"\s*:\s*"([^"]+)"/);
    if (matchEvent && matchEvent[1]) {
      eventName = matchEvent[1];
    }
    const matchType = input.match(/"notification_type"\s*:\s*"([^"]+)"/);
    if (matchType && matchType[1]) {
      notificationType = matchType[1];
    }
  }

  // Fallback for massive payloads exceeding 10MB if event name could not be parsed:
  // massive payloads are virtually always PostToolUse (e.g. Read large file/stream)
  if (!eventName && truncated) {
    eventName = "PostToolUse";
  }

  if (!eventName) {
    process.exit(0);
  }

  const payload = JSON.stringify({
    agent: "claude",
    event: eventName,
    ...(notificationType ? { notificationType } : {}),
    token,
    ts: Date.now(),
  });

  let client;
  let timer;

  const exitCleanly = () => {
    if (timer) clearTimeout(timer);
    try {
      if (client) client.destroy();
    } catch {
      /* ignore */
    }
    process.exit(0);
  };

  timer = setTimeout(exitCleanly, 300);

  try {
    client = net.createConnection(socketPath, () => {
      client.write(payload + "\n", () => {
        exitCleanly();
      });
    });
  } catch {
    exitCleanly();
  }

  client.on("error", exitCleanly);
});
