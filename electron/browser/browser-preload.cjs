"use strict";

const { contextBridge, ipcRenderer } = require("electron");
const {
  BROWSER_CHROME_COMMANDS,
  BROWSER_COMMAND_CHANNEL,
  BROWSER_SNAPSHOT_CHANNEL,
} = require("./browser-ipc.cjs");
const {
  NIA_COMMAND_CHANNEL,
  NIA_EVENT_CHANNEL,
  NIA_IPC_COMMANDS,
} = require("../nia/nia-ipc.cjs");
const {
  WORKFLOW_COMMAND_CHANNEL,
  WORKFLOW_EVENT_CHANNEL,
  WORKFLOW_COMMANDS,
} = require("../workflows/workflow-ipc.cjs");

const allowed = new Set(BROWSER_CHROME_COMMANDS.filter(
  (command) => command !== "subscribe" && command !== "unsubscribe",
));
const niaAllowed = new Set(NIA_IPC_COMMANDS.filter(
  (command) => command !== "subscribe" && command !== "unsubscribe",
));
const workflowAllowed = new Set(WORKFLOW_COMMANDS);
const wrappers = new Map();
const niaWrappers = new Map();
const workflowWrappers = new Map();
const MAIN_SUBSCRIPTION_RETRY_MIN_MS = 250;
const MAIN_SUBSCRIPTION_RETRY_MAX_MS = 5_000;
let mainSubscribed = false;
let syncInFlight = false;
let retryTimer = null;
let retryDelayMs = MAIN_SUBSCRIPTION_RETRY_MIN_MS;
let niaMainSubscribed = false;
let niaSyncInFlight = false;
let niaRetryTimer = null;
let niaRetryDelayMs = MAIN_SUBSCRIPTION_RETRY_MIN_MS;

function wantsMainSubscription() {
  return wrappers.size > 0;
}

function needsMainSubscriptionSync() {
  return wantsMainSubscription() !== mainSubscribed;
}

function clearRetryTimer() {
  if (retryTimer !== null) clearTimeout(retryTimer);
  retryTimer = null;
}

function scheduleRetry() {
  if (retryTimer !== null || !needsMainSubscriptionSync()) return;
  const delay = retryDelayMs;
  retryDelayMs = Math.min(retryDelayMs * 2, MAIN_SUBSCRIPTION_RETRY_MAX_MS);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    syncMainSubscription();
  }, delay);
}

function syncMainSubscription() {
  if (syncInFlight) return;
  if (!needsMainSubscriptionSync()) {
    clearRetryTimer();
    retryDelayMs = MAIN_SUBSCRIPTION_RETRY_MIN_MS;
    return;
  }
  if (retryTimer !== null) return;

  const command = wantsMainSubscription() ? "subscribe" : "unsubscribe";
  syncInFlight = true;
  let failed = false;
  void Promise.resolve()
    .then(() => ipcRenderer.invoke(BROWSER_COMMAND_CHANNEL, { command, payload: {} }))
    .then(() => {
      mainSubscribed = command === "subscribe";
      retryDelayMs = MAIN_SUBSCRIPTION_RETRY_MIN_MS;
    })
    .catch(() => {
      failed = true;
    })
    .finally(() => {
      syncInFlight = false;
      if (!needsMainSubscriptionSync()) {
        clearRetryTimer();
        retryDelayMs = MAIN_SUBSCRIPTION_RETRY_MIN_MS;
      } else if (failed) {
        scheduleRetry();
      } else {
        syncMainSubscription();
      }
    });
}

function wantsNiaMainSubscription() {
  return niaWrappers.size > 0;
}

function needsNiaMainSubscriptionSync() {
  return wantsNiaMainSubscription() !== niaMainSubscribed;
}

function clearNiaRetryTimer() {
  if (niaRetryTimer !== null) clearTimeout(niaRetryTimer);
  niaRetryTimer = null;
}

function scheduleNiaRetry() {
  if (niaRetryTimer !== null || !needsNiaMainSubscriptionSync()) return;
  const delay = niaRetryDelayMs;
  niaRetryDelayMs = Math.min(niaRetryDelayMs * 2, MAIN_SUBSCRIPTION_RETRY_MAX_MS);
  niaRetryTimer = setTimeout(() => {
    niaRetryTimer = null;
    syncNiaMainSubscription();
  }, delay);
}

function syncNiaMainSubscription() {
  if (niaSyncInFlight) return;
  if (!needsNiaMainSubscriptionSync()) {
    clearNiaRetryTimer();
    niaRetryDelayMs = MAIN_SUBSCRIPTION_RETRY_MIN_MS;
    return;
  }
  if (niaRetryTimer !== null) return;

  const command = wantsNiaMainSubscription() ? "subscribe" : "unsubscribe";
  niaSyncInFlight = true;
  let failed = false;
  void Promise.resolve()
    .then(() => ipcRenderer.invoke(NIA_COMMAND_CHANNEL, { command, payload: {} }))
    .then(() => {
      niaMainSubscribed = command === "subscribe";
      niaRetryDelayMs = MAIN_SUBSCRIPTION_RETRY_MIN_MS;
    })
    .catch(() => {
      failed = true;
    })
    .finally(() => {
      niaSyncInFlight = false;
      if (!needsNiaMainSubscriptionSync()) {
        clearNiaRetryTimer();
        niaRetryDelayMs = MAIN_SUBSCRIPTION_RETRY_MIN_MS;
      } else if (failed) {
        scheduleNiaRetry();
      } else {
        syncNiaMainSubscription();
      }
    });
}

const api = Object.freeze({
  invoke(command, payload = {}) {
    if (!allowed.has(command)) return Promise.reject(new TypeError("Unsupported browser command"));
    return ipcRenderer.invoke(BROWSER_COMMAND_CHANNEL, { command, payload });
  },
  subscribe(listener) {
    if (typeof listener !== "function" || wrappers.has(listener)) return false;
    const wrapper = (_event, snapshot) => listener(snapshot);
    wrappers.set(listener, wrapper);
    ipcRenderer.on(BROWSER_SNAPSHOT_CHANNEL, wrapper);
    syncMainSubscription();
    return true;
  },
  unsubscribe(listener) {
    const wrapper = wrappers.get(listener);
    if (!wrapper) return false;
    wrappers.delete(listener);
    ipcRenderer.removeListener(BROWSER_SNAPSHOT_CHANNEL, wrapper);
    syncMainSubscription();
    return true;
  },
});

const niaApi = Object.freeze({
  invoke(command, payload = {}) {
    if (!niaAllowed.has(command)) {
      return Promise.reject(new TypeError("Unsupported Nia command"));
    }
    return ipcRenderer.invoke(NIA_COMMAND_CHANNEL, { command, payload });
  },
  subscribe(listener) {
    if (typeof listener !== "function" || niaWrappers.has(listener)) return false;
    const wrapper = (_event, niaEvent) => listener(niaEvent);
    niaWrappers.set(listener, wrapper);
    ipcRenderer.on(NIA_EVENT_CHANNEL, wrapper);
    syncNiaMainSubscription();
    return true;
  },
  unsubscribe(listener) {
    const wrapper = niaWrappers.get(listener);
    if (!wrapper) return false;
    niaWrappers.delete(listener);
    ipcRenderer.removeListener(NIA_EVENT_CHANNEL, wrapper);
    syncNiaMainSubscription();
    return true;
  },
});

const workflowApi = Object.freeze({
  invoke(command, payload = {}) {
    if (!workflowAllowed.has(command)) return Promise.reject(new TypeError("Unsupported workflow command"));
    return ipcRenderer.invoke(WORKFLOW_COMMAND_CHANNEL, { command, payload });
  },
  subscribe(listener) {
    if (typeof listener !== "function" || workflowWrappers.has(listener)) return false;
    const wrapper = (_event, value) => listener(value);
    workflowWrappers.set(listener, wrapper);
    ipcRenderer.on(WORKFLOW_EVENT_CHANNEL, wrapper);
    if (workflowWrappers.size === 1) ipcRenderer.send(`${WORKFLOW_COMMAND_CHANNEL}:subscribe`);
    return true;
  },
  unsubscribe(listener) {
    const wrapper = workflowWrappers.get(listener);
    if (!wrapper) return false;
    workflowWrappers.delete(listener);
    ipcRenderer.removeListener(WORKFLOW_EVENT_CHANNEL, wrapper);
    if (workflowWrappers.size === 0) ipcRenderer.send(`${WORKFLOW_COMMAND_CHANNEL}:unsubscribe`);
    return true;
  },
});

contextBridge.exposeInMainWorld("aurisBrowser", api);
contextBridge.exposeInMainWorld("aurisNia", niaApi);
contextBridge.exposeInMainWorld("aurisWorkflows", workflowApi);
