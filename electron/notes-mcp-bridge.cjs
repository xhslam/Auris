const { randomUUID, timingSafeEqual } = require("node:crypto");
const { WebSocketServer } = require("ws");
const { serializeMcpDiscovery } = require("./auris-mcp-config.cjs");
const {
  BROWSER_DISPATCH_ERROR_CODE,
  createBrowserMcpRouter,
  getBrowserDispatcherErrorData,
  getMcpRouteErrorCode,
} = require("./browser/browser-mcp-router.cjs");

const AUTH_TIMEOUT_MS = 5_000;
const MAX_PENDING_REQUESTS = 100;
const NOTES_MCP_REQUEST_CHANNEL = "shadowing:notes-mcp:request";
const REQUEST_TIMEOUT_MS = 10_000;
const READ_ONLY_BROWSER_ACTIONS = new Set([
  "console",
  "get_state",
  "query",
  "read",
  "screenshot",
  "wait",
  "wait_for",
]);
const READ_ONLY_REVIEW_ACTIONS = new Set(["list_projects", "list_knowledge_points", "get_knowledge_point"]);
const READ_ONLY_WORKFLOW_ACTIONS = new Set([
  "get_state",
  "inspect",
  "list",
  "validate",
]);
const MUTATING_NOTES_METHODS = new Set([
  "editor.focus",
  "editor.revealLine",
  "notes.mcp.workspace",
  "notes.replaceSelection",
  "selection.insertSnippet",
  "selection.set",
]);

function createUnverifiedPrincipal() {
  return Object.freeze({
    id: "unverified-local",
    kind: "legacy-mcp-client",
    verified: false,
  });
}

function requiresVerifiedPrincipal(payload) {
  if (payload.method === "review.mcp.action") {
    return !READ_ONLY_REVIEW_ACTIONS.has(payload.params?.action);
  }
  if (MUTATING_NOTES_METHODS.has(payload.method)) return true;
  if (payload.method === "notes.mcp.document") {
    return payload.params?.action !== "read";
  }
  if (payload.method === "browser.mcp.action") {
    return !READ_ONLY_BROWSER_ACTIONS.has(payload.params?.request?.action);
  }
  if (payload.method === "workflow.mcp.action") {
    return !READ_ONLY_WORKFLOW_ACTIONS.has(payload.params?.action);
  }
  return false;
}

function createErrorResponse(id, code, message, data) {
  return {
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
    id: id ?? null,
    jsonrpc: "2.0",
  };
}

function createResultResponse(id, result) {
  return {
    id: id ?? null,
    jsonrpc: "2.0",
    result,
  };
}

function safeString(value) {
  return typeof value === "string" ? value : "";
}

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(safeString(left));
  const rightBuffer = Buffer.from(safeString(right));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function parseSocketPayload(data) {
  try {
    return JSON.parse(data.toString("utf8"));
  } catch {
    return null;
  }
}

function getPayloadId(payload) {
  return typeof payload?.id === "string" || typeof payload?.id === "number"
    ? payload.id
    : null;
}

function validateRequest(payload) {
  if (!payload || typeof payload !== "object") {
    return "Request payload must be a JSON object.";
  }

  if (typeof payload.method !== "string" || !payload.method.trim()) {
    return "Request method is required.";
  }

  return null;
}

function sendSocketJson(socket, payload) {
  if (socket.readyState !== 1) {
    return;
  }

  socket.send(JSON.stringify(payload));
}

function normalizeBridgeRequestId(value) {
  return typeof value === "string" && value.trim() ? value : null;
}

function waitForListening(server) {
  return new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
}

function getListeningPort(server) {
  const address = server.address();

  if (!address || typeof address === "string" || !Number.isInteger(address.port)) {
    throw new Error("Notes MCP bridge did not expose a listening port.");
  }

  return address.port;
}

function createNotesMcpBridge({
  browserRequestTimeoutMs,
  cancelBrowserApprovals = () => undefined,
  dispatchBrowserRequest = async () => {
    throw new Error("Browser MCP dispatcher is not available.");
  },
  dispatchWorkflowRequest = async () => {
    throw new Error("Workflow MCP facade is not available.");
  },
  getWindow,
  logger,
  maxPendingBrowserRequests,
  removeDiscovery = () => undefined,
  releaseBrowserOwnership = () => undefined,
  releaseWorkflowOwnership = () => undefined,
  verifyClientCredential = async () => null,
  writeDiscovery = () => undefined,
}) {
  let port = null;
  let server = null;
  let reviewRendererReady = false;
  const instanceId = randomUUID();
  const token = randomUUID();
  const pendingRequests = new Map();
  const router = createBrowserMcpRouter({
    cancelBrowserApprovals,
    dispatchBrowserRequest,
    forwardNotesRequest: forwardRequestToRenderer,
    maxPendingBrowserRequests,
    releaseBrowserOwnership,
    requestTimeoutMs: browserRequestTimeoutMs,
  });

  function log(message) {
    if (typeof logger === "function") {
      logger(`notes-mcp:${message}`);
    }
  }

  function getServerInfo() {
    return {
      enabled: Boolean(server && port),
      port,
    };
  }

  function rejectPendingRequest(bridgeRequestId, errorMessage) {
    const entry = pendingRequests.get(bridgeRequestId);

    if (!entry) {
      return;
    }

    clearTimeout(entry.timeout);
    pendingRequests.delete(bridgeRequestId);
    entry.reject(new Error(errorMessage));
  }

  function resolveRequest(bridgeRequestId, result) {
    const normalizedId = normalizeBridgeRequestId(bridgeRequestId);

    if (!normalizedId) {
      return;
    }

    const entry = pendingRequests.get(normalizedId);

    if (!entry) {
      return;
    }

    clearTimeout(entry.timeout);
    pendingRequests.delete(normalizedId);
    entry.resolve(result);
  }

  function rejectRequest(bridgeRequestId, errorMessage) {
    const normalizedId = normalizeBridgeRequestId(bridgeRequestId);

    if (!normalizedId) {
      return;
    }

    rejectPendingRequest(normalizedId, safeString(errorMessage) || "Request failed.");
  }

  function forwardRequestToRenderer(request) {
    if (request.method === "review.mcp.action" && !reviewRendererReady) {
      return Promise.reject(new Error("REVIEW_NOT_READY: main workspace is loading; no operation performed. Retry after the workspace is ready."));
    }
    const window = getWindow();

    if (!window || window.isDestroyed()) {
      return Promise.reject(new Error("Notes renderer is not available."));
    }

    const bridgeRequestId = randomUUID();

    return new Promise((resolve, reject) => {
      if (pendingRequests.size >= MAX_PENDING_REQUESTS) {
        reject(new Error("Notes MCP bridge request limit reached."));
        return;
      }

      const timeout = setTimeout(() => {
        rejectPendingRequest(bridgeRequestId, "Notes MCP request timed out.");
      }, REQUEST_TIMEOUT_MS);

      pendingRequests.set(bridgeRequestId, {
        reject,
        resolve,
        timeout,
      });

      window.webContents.send(NOTES_MCP_REQUEST_CHANNEL, {
        bridgeRequestId,
        request,
      });
    });
  }

  async function handleSocketPayload(socket, payload) {
    const id = getPayloadId(payload);
    const validationError = validateRequest(payload);

    if (validationError) {
      sendSocketJson(socket, createErrorResponse(id, -32600, validationError));
      return;
    }

    if (!socket.principal?.verified && requiresVerifiedPrincipal(payload)) {
      sendSocketJson(
        socket,
        createErrorResponse(
          id,
          403,
          "Verified MCP client credential required. Reinstall the Auris MCP integration.",
        ),
      );
      return;
    }

    try {
      if (payload.method === "workflow.mcp.action") {
        const result = await dispatchWorkflowRequest({
          connectionId: socket.connectionId,
          params: payload.params,
          principal: socket.principal,
        });
        sendSocketJson(socket, createResultResponse(id, result));
        return;
      }
      if (payload.method === "review.mcp.action") {
        const result = await forwardRequestToRenderer({ method: payload.method, params: payload.params });
        sendSocketJson(socket, createResultResponse(id, result));
        return;
      }
      const result = await router.route({
        connectionId: socket.connectionId,
        id,
        method: payload.method,
        params: payload.params,
        principal: socket.principal,
      });

      sendSocketJson(socket, createResultResponse(id, result));
    } catch (error) {
      const browserError = getBrowserDispatcherErrorData(error);
      if (browserError) {
        sendSocketJson(
          socket,
          createErrorResponse(
            id,
            BROWSER_DISPATCH_ERROR_CODE,
            "Browser MCP dispatcher rejected the request.",
            {
              error: browserError,
              kind: "auris.browser.error",
              version: 1,
            },
          ),
        );
        return;
      }
      sendSocketJson(
        socket,
        createErrorResponse(
          id,
          getMcpRouteErrorCode(error),
          error instanceof Error ? error.message : "Notes MCP request failed.",
        ),
      );
    }
  }

  function handleConnection(socket) {
    const connectionNonce = randomUUID();
    let connectionId = connectionNonce;
    socket.connectionId = connectionId;
    socket.principal = null;
    let isAuthorized = false;
    let isAuthenticating = false;
    const authTimeout = setTimeout(() => {
      if (!isAuthorized) {
        socket.close(1008, "Authentication timed out.");
      }
    }, AUTH_TIMEOUT_MS);

    async function handleAuthentication(payload, id) {
      if (
        payload.method !== "auth" ||
        !safeCompare(payload.params?.token, token)
      ) {
        sendSocketJson(socket, createErrorResponse(id, 401, "Unauthorized."));
        return;
      }
      if (isAuthenticating) {
        sendSocketJson(socket, createErrorResponse(id, 409, "Authentication already in progress."));
        return;
      }
      isAuthenticating = true;
      let principal = null;
      try {
        principal = await verifyClientCredential({
          clientId: safeString(payload.params?.client_id),
          clientToken: safeString(payload.params?.client_token),
        });
      } catch {
        principal = null;
      }
      if (socket.readyState !== 1) return;
      socket.principal =
        principal && principal.verified === true
          ? Object.freeze({
              id: safeString(principal.id),
              kind: safeString(principal.kind) || "installed-mcp-client",
              verified: true,
            })
          : createUnverifiedPrincipal();
      connectionId = `mcp:${socket.principal.id}:${connectionNonce}`;
      socket.connectionId = connectionId;
      isAuthorized = true;
      router.registerConnection(connectionId);
      clearTimeout(authTimeout);
      sendSocketJson(socket, createResultResponse(id, {
        ok: true,
        principal: socket.principal,
      }));
    }

    socket.on("message", (data) => {
      const payload = parseSocketPayload(data);
      const id = getPayloadId(payload);

      if (!payload) {
        sendSocketJson(socket, createErrorResponse(null, -32700, "Invalid JSON."));
        return;
      }

      if (!isAuthorized) {
        void handleAuthentication(payload, id);
        return;
      }

      void handleSocketPayload(socket, payload);
    });

    socket.on("close", () => {
      clearTimeout(authTimeout);
      router.closeConnection(connectionId);
      releaseWorkflowOwnership(connectionId);
    });
  }

  async function start() {
    if (server) {
      return getServerInfo();
    }

    const nextServer = new WebSocketServer({
      host: "127.0.0.1",
      port: 0,
    });

    nextServer.on("error", (error) => {
      log(`server-error ${error?.stack ?? error}`);
    });

    try {
      await waitForListening(nextServer);
      port = getListeningPort(nextServer);
      writeDiscovery(serializeMcpDiscovery({
        instanceId,
        pid: process.pid,
        port,
        token,
      }));
      nextServer.on("connection", handleConnection);
      server = nextServer;
      log(`listening ws://127.0.0.1:${port}/notes-mcp`);
    } catch (error) {
      nextServer.close();
      port = null;
      throw error;
    }

    return getServerInfo();
  }

  function close() {
    for (const bridgeRequestId of pendingRequests.keys()) {
      rejectPendingRequest(bridgeRequestId, "Notes MCP bridge closed.");
    }
    router.shutdown();

    if (server) {
      for (const socket of server.clients) {
        if (socket.connectionId) releaseWorkflowOwnership(socket.connectionId);
        socket.close(1001, "Bridge closed.");
      }
      server.close();
      server = null;
      port = null;
    }

    removeDiscovery(instanceId);
  }

  return {
    close,
    getServerInfo,
    rejectRequest,
    resolveRequest,
    setReviewRendererReady: (ready) => { reviewRendererReady = ready === true; },
    start,
  };
}

module.exports = {
  NOTES_MCP_REQUEST_CHANNEL,
  createNotesMcpBridge,
};
