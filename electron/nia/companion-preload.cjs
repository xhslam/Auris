"use strict";

const { contextBridge, ipcRenderer } = require("electron");
const {
  COMMAND_CHANNEL,
  EVENT_CHANNEL,
  REPORT_CHANNEL,
} = require("./companion/companion-ipc.cjs");

const allowedCommands = new Set([
  "snapshot",
  "open-session",
  "sdp",
  "pointer-capture",
  "drag-begin",
  "drag-to",
  "drag-end",
  "open-nia",
  "wake",
  "menu",
]);

function invoke(command, payload = {}) {
  if (!allowedCommands.has(command)) return Promise.reject(new TypeError("Unsupported Nia companion command."));
  return ipcRenderer.invoke(COMMAND_CHANNEL, { command, payload });
}

const eventListeners = new Map();
const bridge = Object.freeze({
  command: invoke,
  getSnapshot: () => invoke("snapshot"),
  openSession: () => invoke("open-session"),
  sdp: (sessionId, offer) => invoke("sdp", { sessionId, offer }),
  pointerCapture: (enabled) => invoke("pointer-capture", { enabled: enabled === true }),
  dragBegin: (x, y) => invoke("drag-begin", { x, y }),
  dragTo: (x, y) => invoke("drag-to", { x, y }),
  dragEnd: (payload = {}) => invoke("drag-end", payload),
  openNia: () => invoke("open-nia"),
  wake: () => invoke("wake"),
  showMenu: () => invoke("menu"),
  subscribe(listener) {
    if (typeof listener !== "function" || eventListeners.has(listener)) return false;
    const wrapper = (_event, value) => listener(value);
    eventListeners.set(listener, wrapper);
    ipcRenderer.on(EVENT_CHANNEL, wrapper);
    return true;
  },
  unsubscribe(listener) {
    const wrapper = eventListeners.get(listener);
    if (!wrapper) return false;
    eventListeners.delete(listener);
    ipcRenderer.removeListener(EVENT_CHANNEL, wrapper);
    return true;
  },
  report(report) {
    ipcRenderer.send(REPORT_CHANNEL, report);
    return true;
  },
  ready(payload = {}) {
    ipcRenderer.send(`${REPORT_CHANNEL}:ready`, payload);
    return true;
  },
});

contextBridge.exposeInMainWorld("niaCompanion", bridge);
