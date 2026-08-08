"use strict";

const BROWSER_STATUS_COMMAND_CHANNEL = "shadowing:browser-status:command";
const BROWSER_STATUS_EVENT_CHANNEL = "shadowing:browser-status:changed";
const BROWSER_STATUS_COMMANDS = Object.freeze(["getBrowserStatus", "focusBrowserWindow", "focusBrowserTab", "subscribe", "unsubscribe"]);
const COMMANDS = new Set(BROWSER_STATUS_COMMANDS);
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/u;

function strictObject(value, allowed) {
  const input = value === undefined ? {} : value;
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Browser status request must be an object.");
  for (const key of Object.keys(input)) if (!allowed.includes(key)) throw new TypeError(`Unknown Browser status key: ${key}`);
  return input;
}

function id(value, label) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) throw new TypeError(`Invalid Browser ${label}.`);
  return value;
}

function parseRequest(value) {
  const request = strictObject(value, ["command", "windowId", "tabId"]);
  if (!COMMANDS.has(request.command)) throw new TypeError("Unsupported Browser status command.");
  if (["getBrowserStatus", "subscribe", "unsubscribe"].includes(request.command)) {
    strictObject(value, ["command"]);
    return Object.freeze({ command: request.command });
  }
  if (request.command === "focusBrowserWindow") {
    strictObject(value, ["command", "windowId"]);
    return Object.freeze({ command: request.command, windowId: id(request.windowId, "window ID") });
  }
  strictObject(value, ["command", "windowId", "tabId"]);
  return Object.freeze({ command: request.command, windowId: id(request.windowId, "window ID"), tabId: id(request.tabId, "tab ID") });
}

function createBrowserStatusIpc({
  focusBrowserTab,
  focusBrowserWindow,
  ipcMain,
  requireTrustedMainEvent,
  statusService,
} = {}) {
  if (!ipcMain || typeof ipcMain.handle !== "function") throw new TypeError("Browser status IPC requires ipcMain.");
  if (!statusService || typeof statusService.getSnapshot !== "function") throw new TypeError("Browser status IPC requires the status service.");
  const subscribers = new Set();
  const cleanupBySender = new Map();
  let registered = false;
  let unsubscribeStatus = null;

  function requireCaller(event) {
    if (typeof requireTrustedMainEvent !== "function") throw new TypeError("Browser status caller policy is unavailable.");
    requireTrustedMainEvent(event);
    return event.sender;
  }

  function unsubscribe(sender) {
    const removed = subscribers.delete(sender);
    const cleanup = cleanupBySender.get(sender);
    if (cleanup) sender.removeListener?.("destroyed", cleanup);
    cleanupBySender.delete(sender);
    return removed;
  }

  function subscribe(sender) {
    if (!sender || sender.isDestroyed?.() || subscribers.has(sender)) return false;
    subscribers.add(sender);
    const cleanup = () => unsubscribe(sender);
    cleanupBySender.set(sender, cleanup);
    sender.once?.("destroyed", cleanup);
    return true;
  }

  function publish(snapshot = statusService.getSnapshot()) {
    for (const sender of [...subscribers]) {
      if (sender.isDestroyed?.()) { unsubscribe(sender); continue; }
      sender.send(BROWSER_STATUS_EVENT_CHANNEL, snapshot);
    }
  }

  async function handle(event, input) {
    const sender = requireCaller(event);
    const request = parseRequest(input);
    if (request.command === "getBrowserStatus") return statusService.getSnapshot();
    if (request.command === "subscribe") return subscribe(sender);
    if (request.command === "unsubscribe") return unsubscribe(sender);
    if (request.command === "focusBrowserWindow") return focusBrowserWindow(request.windowId);
    return focusBrowserTab(request.windowId, request.tabId);
  }

  function register() {
    if (registered) return false;
    registered = true;
    ipcMain.handle(BROWSER_STATUS_COMMAND_CHANNEL, handle);
    unsubscribeStatus = statusService.subscribe(publish);
    return true;
  }

  function dispose() {
    if (!registered) return false;
    ipcMain.removeHandler(BROWSER_STATUS_COMMAND_CHANNEL);
    unsubscribeStatus?.();
    unsubscribeStatus = null;
    for (const sender of [...subscribers]) unsubscribe(sender);
    registered = false;
    return true;
  }

  return Object.freeze({ dispose, publish, register });
}

module.exports = {
  BROWSER_STATUS_COMMAND_CHANNEL,
  BROWSER_STATUS_COMMANDS,
  BROWSER_STATUS_EVENT_CHANNEL,
  createBrowserStatusIpc,
  parseBrowserStatusRequest: parseRequest,
};
