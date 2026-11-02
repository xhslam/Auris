"use strict";

const net = require("node:net");
const fs = require("node:fs");
const path = require("node:path");
const { EventEmitter } = require("node:events");

const {
  PROTOCOL_VERSION,
  MIN_COMPATIBLE_VERSION,
  isProtocolCompatible,
  formatNdjson,
  createNdjsonParser,
} = require("../terminal-daemon-protocol.cjs");
const {
  resolveTerminalDaemonPaths,
  ensureTerminalDaemonDirectories,
  cleanupStaleSocket,
  cleanupDaemonPid,
} = require("../terminal-daemon-paths.cjs");
const { createTerminalSessionManager } = require("../terminal-session-manager.cjs");
const { createTerminalAgentStatusService } = require("../terminal-agent-status-service.cjs");

const DEFAULT_MAX_BUFFER_LENGTH = 200_000;
const DEFAULT_BATCH_INTERVAL_MS = 8;
const DEFAULT_IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function createTerminalDaemonServer(options = {}) {
  const paths = options.paths ?? resolveTerminalDaemonPaths(options);
  const logger = options.logger ?? null;
  const appVersion = options.appVersion ?? "1.0.0";
  const protocolVersion = options.protocolVersion ?? PROTOCOL_VERSION;
  const minCompatibleVersion = options.minCompatibleVersion ?? MIN_COMPATIBLE_VERSION;
  const maxBufferLength = options.maxBufferLength ?? DEFAULT_MAX_BUFFER_LENGTH;
  const batchIntervalMs = options.batchIntervalMs ?? DEFAULT_BATCH_INTERVAL_MS;
  const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  const exitFn = options.exitFn ?? ((code) => process.exit(code));

  function log(msg) {
    logger?.(msg);
  }

  ensureTerminalDaemonDirectories(paths);

  // 1. Session Manager
  const sessionManager = createTerminalSessionManager({
    ...options.sessionManagerOptions,
    sessionEnvironment: (sessionId) => ({
      AURIS_AGENT_SOCKET: paths.agentSocketPath,
    }),
    logger: log,
  });

  // 2. Ring buffer per session
  const sessionBuffers = new Map(); // sessionId -> { chunks: Array<{ sequence, data }>, totalChars }

  function appendToBuffer(sessionId, data, sequence) {
    let buf = sessionBuffers.get(sessionId);
    if (!buf) {
      buf = { chunks: [], totalChars: 0 };
      sessionBuffers.set(sessionId, buf);
    }
    buf.chunks.push({ sequence, data });
    buf.totalChars += data.length;

    while (buf.totalChars > maxBufferLength && buf.chunks.length > 1) {
      const dropped = buf.chunks.shift();
      buf.totalChars -= dropped.data.length;
    }
  }

  // 3. Client connection management
  const attachedClients = new Set();
  let daemonServer = null;
  let agentStatusService = null;
  let idleTimer = null;
  let isShuttingDown = false;

  function checkIdleTimeout() {
    if (isShuttingDown) return;
    const activeSessions = sessionManager.listSessions();
    if (activeSessions.length === 0 && attachedClients.size === 0) {
      if (!idleTimer) {
        log(`terminal-daemon: starting idle timer (${idleTimeoutMs}ms)`);
        idleTimer = setTimeout(() => {
          log("terminal-daemon: idle timeout reached with no sessions and no clients. Exiting.");
          stop().then(() => exitFn(0)).catch(() => exitFn(0));
        }, idleTimeoutMs);
      }
    } else {
      if (idleTimer) {
        log("terminal-daemon: cancelling idle timer; active sessions or clients present");
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    }
  }

  // 4. Batching data output for clients
  const pendingBatches = new Map(); // sessionId -> string
  const pendingSequences = new Map(); // sessionId -> number
  const batchTimers = new Map(); // sessionId -> NodeJS.Timeout

  function flushBatch(sessionId) {
    if (batchTimers.has(sessionId)) {
      clearTimeout(batchTimers.get(sessionId));
      batchTimers.delete(sessionId);
    }
    const data = pendingBatches.get(sessionId);
    const sequence = pendingSequences.get(sessionId);
    pendingBatches.delete(sessionId);
    pendingSequences.delete(sessionId);

    if (data && attachedClients.size > 0) {
      const eventMsg = formatNdjson({
        type: "event",
        event: "data",
        payload: { sessionId, data, sequence },
      });
      for (const client of attachedClients) {
        if (client.isHandshakeDone) {
          try {
            client.socket.write(eventMsg);
          } catch (err) {
            log(`terminal-daemon: client write error ${err?.message || err}`);
          }
        }
      }
    }
  }

  // Hook session manager events
  sessionManager.onData((payload) => {
    const { sessionId, data, sequence } = payload;
    appendToBuffer(sessionId, data, sequence);

    if (attachedClients.size > 0) {
      const current = pendingBatches.get(sessionId) || "";
      pendingBatches.set(sessionId, current + data);
      pendingSequences.set(sessionId, sequence);

      if (!batchTimers.has(sessionId)) {
        const timer = setTimeout(() => flushBatch(sessionId), batchIntervalMs);
        batchTimers.set(sessionId, timer);
      }
    }
  });

  sessionManager.onExit((payload) => {
    flushBatch(payload.sessionId);
    const eventMsg = formatNdjson({
      type: "event",
      event: "exit",
      payload,
    });
    for (const client of attachedClients) {
      if (client.isHandshakeDone) {
        try {
          client.socket.write(eventMsg);
        } catch {
          /* ignore */
        }
      }
    }
    checkIdleTimeout();
  });

  sessionManager.onAgentState((payload) => {
    const eventMsg = formatNdjson({
      type: "event",
      event: "agent-state",
      payload,
    });
    for (const client of attachedClients) {
      if (client.isHandshakeDone) {
        try {
          client.socket.write(eventMsg);
        } catch {
          /* ignore */
        }
      }
    }
  });

  // 5. Handling client requests
  function handleClientRequest(client, req) {
    const { id, type } = req;
    if (!id || typeof type !== "string") return;

    function reply(result) {
      try {
        client.socket.write(formatNdjson({ id, ok: true, result }));
      } catch (err) {
        log(`terminal-daemon: reply error: ${err?.message || err}`);
      }
    }

    function replyError(err) {
      try {
        client.socket.write(formatNdjson({ id, ok: false, error: err?.message || String(err) }));
      } catch {
        /* ignore */
      }
    }

    try {
      switch (type) {
        case "hello": {
          const clientVer = req.protocolVersion;
          const clientMin = req.minCompatibleVersion;
          const compatible = isProtocolCompatible(
            clientVer,
            clientMin,
            protocolVersion,
            minCompatibleVersion
          );

          client.isHandshakeDone = true;
          const activeSessions = sessionManager.listSessions();
          const waitingCount = activeSessions.filter((s) => s.agentState === "waiting").length;

          reply({
            protocolVersion,
            minCompatibleVersion,
            appVersion,
            daemonPid: process.pid,
            compatible,
            activeSessionsCount: activeSessions.length,
            waitingSessionsCount: waitingCount,
          });
          break;
        }

        case "create": {
          const record = sessionManager.createSession(req.input);
          checkIdleTimeout();
          reply(record);
          break;
        }

        case "list": {
          const sessions = sessionManager.listSessions();
          reply(sessions);
          break;
        }

        case "resume": {
          const { sessionId, fromSequence } = req;
          const existing =
            sessionManager.listSessions().find((s) => s.id === sessionId) ||
            sessionManager.getEndedSession(sessionId);

          if (!existing) {
            throw new Error(`Session ${sessionId} not found`);
          }

          client.attachedSessions.add(sessionId);

          // Calculate replayed output
          let replayedData = "";
          const buf = sessionBuffers.get(sessionId);

          if (typeof fromSequence === "number" && fromSequence > 0 && buf) {
            const newerChunks = buf.chunks.filter((c) => c.sequence > fromSequence);
            if (newerChunks.length > 0) {
              replayedData = newerChunks.map((c) => c.data).join("");
            } else if (buf.chunks.length > 0 && buf.chunks[0].sequence > fromSequence) {
              // History before buffer was lost; replay full available output
              replayedData = existing.output || "";
            }
          } else {
            replayedData = existing.output || "";
          }

          reply({
            session: existing,
            replayedData,
            currentSequence: existing.outputSequence || 0,
          });

          // v1 已知折中：重放完成后对运行中的会话做一次 resize 微调再还原 (cols-1 等待约 100ms 再 cols)
          // 触发 TUI 程序重绘，避免缓冲被截断在转义序列中间造成花屏。2b 会使用 headless 序列化替代。
          // 间隔约 100ms 避免两次连续 SIGWINCH 被系统或 TUI 事件循环合并为无变化。
          if (existing.backend === "pty") {
            const originalCols = existing.cols || 80;
            const originalRows = existing.rows || 24;
            if (originalCols > 2) {
              try {
                sessionManager.resize(sessionId, { cols: originalCols - 1, rows: originalRows });
                setTimeout(() => {
                  try {
                    sessionManager.resize(sessionId, { cols: originalCols, rows: originalRows });
                  } catch {
                    /* ignore */
                  }
                }, 100);
              } catch {
                /* ignore */
              }
            }
          }
          break;
        }

        case "write": {
          sessionManager.write(req.sessionId, req.data);
          reply(true);
          break;
        }

        case "resize": {
          sessionManager.resize(req.sessionId, { cols: req.cols, rows: req.rows });
          reply(true);
          break;
        }

        case "kill": {
          sessionManager.kill(req.sessionId);
          checkIdleTimeout();
          reply(true);
          break;
        }

        case "killAll": {
          sessionManager.killAll();
          checkIdleTimeout();
          reply(true);
          break;
        }

        case "rename": {
          sessionManager.renameSession(req.sessionId, req.title);
          reply(true);
          break;
        }

        case "clearUnread": {
          sessionManager.clearUnread(req.sessionId);
          reply(true);
          break;
        }

        case "shutdown": {
          const mode = req.mode || "if-empty";
          const running = sessionManager.listSessions();

          if (mode === "force") {
            sessionManager.killAll();
            reply({ shuttingDown: true, runningCount: 0 });
            setImmediate(() => {
              stop().then(() => exitFn(0)).catch(() => exitFn(0));
            });
          } else {
            // "if-empty" mode
            if (running.length === 0) {
              reply({ shuttingDown: true, runningCount: 0 });
              setImmediate(() => {
                stop().then(() => exitFn(0)).catch(() => exitFn(0));
              });
            } else {
              reply({ shuttingDown: false, runningCount: running.length });
            }
          }
          break;
        }

        default:
          replyError(new Error(`Unknown request type: ${type}`));
          break;
      }
    } catch (err) {
      replyError(err);
    }
  }

  // 6. Start listening
  async function start() {
    // Start agent status service on fixed agent.sock
    agentStatusService = createTerminalAgentStatusService({
      socketPath: paths.agentSocketPath,
      platform: paths.platform,
      logger: log,
    });
    agentStatusService.onEvent((event) => {
      try {
        sessionManager.handleAgentHookEvent(event);
      } catch (err) {
        log(`terminal-daemon: agent-hook dispatch error ${err?.message || err}`);
      }
    });
    await agentStatusService.start();

    // Ensure 0600 on agent.sock
    if (paths.platform !== "win32") {
      try {
        if (fs.existsSync(paths.agentSocketPath)) {
          fs.chmodSync(paths.agentSocketPath, 0o600);
        }
      } catch {
        /* ignore */
      }
    }

    // Start daemon socket server on daemon.sock
    cleanupStaleSocket(paths.daemonSocketPath, paths.platform);

    daemonServer = net.createServer((socket) => {
      const client = {
        socket,
        id: `client-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        attachedSessions: new Set(),
        isHandshakeDone: false,
      };
      attachedClients.add(client);
      checkIdleTimeout();

      const parser = createNdjsonParser(
        (msg) => handleClientRequest(client, msg),
        (err) => log(`terminal-daemon: parse error ${err?.message || err}`)
      );

      socket.on("data", (chunk) => parser.feed(chunk));
      socket.on("error", (err) => {
        log(`terminal-daemon: client socket error ${err?.message || err}`);
      });
      socket.on("close", () => {
        attachedClients.delete(client);
        checkIdleTimeout();
      });
    });

    await new Promise((resolve, reject) => {
      daemonServer.on("error", reject);
      daemonServer.listen(paths.daemonSocketPath, () => {
        if (paths.platform !== "win32") {
          try {
            fs.chmodSync(paths.daemonSocketPath, 0o600);
          } catch {
            /* ignore */
          }
        }
        resolve();
      });
    });

    log(`terminal-daemon: server listening on ${paths.daemonSocketPath}`);
    checkIdleTimeout();
    return paths.daemonSocketPath;
  }

  async function stop() {
    isShuttingDown = true;
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    for (const timer of batchTimers.values()) {
      clearTimeout(timer);
    }
    batchTimers.clear();

    if (agentStatusService) {
      try {
        agentStatusService.stop();
      } catch {
        /* ignore */
      }
      agentStatusService = null;
    }

    if (daemonServer) {
      for (const client of attachedClients) {
        try {
          client.socket.destroy();
        } catch {
          /* ignore */
        }
      }
      attachedClients.clear();

      await new Promise((resolve) => {
        daemonServer.close(() => resolve());
      });
      daemonServer = null;
    }

    cleanupStaleSocket(paths.daemonSocketPath, paths.platform);
    cleanupStaleSocket(paths.agentSocketPath, paths.platform);
    cleanupDaemonPid(paths);
  }

  return {
    start,
    stop,
    sessionManager,
    paths,
    getAttachedClientsCount: () => attachedClients.size,
  };
}

module.exports = {
  createTerminalDaemonServer,
};
