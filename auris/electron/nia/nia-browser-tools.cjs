"use strict";

/**
 * Host-owned Nia browser tool loop helpers.
 *
 * The model never sees lease tokens. Main acquires/releases control through the
 * shared Browser command dispatcher (same path as MCP / workflows).
 */

const {
  browserActionRequestSchema,
  createBrowserPublicError,
} = require("../shared/browser-contract.cjs");

const NIA_BROWSER_TOOL_NAME = "auris_browser";

const NIA_BROWSER_ALLOWED_ACTIONS = Object.freeze([
  "get_state",
  "open",
  "acquire_control",
  "release_control",
  "navigate",
  "wait",
  "wait_for",
  "read",
  "query",
  "act",
  "screenshot",
  "focus",
  "close",
]);

const NIA_BROWSER_MAX_TOOL_ROUNDS = 8;

const NIA_BROWSER_TOOL_DESCRIPTION = [
  "Control the Auris desktop browser under user-approved automation.",
  "Prefer AiSandbox via open when exploring untrusted sites.",
  "Actions: get_state, open, navigate, read, query, act (click|type|scroll|key),",
  "wait, wait_for, screenshot, focus, close, acquire_control, release_control.",
  "For act, include variant and target (ref or selector from a prior read).",
  "If a result says APPROVAL_REQUIRED, tell the user to approve in the browser UI,",
  "then retry the same action with approvalId.",
].join(" ");

const NIA_BROWSER_TOOL_PARAMETERS = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["action"],
  properties: Object.freeze({
    action: Object.freeze({
      type: "string",
      enum: NIA_BROWSER_ALLOWED_ACTIONS.slice(),
    }),
    url: Object.freeze({ type: "string", description: "HTTP(S) URL for open/navigate." }),
    windowId: Object.freeze({ type: "string" }),
    tabId: Object.freeze({ type: "string" }),
    approvalId: Object.freeze({ type: "string" }),
    ms: Object.freeze({ type: "number", description: "Milliseconds for wait." }),
    variant: Object.freeze({
      type: "string",
      enum: ["click", "type", "scroll", "key"],
      description: "Required for act.",
    }),
    target: Object.freeze({
      type: "object",
      description: "Element target from read/query (ref and/or selector).",
      additionalProperties: true,
    }),
    text: Object.freeze({ type: "string", description: "Text for act variant type." }),
    key: Object.freeze({ type: "string", description: "Key for act variant key." }),
    direction: Object.freeze({ type: "string", description: "Scroll direction." }),
    amount: Object.freeze({ type: "number", description: "Scroll amount." }),
    selector: Object.freeze({ type: "string" }),
    ref: Object.freeze({ type: "string" }),
    publication: Object.freeze({ type: "string", enum: ["evidence"] }),
  }),
});

function niaBrowserToolDefinitions() {
  return Object.freeze([
    Object.freeze({
      name: NIA_BROWSER_TOOL_NAME,
      description: NIA_BROWSER_TOOL_DESCRIPTION,
      parameters: NIA_BROWSER_TOOL_PARAMETERS,
    }),
  ]);
}

function redactControl(control) {
  if (!control || typeof control !== "object") return null;
  return Object.freeze({
    windowId: control.windowId,
    tabId: control.tabId,
    navigationGeneration: control.navigationGeneration,
    controlEpoch: control.controlEpoch,
  });
}

function sanitizeBrowserResult(result) {
  if (!result || typeof result !== "object") return result;
  const out = { ...result };
  if (out.control) out.control = redactControl(out.control);
  if (typeof out.leaseToken === "string") delete out.leaseToken;
  return out;
}

function parseNiaBrowserToolArgs(rawArgs) {
  let args = rawArgs;
  if (typeof rawArgs === "string") {
    try {
      args = JSON.parse(rawArgs);
    } catch {
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        capability: "nia-browser-tool-args",
      });
    }
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
      capability: "nia-browser-tool-args",
    });
  }
  if (!NIA_BROWSER_ALLOWED_ACTIONS.includes(args.action)) {
    throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
      capability: "nia-browser-action",
    });
  }

  const requestInput = { action: args.action };
  for (const key of [
    "url",
    "ms",
    "variant",
    "target",
    "text",
    "key",
    "deltaX",
    "deltaY",
    "selector",
    "ref",
    "publication",
    "name",
  ]) {
    if (Object.prototype.hasOwnProperty.call(args, key)) {
      requestInput[key] = args[key];
    }
  }

  // Flatten common act shorthand from models into contract target descriptors.
  if (requestInput.action === "act") {
    if (!requestInput.target && (requestInput.ref || requestInput.selector)) {
      requestInput.target = requestInput.ref
        ? { kind: "ref", ref: requestInput.ref }
        : { kind: "selector", selector: requestInput.selector };
    } else if (requestInput.target && typeof requestInput.target === "object") {
      const target = requestInput.target;
      if (!target.kind && typeof target.ref === "string") {
        requestInput.target = { kind: "ref", ref: target.ref };
      } else if (!target.kind && typeof target.selector === "string") {
        requestInput.target = { kind: "selector", selector: target.selector };
      }
    }
    delete requestInput.ref;
    delete requestInput.selector;
  }

  const parsed = browserActionRequestSchema.safeParse(requestInput);
  if (!parsed.success) {
    throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
      capability: "nia-browser-request",
    });
  }

  const target =
    typeof args.windowId === "string" && typeof args.tabId === "string"
      ? Object.freeze({ windowId: args.windowId, tabId: args.tabId })
      : undefined;

  return Object.freeze({
    request: parsed.data,
    ...(target ? { target } : {}),
    ...(typeof args.approvalId === "string" ? { approvalId: args.approvalId } : {}),
  });
}

function createNiaBrowserSession({
  dispatcher,
  connectionId,
  browserTarget = null,
}) {
  if (!dispatcher || typeof dispatcher.dispatch !== "function") {
    throw new TypeError("Nia browser session requires dispatcher.dispatch.");
  }
  if (typeof connectionId !== "string" || !connectionId.startsWith("nia:")) {
    throw new TypeError("Nia browser session requires connectionId prefixed with nia:.");
  }

  let control = null;

  async function dispatch(params, signal) {
    return dispatcher.dispatch({ connectionId, params, signal });
  }

  async function releaseHeld(signal = new AbortController().signal) {
    if (!control) return;
    const held = control;
    control = null;
    try {
      await dispatch({ control: held, request: { action: "release_control" } }, signal);
    } catch {
      // Lifecycle cleanup is idempotent.
    }
  }

  async function acquireForTarget(target, signal) {
    const resolved = target || browserTarget;
    if (!resolved?.windowId || !resolved?.tabId) {
      throw createBrowserPublicError("AMBIGUOUS_TARGET", {
        capability: "nia-browser-target",
      });
    }
    const result = await dispatch({
      request: { action: "acquire_control" },
      target: resolved,
    }, signal);
    control = result.control;
    return result;
  }

  async function executeToolCall(rawArgs, signal) {
    const parsed = parseNiaBrowserToolArgs(rawArgs);
    const { request, approvalId } = parsed;

    if (request.action === "get_state") {
      return sanitizeBrowserResult(await dispatch({ request }, signal));
    }

    if (request.action === "open") {
      await releaseHeld(signal);
      const result = await dispatch({ request }, signal);
      control = result.control ?? null;
      return sanitizeBrowserResult(result);
    }

    if (request.action === "acquire_control") {
      const result = await acquireForTarget(parsed.target, signal);
      return sanitizeBrowserResult(result);
    }

    if (request.action === "release_control") {
      await releaseHeld(signal);
      return Object.freeze({ released: true });
    }

    let acquiredHere = false;
    if (!control) {
      await acquireForTarget(parsed.target, signal);
      acquiredHere = true;
    }

    try {
      const result = await dispatch({
        control,
        request,
        ...(approvalId ? { approvalId } : {}),
      }, signal);
      return sanitizeBrowserResult(result);
    } catch (error) {
      if (
        error?.code === "LEASE_LOST"
        || error?.code === "STALE_NAVIGATION"
        || error?.code === "CONTROL_STALE"
        || error?.code === "OWNER_MISMATCH"
      ) {
        control = null;
      }
      throw error;
    } finally {
      if (acquiredHere) {
        await releaseHeld(new AbortController().signal);
      }
    }
  }

  async function dispose() {
    await releaseHeld();
    try {
      dispatcher.releaseOwnership?.(connectionId);
    } catch {
      // Best-effort ownership drop.
    }
  }

  return Object.freeze({
    connectionId,
    dispose,
    executeToolCall,
  });
}

function serializeToolResultForModel(result) {
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

function serializeToolErrorForModel(error) {
  const payload = {
    error: true,
    code: typeof error?.code === "string" ? error.code : "FAILED",
    message: error instanceof Error ? error.message : String(error),
  };
  if (error?.metadata?.approvalId) payload.approvalId = error.metadata.approvalId;
  if (error?.details?.approvalId) payload.approvalId = error.details.approvalId;
  return JSON.stringify(payload);
}

module.exports = {
  NIA_BROWSER_ALLOWED_ACTIONS,
  NIA_BROWSER_MAX_TOOL_ROUNDS,
  NIA_BROWSER_TOOL_DESCRIPTION,
  NIA_BROWSER_TOOL_NAME,
  NIA_BROWSER_TOOL_PARAMETERS,
  createNiaBrowserSession,
  niaBrowserToolDefinitions,
  parseNiaBrowserToolArgs,
  sanitizeBrowserResult,
  serializeToolErrorForModel,
  serializeToolResultForModel,
};
