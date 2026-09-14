"use strict";

const { z } = require("zod");
const {
  BROWSER_TOOL_ACTIONS,
  BrowserPublicError,
  browserActionRequestSchema,
  browserCommandEnvelopeSchema,
  serializeBrowserError,
} = require("../shared/browser-contract.cjs");
const {
  BROWSER_RESOURCE_BUDGETS,
} = require("../shared/browser-resource-budgets.cjs");

const DEFAULT_BROWSER_ACTION_TIMEOUT_MS = 12_000;
const MAX_BROWSER_ACTION_TIMEOUT_MS = 120_000;
const MAX_PENDING_BROWSER_REQUESTS =
  BROWSER_RESOURCE_BUDGETS.maxPendingBrowserRequests;
const BROWSER_ROUTER_TIMEOUT_ERROR_CODE = -32001;
const BROWSER_DISPATCH_ERROR_CODE = -32002;
const BROWSER_ROUTER_TIMEOUT_MARGIN_MS = 500;
const MAX_BROWSER_ROUTER_TIMEOUT_MARGIN_MS = 999;
const BROWSER_MCP_METHODS = new Set(["browser.mcp.action"]);
const BROWSER_ACTIONS_WITHOUT_ENVELOPE = new Set(["get_state", "open"]);
const CONTROLLED_BROWSER_ACTIONS = new Set(
  BROWSER_TOOL_ACTIONS.filter(
    (action) =>
      !BROWSER_ACTIONS_WITHOUT_ENVELOPE.has(action) &&
      action !== "acquire_control",
  ),
);
const canonicalEnvelopeShape = browserCommandEnvelopeSchema.shape;
const browserControlSchema = z
  .object({
    windowId: canonicalEnvelopeShape.windowId,
    tabId: canonicalEnvelopeShape.tabId,
    navigationGeneration: canonicalEnvelopeShape.navigationGeneration,
    controlEpoch: canonicalEnvelopeShape.controlEpoch,
    leaseToken: canonicalEnvelopeShape.leaseToken,
  })
  .strict();
const browserAcquireTargetSchema = z
  .object({
    windowId: canonicalEnvelopeShape.windowId,
    tabId: canonicalEnvelopeShape.tabId,
  })
  .strict();
const browserApprovalIdSchema = canonicalEnvelopeShape.windowId;
const NOTES_MCP_METHODS = new Set([
  "document.getSource",
  "editor.focus",
  "editor.revealLine",
  "notes.getSelection",
  "notes.getState",
  "notes.mcp.document",
  "notes.mcp.session",
  "notes.mcp.workspace",
  "notes.read",
  "notes.replaceSelection",
  "selection.get",
  "selection.insertSnippet",
  "selection.set",
]);
const MCP_ROUTE_ERROR_MARKER = Symbol("auris.mcp-route-error");
const BROWSER_DISPATCH_ERROR_MARKER = Symbol("auris.browser-dispatch-error");

function createBrowserDispatcherError(error) {
  const wrapped = new Error("Browser MCP dispatcher rejected the request.");
  let trustedError = null;
  try {
    if (error instanceof BrowserPublicError) trustedError = error;
  } catch {
    trustedError = null;
  }
  const serialized = serializeBrowserError(trustedError);
  Object.defineProperty(wrapped, BROWSER_DISPATCH_ERROR_MARKER, {
    value: Object.freeze(serialized),
  });
  return wrapped;
}

function getBrowserDispatcherErrorData(error) {
  try {
    const value = error?.[BROWSER_DISPATCH_ERROR_MARKER];
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

class McpRouteError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "McpRouteError";
    Object.defineProperty(this, MCP_ROUTE_ERROR_MARKER, { value: true });
  }
}

function getMcpRouteErrorCode(error) {
  try {
    return error?.[MCP_ROUTE_ERROR_MARKER] === true &&
      Number.isInteger(error.code)
      ? error.code
      : -32000;
  } catch {
    return -32000;
  }
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizePositiveInteger(value, fallback, maximum) {
  return Number.isInteger(value) && value > 0 && value <= maximum
    ? value
    : fallback;
}

function normalizeBrowserActionTimeoutMs(params) {
  if (!hasOwn(params, "actionTimeoutMs")) {
    return DEFAULT_BROWSER_ACTION_TIMEOUT_MS;
  }

  const value = params.actionTimeoutMs;
  if (
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_BROWSER_ACTION_TIMEOUT_MS
  ) {
    throw new McpRouteError(-32602, "Invalid Browser action timeout.");
  }

  return value;
}

function parseBrowserRequest(value) {
  const parsed = browserActionRequestSchema.safeParse(value);
  if (!parsed.success) {
    throw new McpRouteError(-32602, "Invalid Browser MCP request.");
  }
  return parsed.data;
}

function deriveBrowserActionTimeoutMs(request) {
  if (request.action === "wait") return request.milliseconds;
  if (request.action === "wait_for" && request.timeoutMs !== undefined) {
    return request.timeoutMs;
  }
  return DEFAULT_BROWSER_ACTION_TIMEOUT_MS;
}

function invalidBrowserActionEnvelope() {
  return new McpRouteError(-32602, "Invalid Browser MCP action envelope.");
}

function parseActionEnvelope(params, action) {
  const hasTarget = hasOwn(params, "target");
  const hasControl = hasOwn(params, "control");
  const hasApprovalId = hasOwn(params, "approvalId");

  if (BROWSER_ACTIONS_WITHOUT_ENVELOPE.has(action)) {
    if (hasTarget || hasControl || hasApprovalId)
      throw invalidBrowserActionEnvelope();
    return {};
  }

  if (action === "acquire_control") {
    if (hasControl || hasApprovalId) throw invalidBrowserActionEnvelope();
    if (!hasTarget) return {};
    const target = browserAcquireTargetSchema.safeParse(params.target);
    if (!target.success) throw invalidBrowserActionEnvelope();
    return { target: target.data };
  }

  if (!CONTROLLED_BROWSER_ACTIONS.has(action) || hasTarget || !hasControl) {
    throw invalidBrowserActionEnvelope();
  }

  const control = browserControlSchema.safeParse(params.control);
  if (!control.success) throw invalidBrowserActionEnvelope();
  if (!hasApprovalId) return { control: control.data };

  const approvalId = browserApprovalIdSchema.safeParse(params.approvalId);
  if (!approvalId.success) throw invalidBrowserActionEnvelope();
  return { approvalId: approvalId.data, control: control.data };
}

function sanitizeBrowserParams(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new McpRouteError(-32602, "Browser MCP params must be an object.");
  }

  const params = value;
  normalizeBrowserActionTimeoutMs(params);
  const request = parseBrowserRequest(params.request);
  const sanitized = {
    actionTimeoutMs: deriveBrowserActionTimeoutMs(request),
    request,
    ...parseActionEnvelope(params, request.action),
  };
  return sanitized;
}

function invokeLifecycleHook(hook, connectionId) {
  try {
    void Promise.resolve(hook(connectionId)).catch(() => undefined);
  } catch {
    // Lifecycle cleanup is best-effort here; each service owns its own logging.
  }
}

function createBrowserMcpRouter({
  cancelBrowserApprovals = () => undefined,
  dispatchBrowserRequest,
  forwardNotesRequest,
  maxPendingBrowserRequests = MAX_PENDING_BROWSER_REQUESTS,
  releaseBrowserOwnership = () => undefined,
  requestTimeoutMarginMs = BROWSER_ROUTER_TIMEOUT_MARGIN_MS,
  requestTimeoutMs,
}) {
  if (typeof dispatchBrowserRequest !== "function") {
    throw new TypeError("Browser MCP dispatcher is required.");
  }
  if (typeof forwardNotesRequest !== "function") {
    throw new TypeError("Notes MCP renderer forwarder is required.");
  }

  const pendingLimit = normalizePositiveInteger(
    maxPendingBrowserRequests,
    MAX_PENDING_BROWSER_REQUESTS,
    MAX_PENDING_BROWSER_REQUESTS,
  );
  const fixedRequestTimeoutMs =
    requestTimeoutMs === undefined
      ? null
      : normalizePositiveInteger(
          requestTimeoutMs,
          DEFAULT_BROWSER_ACTION_TIMEOUT_MS,
          MAX_BROWSER_ACTION_TIMEOUT_MS,
        );
  const timeoutMarginMs = normalizePositiveInteger(
    requestTimeoutMarginMs,
    BROWSER_ROUTER_TIMEOUT_MARGIN_MS,
    MAX_BROWSER_ROUTER_TIMEOUT_MARGIN_MS,
  );
  const connections = new Map();

  function registerConnection(connectionId) {
    if (typeof connectionId !== "string" || !connectionId) {
      throw new TypeError("A main-owned Browser connectionId is required.");
    }

    let state = connections.get(connectionId);
    if (!state) {
      state = { pending: new Set() };
      connections.set(connectionId, state);
    }
    return state;
  }

  function dispatchBrowser(connectionId, principal, method, rawParams) {
    const params = sanitizeBrowserParams(rawParams);
    const state = registerConnection(connectionId);
    if (state.pending.size >= pendingLimit) {
      return Promise.reject(
        new McpRouteError(-32000, "Browser MCP request limit reached."),
      );
    }

    const controller = new AbortController();
    const timeoutMs =
      fixedRequestTimeoutMs ?? params.actionTimeoutMs + timeoutMarginMs;

    return new Promise((resolve, reject) => {
      let active = true;
      let timeout = null;
      const entry = {
        cancel(message, code = -32000) {
          if (!active) return;
          active = false;
          if (timeout) clearTimeout(timeout);
          state.pending.delete(entry);
          controller.abort(new Error(message));
          reject(new McpRouteError(code, message));
        },
      };

      function settle(callback, value) {
        if (!active) return;
        active = false;
        if (timeout) clearTimeout(timeout);
        state.pending.delete(entry);
        callback(value);
      }

      state.pending.add(entry);
      timeout = setTimeout(() => {
        entry.cancel(
          "Browser MCP request timed out.",
          BROWSER_ROUTER_TIMEOUT_ERROR_CODE,
        );
      }, timeoutMs);

      Promise.resolve()
        .then(() =>
          dispatchBrowserRequest({
            connectionId,
            method,
            params,
            principal,
            signal: controller.signal,
          }),
        )
        .then(
          (result) => settle(resolve, result),
          (error) => settle(reject, createBrowserDispatcherError(error)),
        );
    });
  }

  async function route({ connectionId, id, method, params, principal }) {
    if (NOTES_MCP_METHODS.has(method)) {
      return forwardNotesRequest({ id, method, params, principal });
    }

    if (BROWSER_MCP_METHODS.has(method)) {
      return dispatchBrowser(connectionId, principal, method, params);
    }

    if (method.startsWith("workflow.") || method.startsWith("nia.")) {
      throw new McpRouteError(
        -32601,
        "Workflow MCP methods are not available until Phase 5.",
      );
    }

    throw new McpRouteError(-32601, `Unsupported MCP method: ${method}`);
  }

  function closeConnection(connectionId) {
    const state = connections.get(connectionId);
    if (!state) return;

    connections.delete(connectionId);
    for (const entry of [...state.pending]) {
      entry.cancel("Browser MCP connection closed.");
    }
    invokeLifecycleHook(releaseBrowserOwnership, connectionId);
    invokeLifecycleHook(cancelBrowserApprovals, connectionId);
  }

  function shutdown() {
    for (const connectionId of [...connections.keys()]) {
      closeConnection(connectionId);
    }
  }

  return {
    closeConnection,
    registerConnection,
    route,
    shutdown,
  };
}

module.exports = {
  BROWSER_DISPATCH_ERROR_CODE,
  BROWSER_MCP_METHODS,
  BROWSER_ROUTER_TIMEOUT_ERROR_CODE,
  BROWSER_ROUTER_TIMEOUT_MARGIN_MS,
  DEFAULT_BROWSER_ACTION_TIMEOUT_MS,
  MAX_BROWSER_ACTION_TIMEOUT_MS,
  MAX_PENDING_BROWSER_REQUESTS,
  NOTES_MCP_METHODS,
  createBrowserMcpRouter,
  getBrowserDispatcherErrorData,
  getMcpRouteErrorCode,
};
