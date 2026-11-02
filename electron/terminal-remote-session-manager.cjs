"use strict";

const net = require("node:net");
const { EventEmitter } = require("node:events");

const {
  PROTOCOL_VERSION,
  MIN_COMPATIBLE_VERSION,
  formatNdjson,
  createNdjsonParser,
} = require("./terminal-daemon-protocol.cjs");
const { ensureDaemonRunning } = require("./terminal-daemon-launcher.cjs");
const { resolveTerminalDaemonPaths } = require("./terminal-daemon-paths.cjs");

function createRemoteTerminalSessionManager(options = {}) {
  const paths = options.paths ?? resolveTerminalDaemonPaths(options);
  const logger = options.logger ?? null;
  const appVersion = options.appVersion ?? "1.0.0";
  const onSessionRemoved = options.onSessionRemoved ?? null;

  function log(msg) {
    logger?.(msg);
  }

  const emitter = new EventEmitter();
  let clientSocket = null;
  let isConnecting = false;
  let isDisposed = false;
  let nextReqId = 1;
  const pendingRequests = new Map(); // id -> { resolve, reject, timer }
  const cachedSessions = new Map(); // id -> sessionRecord
  const endedSessions = new Map(); // id -> sessionRecord

  const daemonStatus = {
    connected: false,
    protocolCompatible: true,
    daemonAppVersion: null,
    daemonProtocolVersion: null,
    activeSessionsCount: 0,
    waitingSessionsCount: 0,
    needsUpgrade: false,
  };

  function sendRequest(type, payload = {}, timeoutMs = 5000) {
    if (!clientSocket || clientSocket.destroyed) {
      return Promise.reject(new Error("Daemon is not connected"));
    }

    const id = `req-${nextReqId++}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRequests.delete(id);
        reject(new Error(`Daemon request timed out: ${type} (${timeoutMs}ms)`));
      }, timeoutMs);

      pendingRequests.set(id, { resolve, reject, timer });

      const msg = formatNdjson({ id, type, ...payload });
      clientSocket.write(msg, "utf8", (err) => {
        if (err) {
          clearTimeout(timer);
          pendingRequests.delete(id);
          reject(err);
        }
      });
    });
  }

  function handleServerMessage(msg) {
    if (!msg || typeof msg !== "object") return;

    // 1. Response to a pending request
    if (msg.id && pendingRequests.has(msg.id)) {
      const { resolve, reject, timer } = pendingRequests.get(msg.id);
      clearTimeout(timer);
      pendingRequests.delete(msg.id);

      if (msg.ok) {
        resolve(msg.result);
      } else {
        reject(new Error(msg.error || "Daemon request failed"));
      }
      return;
    }

    // 2. Push event
    if (msg.type === "event" && msg.event && msg.payload) {
      const { event, payload } = msg;
      switch (event) {
        case "data": {
          const session = cachedSessions.get(payload.sessionId);
          if (session) {
            session.output = `${session.output ?? ""}${payload.data}`.slice(-200_000);
            session.outputSequence = payload.sequence;
          }
          emitter.emit("data", payload);
          break;
        }

        case "exit": {
          const session = cachedSessions.get(payload.sessionId);
          if (session) {
            cachedSessions.delete(payload.sessionId);
            endedSessions.set(payload.sessionId, { ...session, ...payload });
            if (endedSessions.size > 50) {
              endedSessions.delete(endedSessions.keys().next().value);
            }
          }
          onSessionRemoved?.(payload.sessionId);
          emitter.emit("exit", payload);
          break;
        }

        case "agent-state": {
          const session = cachedSessions.get(payload.sessionId);
          if (session) {
            session.agentState = payload.agentState;
            session.agentStateUpdatedAt = payload.agentStateUpdatedAt;
            session.agentKind = payload.agentKind;
            session.unread = payload.unread;
          }
          emitter.emit("agent-state", payload);
          break;
        }
      }
    }
  }

  async function connect() {
    if (isDisposed || isConnecting) return;
    isConnecting = true;

    try {
      const { socketPath } = await ensureDaemonRunning({
        paths,
        logger: log,
        appVersion,
      });

      const socket = net.connect(socketPath);

      await new Promise((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("error", reject);
      });

      clientSocket = socket;
      const parser = createNdjsonParser(
        handleServerMessage,
        (err) => log(`terminal-remote: parser error ${err?.message || err}`)
      );

      socket.on("data", (chunk) => parser.feed(chunk));
      socket.on("error", (err) => {
        log(`terminal-remote: socket error ${err?.message || err}`);
      });
      socket.on("close", () => {
        log("terminal-remote: daemon socket closed");
        clientSocket = null;
        daemonStatus.connected = false;
        emitter.emit("daemon-status", { ...daemonStatus });

        // Reject all in-flight requests
        for (const [id, req] of pendingRequests.entries()) {
          clearTimeout(req.timer);
          req.reject(new Error("Daemon socket disconnected"));
        }
        pendingRequests.clear();

        if (!isDisposed) {
          // Attempt auto-reconnect after backoff
          setTimeout(() => {
            connect().catch(() => {});
          }, 1500);
        }
      });

      // Perform handshake
      const helloResult = await sendRequest("hello", {
        protocolVersion: PROTOCOL_VERSION,
        minCompatibleVersion: MIN_COMPATIBLE_VERSION,
        appVersion,
        clientPid: process.pid,
      });

      daemonStatus.daemonAppVersion = helloResult.appVersion;
      daemonStatus.daemonProtocolVersion = helloResult.protocolVersion;
      daemonStatus.activeSessionsCount = helloResult.activeSessionsCount;
      daemonStatus.waitingSessionsCount = helloResult.waitingSessionsCount;

      if (!helloResult.compatible) {
        log(`terminal-remote: protocol mismatch. Client: v${PROTOCOL_VERSION}, Server: v${helloResult.protocolVersion}`);
        if (helloResult.activeSessionsCount === 0) {
          log("terminal-remote: 0 active sessions on outdated daemon; forcing shutdown and restart...");
          try {
            await sendRequest("shutdown", { mode: "force" });
          } catch {
            /* ignore */
          }
          socket.destroy();
          clientSocket = null;
          isConnecting = false;
          return connect();
        } else {
          daemonStatus.needsUpgrade = true;
          daemonStatus.protocolCompatible = false;
          daemonStatus.connected = true;
          emitter.emit("daemon-status", { ...daemonStatus });
        }
      } else {
        daemonStatus.connected = true;
        daemonStatus.protocolCompatible = true;
        daemonStatus.needsUpgrade = false;
        emitter.emit("daemon-status", { ...daemonStatus });
      }

      // Sync sessions from daemon
      const sessions = await sendRequest("list");
      cachedSessions.clear();
      for (const s of sessions) {
        cachedSessions.set(s.id, s);
      }

      log(`terminal-remote: connected and synced ${sessions.length} sessions`);
    } catch (err) {
      log(`terminal-remote: connect failed: ${err?.message || err}`);
      daemonStatus.connected = false;
      emitter.emit("daemon-status", { ...daemonStatus });
      throw err;
    } finally {
      isConnecting = false;
    }
  }

  async function ensureConnected() {
    if (!clientSocket || clientSocket.destroyed) {
      await connect();
    }
  }

  // Session Manager API
  return {
    connect,
    ensureConnected,

    createSession: async (input) => {
      await ensureConnected();
      const record = await sendRequest("create", { input });
      cachedSessions.set(record.id, record);
      return record;
    },

    listSessions: () => {
      // Sync list query; returns local cache immediately
      return [...cachedSessions.values()];
    },

    fetchSessions: async () => {
      await ensureConnected();
      const sessions = await sendRequest("list");
      cachedSessions.clear();
      for (const s of sessions) {
        cachedSessions.set(s.id, s);
      }
      return sessions;
    },

    resumeSession: async (input) => {
      await ensureConnected();
      const sessionId = typeof input === "object" ? input.sessionId : input;
      const fromSequence = typeof input === "object" ? input.fromSequence : 0;
      const result = await sendRequest("resume", { sessionId, fromSequence });
      if (result.session) {
        cachedSessions.set(sessionId, result.session);
      }
      return result;
    },

    write: (sessionId, data) => {
      if (clientSocket && !clientSocket.destroyed) {
        sendRequest("write", { sessionId, data }).catch((err) => {
          log(`terminal-remote: write error: ${err?.message || err}`);
        });
      }
    },

    resize: (sessionId, size) => {
      if (clientSocket && !clientSocket.destroyed) {
        sendRequest("resize", { sessionId, cols: size?.cols, rows: size?.rows }).catch((err) => {
          log(`terminal-remote: resize error: ${err?.message || err}`);
        });
      }
    },

    kill: (sessionId) => {
      cachedSessions.delete(sessionId);
      onSessionRemoved?.(sessionId);
      if (clientSocket && !clientSocket.destroyed) {
        sendRequest("kill", { sessionId }).catch((err) => {
          log(`terminal-remote: kill error: ${err?.message || err}`);
        });
      }
    },

    killAll: () => {
      cachedSessions.clear();
      if (clientSocket && !clientSocket.destroyed) {
        sendRequest("killAll").catch((err) => {
          log(`terminal-remote: killAll error: ${err?.message || err}`);
        });
      }
    },

    renameSession: (sessionId, title) => {
      const session = cachedSessions.get(sessionId);
      if (session) {
        session.customTitle = title;
      }
      if (clientSocket && !clientSocket.destroyed) {
        sendRequest("rename", { sessionId, title }).catch((err) => {
          log(`terminal-remote: rename error: ${err?.message || err}`);
        });
      }
    },

    clearUnread: (sessionId) => {
      const session = cachedSessions.get(sessionId);
      if (session) {
        session.unread = false;
      }
      if (clientSocket && !clientSocket.destroyed) {
        sendRequest("clearUnread", { sessionId }).catch((err) => {
          log(`terminal-remote: clearUnread error: ${err?.message || err}`);
        });
      }
    },

    shutdownIfEmpty: async () => {
      if (clientSocket && !clientSocket.destroyed) {
        return sendRequest("shutdown", { mode: "if-empty" });
      }
      return { shuttingDown: false };
    },

    shutdownForce: async () => {
      if (clientSocket && !clientSocket.destroyed) {
        return sendRequest("shutdown", { mode: "force" });
      }
      return { shuttingDown: true };
    },

    upgradeDaemonNow: async () => {
      log("terminal-remote: user requested immediate daemon upgrade");
      try {
        await sendRequest("shutdown", { mode: "force" });
      } catch {
        /* ignore */
      }
      if (clientSocket) {
        clientSocket.destroy();
        clientSocket = null;
      }
      await connect();
    },

    getEndedSession: (sessionId) => {
      return endedSessions.get(sessionId) || null;
    },

    getDaemonStatus: () => ({ ...daemonStatus }),

    handleAgentHookEvent: (_event) => {
      // Daemon listens directly on agent.sock, so this is a no-op fallback
    },

    onData: (callback) => {
      emitter.on("data", callback);
      return () => emitter.off("data", callback);
    },

    onExit: (callback) => {
      emitter.on("exit", callback);
      return () => emitter.off("exit", callback);
    },

    onAgentState: (callback) => {
      emitter.on("agent-state", callback);
      return () => emitter.off("agent-state", callback);
    },

    onDaemonStatus: (callback) => {
      emitter.on("daemon-status", callback);
      return () => emitter.off("daemon-status", callback);
    },

    dispose: () => {
      isDisposed = true;
      if (clientSocket) {
        clientSocket.destroy();
        clientSocket = null;
      }
      pendingRequests.clear();
      cachedSessions.clear();
      emitter.removeAllListeners();
    },
  };
}

module.exports = {
  createRemoteTerminalSessionManager,
};
