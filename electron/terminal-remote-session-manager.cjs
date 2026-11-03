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
  let connectPromise = null;
  let cancelConnect = null;
  let reconnectTimer = null;
  let upgradePromise = null;
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
    const socket = clientSocket;
    if (isDisposed) return Promise.reject(new Error("Terminal manager is disposed"));
    if (!socket || socket.destroyed) {
      return Promise.reject(new Error("Daemon is not connected"));
    }

    const id = `req-${nextReqId++}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRequests.delete(id);
        reject(new Error(`Daemon request timed out: ${type} (${timeoutMs}ms)`));
      }, timeoutMs);

      pendingRequests.set(id, { resolve, reject, timer, socket });

      const msg = formatNdjson({ id, type, ...payload });
      function fail(err) {
        clearTimeout(timer);
        pendingRequests.delete(id);
        reject(err);
      }
      try {
        socket.write(msg, "utf8", (err) => { if (err) fail(err); });
      } catch (err) {
        fail(err);
      }
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

  function assertActive() {
    if (isDisposed) throw new Error("Terminal manager is disposed");
  }

  function clearReconnectTimer() {
    if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  function rejectRequests(socket, error) {
    for (const [id, request] of pendingRequests) {
      if (!socket || request.socket === socket) {
        clearTimeout(request.timer);
        pendingRequests.delete(id);
        request.reject(error);
      }
    }
  }

  function dropSocket(socket, error) {
    if (!socket) return;
    // Retire ownership before destroy: a delayed close must not invalidate
    // the next socket, reject its requests, or schedule a second reconnect.
    if (clientSocket === socket) {
      clientSocket = null;
      daemonStatus.connected = false;
    }
    rejectRequests(socket, error);
    socket.destroy();
  }

  async function establishConnection(cancellation) {
    const wait = (operation) => Promise.race([operation, cancellation]);
    // One automatic daemon replacement per connection operation. A daemon
    // that remains incompatible must fail rather than recurse indefinitely.
    for (let upgradeAttempt = 0; upgradeAttempt <= 1; upgradeAttempt++) {
      assertActive();
      const { socketPath } = await wait(ensureDaemonRunning({ paths, logger: log, appVersion }));
      assertActive();
      const socket = net.connect(socketPath);
      clientSocket = socket;
      const parser = createNdjsonParser(
        (message) => {
          if (!isDisposed && clientSocket === socket) handleServerMessage(message);
        },
        (err) => log(`terminal-remote: parser error ${err?.message || err}`)
      );
      socket.on("data", (chunk) => {
        if (!isDisposed && clientSocket === socket) parser.feed(chunk);
      });
      socket.on("error", (err) => log(`terminal-remote: socket error ${err?.message || err}`));
      socket.on("close", () => {
        if (clientSocket !== socket) return;
        log("terminal-remote: daemon socket closed");
        clientSocket = null;
        daemonStatus.connected = false;
        rejectRequests(socket, new Error("Daemon socket disconnected"));
        if (!isDisposed) {
          emitter.emit("daemon-status", { ...daemonStatus });
          clearReconnectTimer();
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect().catch(() => {});
          }, 1500);
        }
      });

      let cleanupConnectListeners;
      const socketReady = new Promise((resolve, reject) => {
        const onConnect = () => resolve();
        const onError = (error) => reject(error);
        const onClose = () => reject(new Error("Daemon socket disconnected"));
        cleanupConnectListeners = () => {
          socket.off("connect", onConnect);
          socket.off("error", onError);
          socket.off("close", onClose);
        };
        socket.once("connect", onConnect);
        socket.once("error", onError);
        socket.once("close", onClose);
      });
      try {
        await wait(socketReady);
      } finally {
        cleanupConnectListeners();
      }
      assertActive();
      const helloResult = await wait(sendRequest("hello", {
        protocolVersion: PROTOCOL_VERSION,
        minCompatibleVersion: MIN_COMPATIBLE_VERSION,
        appVersion,
        clientPid: process.pid,
      }));
      assertActive();
      daemonStatus.daemonAppVersion = helloResult.appVersion;
      daemonStatus.daemonProtocolVersion = helloResult.protocolVersion;
      daemonStatus.activeSessionsCount = helloResult.activeSessionsCount;
      daemonStatus.waitingSessionsCount = helloResult.waitingSessionsCount;
      daemonStatus.protocolCompatible = Boolean(helloResult.compatible);
      daemonStatus.needsUpgrade = !helloResult.compatible;

      if (!helloResult.compatible && helloResult.activeSessionsCount === 0) {
        if (upgradeAttempt === 1) throw new Error("Terminal daemon remains incompatible after upgrade");
        log("terminal-remote: empty incompatible daemon; forcing shutdown and restart...");
        try {
          await wait(sendRequest("shutdown", { mode: "force" }));
        } catch (err) {
          assertActive();
          log(`terminal-remote: upgrade shutdown: ${err?.message || err}`);
        }
        assertActive();
        dropSocket(socket, new Error("Daemon is being upgraded"));
        clearReconnectTimer();
        continue;
      }

      const sessions = await wait(sendRequest("list"));
      assertActive();
      if (clientSocket !== socket || socket.destroyed) throw new Error("Daemon socket disconnected");
      cachedSessions.clear();
      for (const session of sessions) cachedSessions.set(session.id, session);
      daemonStatus.connected = true;
      emitter.emit("daemon-status", { ...daemonStatus });
      log(`terminal-remote: connected and synced ${sessions.length} sessions`);
      return;
    }
  }

  function connect() {
    if (isDisposed) return Promise.reject(new Error("Terminal manager is disposed"));
    // Await startup, hello AND list even if a TCP/pipe socket already exists.
    if (connectPromise) return connectPromise;
    if (clientSocket && !clientSocket.destroyed && daemonStatus.connected) return Promise.resolve();
    clearReconnectTimer();
    const cancellation = new Promise((resolve, reject) => {
      void resolve; // Cancellation only rejects; successful operations release it.
      cancelConnect = reject;
    });
    // dispose() can run before establishConnection reaches its first wait.
    // Keep that cancellation handled; the shared task still rejects to callers.
    cancellation.catch(() => {});
    const task = Promise.resolve().then(() => establishConnection(cancellation)).catch((err) => {
      dropSocket(clientSocket, err);
      clearReconnectTimer();
      daemonStatus.connected = false;
      log(`terminal-remote: connect failed: ${err?.message || err}`);
      if (!isDisposed) emitter.emit("daemon-status", { ...daemonStatus });
      throw err;
    }).finally(() => {
      if (connectPromise === task) {
        connectPromise = null;
        cancelConnect = null;
      }
    });
    connectPromise = task;
    return task;
  }

  function ensureConnected() {
    return connect();
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
        const cols = Number.isInteger(size?.cols) && size.cols > 0 ? size.cols : 80;
        const rows = Number.isInteger(size?.rows) && size.rows > 0 ? size.rows : 24;
        sendRequest("resize", { sessionId, cols, rows }).then(() => {
          const session = cachedSessions.get(sessionId);
          if (session) {
            session.cols = cols;
            session.rows = rows;
          }
        }).catch((err) => {
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

    upgradeDaemonNow: () => {
      if (isDisposed) return Promise.reject(new Error("Terminal manager is disposed"));
      if (upgradePromise) return upgradePromise;
      const task = (async () => {
        if (connectPromise) await connectPromise;
        assertActive();
        log("terminal-remote: user requested immediate daemon upgrade");
        const socket = clientSocket;
        if (socket) {
          try {
            await sendRequest("shutdown", { mode: "force" });
          } catch {
            // A daemon can close its pipe before the shutdown response arrives.
          }
          assertActive();
          dropSocket(socket, new Error("Daemon is being upgraded"));
        }
        return connect();
      })().finally(() => {
        if (upgradePromise === task) upgradePromise = null;
      });
      upgradePromise = task;
      return task;
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
      if (isDisposed) return;
      isDisposed = true;
      const error = new Error("Terminal manager is disposed");
      clearReconnectTimer();
      cancelConnect?.(error);
      dropSocket(clientSocket, error);
      rejectRequests(null, error);
      daemonStatus.connected = false;
      cachedSessions.clear();
      emitter.removeAllListeners();
    },
  };
}

module.exports = {
  createRemoteTerminalSessionManager,
};
