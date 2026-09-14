"use strict";

const { compileBrowserWorkflowFromSource } = require("../shared/browser-workflow-contract.cjs");

const WORKFLOW_COMMAND_CHANNEL = "auris-workflow:command";
const WORKFLOW_EVENT_CHANNEL = "auris-workflow:event";
const WORKFLOW_COMMANDS = Object.freeze([
  "list",
  "inspect",
  "validate",
  "start",
  "get_state",
  "cancel",
  "resume",
]);
const COMMAND_SET = new Set(WORKFLOW_COMMANDS);

function strictObject(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Workflow IPC payload must be an object.");
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new TypeError(`Unknown workflow IPC key: ${key}`);
  return value;
}

function createWorkflowIpc({ ipcMain, runtime, resolveCallerKind }) {
  if (!ipcMain?.handle || !runtime?.start || typeof resolveCallerKind !== "function") throw new TypeError("Workflow IPC dependencies are required.");
  const subscriptions = new Map();
  const lifecycle = new Map();
  let registered = false;

  function owner(event) {
    const kind = resolveCallerKind(event);
    if (!new Set(["notes", "browser-chrome", "nia-standalone"]).has(kind) || typeof event?.sender?.id !== "number") {
      const error = new Error("Untrusted workflow renderer."); error.code = "UNTRUSTED_CALLER"; throw error;
    }
    return `${kind}:${event.sender.id}`;
  }

  function unsubscribe(sender) {
    subscriptions.get(sender)?.();
    const removed = subscriptions.delete(sender);
    const disposeSender = lifecycle.get(sender);
    if (disposeSender) {
      sender.removeListener?.("destroyed", disposeSender);
      sender.removeListener?.("did-navigate", disposeSender);
      lifecycle.delete(sender);
    }
    return removed;
  }

  function attach(event) {
    const sender = event.sender;
    if (subscriptions.has(sender)) return false;
    const ownerId = owner(event);
    const off = runtime.subscribe(ownerId, (workflowEvent) => {
      if (!sender.isDestroyed?.() && subscriptions.has(sender)) sender.send(WORKFLOW_EVENT_CHANNEL, workflowEvent);
    });
    subscriptions.set(sender, off);
    const dispose = () => { runtime.disconnect(ownerId); unsubscribe(sender); };
    sender.once?.("destroyed", dispose);
    sender.on?.("did-navigate", dispose);
    lifecycle.set(sender, dispose);
    return true;
  }

  const onSubscribe = (event) => attach(event);
  const onUnsubscribe = (event) => unsubscribe(event.sender);

  async function handle(event, envelope) {
    const request = strictObject(envelope, ["command", "payload"]);
    if (!COMMAND_SET.has(request.command)) throw new TypeError("Unsupported workflow command.");
    const ownerId = owner(event);
    const allowedPayloadKeys = request.command === "list"
      ? []
      : request.command === "inspect"
        ? ["family", "definitionId"]
        : request.command === "validate"
          ? ["family", "source"]
          : request.command === "start"
            ? ["family", "request"]
            : request.command === "resume"
              ? ["family", "runId", "approved", "approvalId"]
              : ["family", "runId"];
    const payload = strictObject(request.payload ?? {}, allowedPayloadKeys);
    if (request.command === "resume") {
      if (typeof payload.runId !== "string" || !payload.runId) throw new TypeError("Workflow runId is required.");
      if (payload.approved !== undefined && typeof payload.approved !== "boolean") {
        throw new TypeError("Workflow resume approved must be a boolean.");
      }
      if (payload.approvalId !== undefined && typeof payload.approvalId !== "string") {
        throw new TypeError("Workflow resume approvalId must be a string.");
      }
    }
    if (typeof runtime.request === "function") {
      return runtime.request({ ownerId, action: request.command, ...payload });
    }
    if (request.command === "list" || request.command === "inspect") {
      throw new TypeError("Workflow library service is unavailable.");
    }
    if (request.command === "validate") {
      const compiled = compileBrowserWorkflowFromSource(payload.source);
      return { family: compiled.family, site: compiled.site, steps: compiled.steps.length, approvalPoints: compiled.approvalPoints };
    }
    if (request.command === "start") return runtime.start({ ownerId, request: payload.request });
    if (typeof payload.runId !== "string" || !payload.runId) throw new TypeError("Workflow runId is required.");
    if (request.command === "resume") {
      if (typeof runtime.resume !== "function") throw new TypeError("Workflow resume is unavailable.");
      return runtime.resume(payload.runId, ownerId, {
        approved: payload.approved === true,
        ...(typeof payload.approvalId === "string" ? { approvalId: payload.approvalId } : {}),
      });
    }
    return request.command === "cancel" ? runtime.cancel(payload.runId, ownerId) : runtime.getState(payload.runId, ownerId);
  }

  function register() {
    if (registered) return false;
    ipcMain.handle(WORKFLOW_COMMAND_CHANNEL, handle);
    ipcMain.on?.(`${WORKFLOW_COMMAND_CHANNEL}:subscribe`, onSubscribe);
    ipcMain.on?.(`${WORKFLOW_COMMAND_CHANNEL}:unsubscribe`, onUnsubscribe);
    registered = true;
    return true;
  }

  function dispose() {
    if (registered) ipcMain.removeHandler(WORKFLOW_COMMAND_CHANNEL);
    ipcMain.removeListener?.(`${WORKFLOW_COMMAND_CHANNEL}:subscribe`, onSubscribe);
    ipcMain.removeListener?.(`${WORKFLOW_COMMAND_CHANNEL}:unsubscribe`, onUnsubscribe);
    for (const [sender, disposeSender] of [...lifecycle]) {
      disposeSender();
    }
    subscriptions.clear(); lifecycle.clear(); registered = false;
  }

  return Object.freeze({ attach, dispose, handle, register, unsubscribe });
}

module.exports = { WORKFLOW_COMMAND_CHANNEL, WORKFLOW_EVENT_CHANNEL, WORKFLOW_COMMANDS, createWorkflowIpc };
