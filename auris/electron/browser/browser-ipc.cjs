"use strict";

const contract = require("../shared/browser-contract.cjs");
const { APPROVAL_DECISIONS } = require("./browser-approvals.cjs");
const { deepFreeze } = require("./browser-registry.cjs");

const BROWSER_COMMAND_CHANNEL = "auris-browser:command";
const BROWSER_SNAPSHOT_CHANNEL = "auris-browser:snapshot";
const BROWSER_CHROME_COMMANDS = Object.freeze([
  "getSnapshot",
  "createWindow",
  "focusWindow",
  "closeWindow",
  "createTabInWindow",
  "createTab",
  "closeTab",
  "activateTab",
  "navigate",
  "goBack",
  "goForward",
  "reload",
  "stop",
  "bookmark",
  "removeBookmark",
  "find",
  "setZoom",
  "resolveApproval",
  "setChromeTheme",
  "setSideInset",
  "setViewport",
  "subscribe",
  "unsubscribe",
]);
const COMMAND_SET = new Set(BROWSER_CHROME_COMMANDS);
const STATE_MUTATIONS = new Set([
  "activateTab",
  "bookmark",
  "closeTab",
  "createTab",
  "createTabInWindow",
  "createWindow",
  "closeWindow",
  "focusWindow",
  "navigate",
  "removeBookmark",
]);

function strictObject(value, allowedKeys) {
  const object = value === undefined ? {} : value;
  if (!object || typeof object !== "object" || Array.isArray(object)) {
    throw new TypeError("Browser command payload must be an object");
  }
  for (const key of Object.keys(object)) {
    if (!allowedKeys.includes(key)) throw new TypeError(`Unknown browser command key: ${key}`);
  }
  return object;
}

function parseId(value) {
  return contract.browserTargetDescriptorSchema.parse({ kind: "ref", ref: value }).ref;
}

function parseUrl(value, action = "navigate") {
  return contract.browserActionRequestSchema.parse({ action, url: value }).url;
}

function optionalTabPayload(value) {
  const payload = strictObject(value, ["tabId"]);
  return payload.tabId === undefined ? {} : { tabId: parseId(payload.tabId) };
}

function createTabPayload(value, { withWindow = false } = {}) {
  const keys = ["url", "automationMode", "confirmAiShared", ...(withWindow ? ["windowId"] : [])];
  const payload = strictObject(value, keys);
  const result = {};
  if (withWindow) result.windowId = parseId(payload.windowId);
  if (payload.url !== undefined) result.url = parseUrl(payload.url, "open");
  if (payload.automationMode !== undefined) {
    if (!["Human", "AiSandbox", "AiShared"].includes(payload.automationMode)) throw new TypeError("Invalid browser automation mode");
    result.automationMode = payload.automationMode;
  }
  if (payload.confirmAiShared !== undefined) {
    if (payload.confirmAiShared !== true && payload.confirmAiShared !== false) throw new TypeError("Invalid AiShared confirmation flag");
    result.confirmAiShared = payload.confirmAiShared;
  }
  return result;
}

function parsePayload(command, value) {
  switch (command) {
    case "getSnapshot":
    case "subscribe":
    case "unsubscribe":
      return strictObject(value, []);
    case "createTab": {
      return createTabPayload(value);
    }
    case "createTabInWindow":
      return createTabPayload(value, { withWindow: true });
    case "createWindow": {
      const payload = strictObject(value, ["url"]);
      return payload.url === undefined ? {} : { url: parseUrl(payload.url, "open") };
    }
    case "focusWindow":
    case "closeWindow": {
      const payload = strictObject(value, ["windowId"]);
      return { windowId: parseId(payload.windowId) };
    }
    case "closeTab":
    case "activateTab": {
      const payload = strictObject(value, ["tabId"]);
      return { tabId: parseId(payload.tabId) };
    }
    case "navigate": {
      const payload = strictObject(value, ["tabId", "url"]);
      return {
        ...(payload.tabId === undefined ? {} : { tabId: parseId(payload.tabId) }),
        url: parseUrl(payload.url),
      };
    }
    case "goBack":
    case "goForward":
    case "reload":
    case "stop":
    case "bookmark":
      return optionalTabPayload(value);
    case "removeBookmark": {
      const payload = strictObject(value, ["url"]);
      return { url: parseUrl(payload.url) };
    }
    case "find": {
      const payload = strictObject(value, ["tabId", "text"]);
      if (
        typeof payload.text !== "string" ||
        payload.text.length === 0 ||
        payload.text.length > contract.BROWSER_CONTRACT_LIMITS.text
      ) {
        throw new TypeError("Invalid browser find text");
      }
      return {
        ...(payload.tabId === undefined ? {} : { tabId: parseId(payload.tabId) }),
        text: payload.text,
      };
    }
    case "setZoom": {
      const payload = strictObject(value, ["tabId", "factor"]);
      if (typeof payload.factor !== "number" || payload.factor < 0.25 || payload.factor > 5) {
        throw new TypeError("Invalid browser zoom factor");
      }
      return {
        factor: payload.factor,
        ...(payload.tabId === undefined ? {} : { tabId: parseId(payload.tabId) }),
      };
    }
    case "resolveApproval": {
      const payload = strictObject(value, ["approvalId", "decision"]);
      const approvalId = parseId(payload.approvalId);
      if (!APPROVAL_DECISIONS.includes(payload.decision)) {
        throw new TypeError("Invalid Browser approval decision");
      }
      return { approvalId, decision: payload.decision };
    }
    case "setChromeTheme": {
      const payload = strictObject(value, ["backgroundColor"]);
      if (
        typeof payload.backgroundColor !== "string" ||
        !/^#[0-9A-Fa-f]{6}$/u.test(payload.backgroundColor)
      ) {
        throw new TypeError("Invalid browser chrome background color");
      }
      return { backgroundColor: payload.backgroundColor.toLowerCase() };
    }
    case "setSideInset": {
      const payload = strictObject(value, ["width"]);
      if (typeof payload.width !== "number" || !Number.isFinite(payload.width)) {
        throw new TypeError("Invalid browser side inset width");
      }
      return { width: Math.min(480, Math.max(0, Math.round(payload.width))) };
    }
    case "setViewport": {
      const payload = strictObject(value, ["x", "y", "width", "height", "visible"]);
      const bounds = [payload.x, payload.y, payload.width, payload.height];
      if (!bounds.every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
        throw new TypeError("Browser viewport bounds must be finite numbers");
      }
      if (payload.width < 0 || payload.height < 0) {
        throw new TypeError("Browser viewport bounds cannot have a negative extent");
      }
      if (typeof payload.visible !== "boolean") {
        throw new TypeError("Browser viewport visibility must be a boolean");
      }
      return {
        height: Math.round(payload.height),
        visible: payload.visible,
        width: Math.round(payload.width),
        x: Math.round(payload.x),
        y: Math.round(payload.y),
      };
    }
    default:
      throw new TypeError(`Unsupported browser chrome command: ${command}`);
  }
}

function createBrowserIpc({ approvalAuthority = null, ipcMain, getControllerForWebContents, windowAuthority = null }) {
  const subscribers = new Set();
  const subscriberCleanup = new Map();
  let registered = false;
  let unsubscribeApprovals = null;

  function projectSnapshot(snapshot, controller) {
    const currentWindowId = controller?.currentWindowId;
    if (!currentWindowId) return snapshot;
    let pendingApprovals = [];
    try {
      const approvalSnapshot = approvalAuthority?.snapshot?.({ windowId: currentWindowId });
      if (Array.isArray(approvalSnapshot?.pendingApprovals)) {
        pendingApprovals = approvalSnapshot.pendingApprovals;
      }
    } catch {
      pendingApprovals = [];
    }
    return deepFreeze({
      ...snapshot,
      currentWindowId,
      pendingApprovals,
    });
  }

  async function publishCurrentSnapshot() {
    for (const webContents of [...subscribers]) {
      if (webContents.isDestroyed?.()) {
        unsubscribe(webContents);
        continue;
      }
      const controller = getControllerForWebContents(webContents);
      if (!controller) {
        unsubscribe(webContents);
        continue;
      }
      if (typeof controller.getSnapshot !== "function") continue;
      try {
        publish(await controller.getSnapshot());
      } catch {
        // A later browser state event will retry projection.
      }
      return;
    }
  }

  async function handleCommand(event, request) {
    const envelope = strictObject(request, ["command", "payload"]);
    if (!COMMAND_SET.has(envelope.command)) {
      throw new TypeError(`Unsupported browser chrome command: ${String(envelope.command)}`);
    }
    const controller = getControllerForWebContents(event.sender);
    if (!controller) throw new Error("No owning browser chrome controller for sender");
    const payload = parsePayload(envelope.command, envelope.payload);
    if (envelope.command === "subscribe") return subscribe(event.sender);
    if (envelope.command === "unsubscribe") return unsubscribe(event.sender);
    if (envelope.command === "resolveApproval") {
      if (!controller.currentWindowId || typeof approvalAuthority?.resolve !== "function") {
        throw new Error("Browser approval authority is unavailable");
      }
      const result = await approvalAuthority.resolve({
        ...payload,
        windowId: controller.currentWindowId,
      });
      if (typeof controller.getSnapshot === "function") publish(await controller.getSnapshot());
      return result;
    }
    if (["createWindow", "focusWindow", "closeWindow", "createTabInWindow"].includes(envelope.command)) {
      const handler = windowAuthority?.[envelope.command];
      if (typeof handler !== "function") throw new Error(`Browser window authority cannot ${envelope.command}`);
      const result = await handler(payload);
      if (typeof controller.getSnapshot === "function") publish(await controller.getSnapshot());
      return result;
    }
    const handler = controller[envelope.command];
    if (typeof handler !== "function") throw new Error(`Browser controller cannot ${envelope.command}`);
    const result = await handler(payload);
    if (envelope.command === "getSnapshot") return projectSnapshot(result, controller);
    if (STATE_MUTATIONS.has(envelope.command) && typeof controller.getSnapshot === "function") {
      publish(await controller.getSnapshot());
    }
    return result;
  }

  function register() {
    if (registered) return false;
    registered = true;
    ipcMain.handle(BROWSER_COMMAND_CHANNEL, handleCommand);
    if (typeof approvalAuthority?.subscribe === "function") {
      unsubscribeApprovals = approvalAuthority.subscribe(() => {
        void publishCurrentSnapshot();
      });
    }
    return true;
  }

  function subscribe(webContents) {
    if (!webContents || webContents.isDestroyed?.()) return false;
    if (subscribers.has(webContents)) return false;
    subscribers.add(webContents);
    if (typeof webContents.once === "function") {
      const onDestroyed = () => unsubscribe(webContents);
      subscriberCleanup.set(webContents, onDestroyed);
      webContents.once("destroyed", onDestroyed);
    }
    return true;
  }

  function unsubscribe(webContents) {
    const removed = subscribers.delete(webContents);
    const cleanup = subscriberCleanup.get(webContents);
    if (cleanup) {
      subscriberCleanup.delete(webContents);
      webContents.removeListener?.("destroyed", cleanup);
    }
    return removed;
  }

  function publish(snapshot) {
    const immutableSnapshot = deepFreeze(snapshot);
    for (const webContents of [...subscribers]) {
      if (webContents.isDestroyed?.()) {
        unsubscribe(webContents);
        continue;
      }
      const controller = getControllerForWebContents(webContents);
      if (!controller) {
        unsubscribe(webContents);
        continue;
      }
      const projectedSnapshot = projectSnapshot(immutableSnapshot, controller);
      webContents.send(BROWSER_SNAPSHOT_CHANNEL, projectedSnapshot);
    }
  }

  function dispose() {
    if (registered) ipcMain.removeHandler(BROWSER_COMMAND_CHANNEL);
    unsubscribeApprovals?.();
    unsubscribeApprovals = null;
    registered = false;
    for (const webContents of [...subscribers]) unsubscribe(webContents);
  }

  return Object.freeze({ dispose, publish, register, subscribe, unsubscribe });
}

module.exports = {
  BROWSER_CHROME_COMMANDS,
  BROWSER_COMMAND_CHANNEL,
  BROWSER_SNAPSHOT_CHANNEL,
  createBrowserIpc,
  parseBrowserChromePayload: parsePayload,
};
