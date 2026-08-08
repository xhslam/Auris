"use strict";

const { createBrowserIdFactory } = require("./browser-ids.cjs");

const AUTOMATION_MODES = new Set(["Human", "AiSandbox", "AiShared"]);
const TAB_LIFECYCLES = new Set([
  "creating",
  "ready",
  "hibernated",
  "crashed",
  "closed",
]);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

function boundedString(value, maxLength = 2_048) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function optionalIdentity(value) {
  const normalized = boundedString(value, 128).trim();
  return normalized || null;
}

function normalizeHistory(value, fallbackUrl = "") {
  const entries = Array.isArray(value?.entries)
    ? value.entries
      .filter((entry) => typeof entry === "string" && entry !== "")
      .slice(-200)
      .map((entry) => boundedString(entry))
    : [];
  if (entries.length === 0 && fallbackUrl) entries.push(boundedString(fallbackUrl));
  const requestedIndex = Number.isSafeInteger(value?.index) ? value.index : entries.length - 1;
  return {
    entries,
    index: entries.length === 0
      ? -1
      : Math.min(Math.max(requestedIndex, 0), entries.length - 1),
  };
}

function normalizeBounds(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const width = Number.isFinite(value.width) ? Math.max(320, Math.round(value.width)) : null;
  const height = Number.isFinite(value.height) ? Math.max(240, Math.round(value.height)) : null;
  if (width === null || height === null) {
    return null;
  }
  return {
    height,
    width,
    x: Number.isFinite(value.x) ? Math.round(value.x) : undefined,
    y: Number.isFinite(value.y) ? Math.round(value.y) : undefined,
  };
}

function createBrowserRegistry({ ids = createBrowserIdFactory(), now = Date.now } = {}) {
  const windows = new Map();
  const usedWindowIds = new Set();
  const usedTabIds = new Set();
  const listeners = new Set();

  function notify() {
    for (const listener of [...listeners]) {
      try { listener(); } catch { /* Status listeners own their failures. */ }
    }
  }

  function requireWindow(windowId) {
    const windowRecord = windows.get(windowId);
    if (!windowRecord || windowRecord.lifecycle === "closed") {
      return null;
    }
    return windowRecord;
  }

  function tabSnapshot(tab, activeTabId) {
    return {
      active: tab.tabId === activeTabId,
      automationMode: tab.automationMode,
      controlEpoch: tab.controlEpoch,
      crashMode: tab.crashMode,
      crashStreak: tab.crashStreak,
      lifecycle: tab.lifecycle,
      loading: tab.loading,
      navigationGeneration: tab.navigationGeneration,
      policyEpoch: tab.policyEpoch,
      profileIdentity: tab.profileIdentity,
      retained: tab.retained,
      sessionIdentity: tab.sessionIdentity,
      tabId: tab.tabId,
      title: tab.title,
      url: tab.url,
    };
  }

  function windowSnapshot(windowRecord) {
    return deepFreeze({
      activeTabId: windowRecord.activeTabId,
      bounds: windowRecord.bounds ? { ...windowRecord.bounds } : null,
      lastActiveAt: windowRecord.lastActiveAt,
      lifecycle: windowRecord.lifecycle,
      tabs: windowRecord.tabs.map((tab) => tabSnapshot(tab, windowRecord.activeTabId)),
      windowId: windowRecord.windowId,
    });
  }

  function createWindow(input = {}) {
    const windowId = input.windowId || ids.nextWindowId();
    if (usedWindowIds.has(windowId)) {
      throw new Error(`Duplicate browser window ID: ${windowId}`);
    }
    usedWindowIds.add(windowId);
    const record = {
      activeTabId: null,
      bounds: normalizeBounds(input.bounds),
      lastActiveAt: now(),
      lifecycle: "ready",
      tabs: [],
      windowId,
    };
    windows.set(windowId, record);
    notify();
    return windowSnapshot(record);
  }

  function createTab(windowId, input = {}) {
    const windowRecord = requireWindow(windowId);
    if (!windowRecord) {
      throw new Error(`Browser window not found: ${windowId}`);
    }
    const tabId = input.tabId || ids.nextTabId();
    if (usedTabIds.has(tabId)) {
      throw new Error(`Duplicate browser tab ID: ${tabId}`);
    }
    usedTabIds.add(tabId);
    const history = normalizeHistory(input.history, input.url);
    const tab = {
      automationMode: AUTOMATION_MODES.has(input.automationMode)
        ? input.automationMode
        : "Human",
      controlEpoch: Number.isSafeInteger(input.controlEpoch) && input.controlEpoch >= 0
        ? input.controlEpoch
        : 0,
      crashMode: "ok",
      crashStreak: 0,
      lifecycle: "creating",
      historyEntries: history.entries,
      historyIndex: history.index,
      loading: false,
      navigationGeneration:
        Number.isSafeInteger(input.navigationGeneration) && input.navigationGeneration >= 0
          ? input.navigationGeneration
          : 0,
      policyEpoch: Number.isSafeInteger(input.policyEpoch) && input.policyEpoch >= 0
        ? input.policyEpoch
        : 0,
      requestedNavigationGeneration:
        Number.isSafeInteger(input.navigationGeneration) && input.navigationGeneration >= 0
          ? input.navigationGeneration
          : 0,
      profileIdentity: optionalIdentity(input.profileIdentity),
      retained: input.retained === true,
      sessionIdentity: optionalIdentity(input.sessionIdentity),
      tabId,
      title: boundedString(input.title, 512),
      url: boundedString(input.url),
    };
    windowRecord.tabs.push(tab);
    windowRecord.activeTabId = tabId;
    windowRecord.lastActiveAt = now();
    notify();
    return deepFreeze(tabSnapshot(tab, windowRecord.activeTabId));
  }

  function activateWindow(windowId) {
    const windowRecord = requireWindow(windowId);
    if (!windowRecord) {
      return false;
    }
    windowRecord.lastActiveAt = now();
    notify();
    return true;
  }

  function updateWindowBounds(windowId, bounds) {
    const windowRecord = requireWindow(windowId);
    const normalized = normalizeBounds(bounds);
    if (!windowRecord || !normalized) return false;
    windowRecord.bounds = normalized;
    notify();
    return true;
  }

  function activateTab(windowId, tabId) {
    const windowRecord = requireWindow(windowId);
    if (!windowRecord || !windowRecord.tabs.some((tab) => tab.tabId === tabId)) {
      return false;
    }
    windowRecord.activeTabId = tabId;
    windowRecord.lastActiveAt = now();
    notify();
    return true;
  }

  function updateTab(windowId, tabId, patch = {}) {
    const windowRecord = requireWindow(windowId);
    const tab = windowRecord?.tabs.find((candidate) => candidate.tabId === tabId);
    if (!tab || tab.lifecycle === "closed") {
      return false;
    }
    if (Object.hasOwn(patch, "title")) {
      tab.title = boundedString(patch.title, 512);
    }
    if (Object.hasOwn(patch, "url")) {
      tab.url = boundedString(patch.url);
    }
    if (Object.hasOwn(patch, "loading")) {
      tab.loading = patch.loading === true;
    }
    notify();
    return true;
  }

  function rotateControlEpoch(windowId, tabId) {
    const windowRecord = requireWindow(windowId);
    const tab = windowRecord?.tabs.find((candidate) => candidate.tabId === tabId);
    if (!tab || tab.lifecycle === "closed") {
      return null;
    }
    tab.controlEpoch += 1;
    notify();
    return tab.controlEpoch;
  }

  function commitNavigation(windowId, tabId, patch = {}) {
    const windowRecord = requireWindow(windowId);
    const tab = windowRecord?.tabs.find((candidate) => candidate.tabId === tabId);
    if (!tab || tab.lifecycle === "closed") {
      return false;
    }
    if (Number.isSafeInteger(patch.expectedGeneration)) {
      if (
        patch.expectedGeneration !== tab.requestedNavigationGeneration
        || patch.expectedGeneration <= tab.navigationGeneration
      ) return false;
      tab.navigationGeneration = patch.expectedGeneration;
    } else {
      tab.navigationGeneration += 1;
      tab.requestedNavigationGeneration = Math.max(
        tab.requestedNavigationGeneration,
        tab.navigationGeneration,
      );
    }
    tab.controlEpoch += 1;
    const nextUrl = boundedString(patch.url ?? tab.url);
    if (nextUrl && tab.historyEntries[tab.historyIndex] !== nextUrl) {
      if (tab.historyEntries[tab.historyIndex - 1] === nextUrl) {
        tab.historyIndex -= 1;
      } else if (tab.historyEntries[tab.historyIndex + 1] === nextUrl) {
        tab.historyIndex += 1;
      } else {
        tab.historyEntries.splice(tab.historyIndex + 1);
        tab.historyEntries.push(nextUrl);
        if (tab.historyEntries.length > 200) tab.historyEntries.shift();
        tab.historyIndex = tab.historyEntries.length - 1;
      }
    }
    tab.url = nextUrl;
    tab.title = boundedString(patch.title ?? tab.title, 512);
    tab.loading = patch.loading === true;
    notify();
    return true;
  }

  function beginNavigation(windowId, tabId) {
    const windowRecord = requireWindow(windowId);
    const tab = windowRecord?.tabs.find((candidate) => candidate.tabId === tabId);
    if (!tab || tab.lifecycle === "closed") return null;
    tab.requestedNavigationGeneration += 1;
    notify();
    return tab.requestedNavigationGeneration;
  }

  function setTabLifecycle(windowId, tabId, lifecycle) {
    if (!TAB_LIFECYCLES.has(lifecycle) || lifecycle === "closed") {
      return false;
    }
    const windowRecord = requireWindow(windowId);
    const tab = windowRecord?.tabs.find((candidate) => candidate.tabId === tabId);
    if (!tab || tab.lifecycle === "closed") {
      return false;
    }
    tab.lifecycle = lifecycle;
    notify();
    return true;
  }

  function setCrashState(windowId, tabId, { crashMode = "ok", crashStreak = 0 } = {}) {
    const windowRecord = requireWindow(windowId);
    const tab = windowRecord?.tabs.find((candidate) => candidate.tabId === tabId);
    if (!tab || tab.lifecycle === "closed") return false;
    if (!["ok", "auto", "manual-only"].includes(crashMode)) {
      throw new TypeError("Invalid browser crash mode.");
    }
    tab.crashMode = crashMode;
    tab.crashStreak = Number.isSafeInteger(crashStreak) && crashStreak >= 0
      ? crashStreak
      : 0;
    notify();
    return true;
  }

  /**
   * Authority-free runtime reset for crash/hibernate recovery.
   * Clears history and identities; bumps epochs so old leases/refs die.
   */
  function resetTabRuntimeAuthority(windowId, tabId, {
    automationMode,
    title,
    url,
  } = {}) {
    const windowRecord = requireWindow(windowId);
    const tab = windowRecord?.tabs.find((candidate) => candidate.tabId === tabId);
    if (!tab || tab.lifecycle === "closed") return null;
    if (AUTOMATION_MODES.has(automationMode)) {
      tab.automationMode = automationMode;
    }
    const nextUrl = boundedString(url ?? tab.url);
    const nextTitle = boundedString(title ?? tab.title, 512);
    tab.url = nextUrl;
    tab.title = nextTitle;
    tab.historyEntries = nextUrl ? [nextUrl] : [];
    tab.historyIndex = nextUrl ? 0 : -1;
    tab.controlEpoch += 1;
    tab.navigationGeneration += 1;
    tab.requestedNavigationGeneration = tab.navigationGeneration;
    tab.policyEpoch += 1;
    tab.profileIdentity = null;
    tab.sessionIdentity = null;
    tab.loading = false;
    tab.crashMode = "ok";
    tab.crashStreak = 0;
    notify();
    return deepFreeze(tabSnapshot(tab, windowRecord.activeTabId));
  }

  function setTabRetained(windowId, tabId, retained) {
    const windowRecord = requireWindow(windowId);
    const tab = windowRecord?.tabs.find((candidate) => candidate.tabId === tabId);
    if (!tab || tab.lifecycle === "closed" || tab.automationMode !== "Human") return false;
    tab.retained = retained === true;
    notify();
    return true;
  }

  function closeTab(windowId, tabId) {
    const windowRecord = requireWindow(windowId);
    if (!windowRecord) {
      return false;
    }
    const index = windowRecord.tabs.findIndex((tab) => tab.tabId === tabId);
    if (index < 0) {
      return false;
    }
    windowRecord.tabs[index].lifecycle = "closed";
    windowRecord.tabs.splice(index, 1);
    if (windowRecord.tabs.length === 0) {
      closeWindow(windowId);
      return true;
    }
    if (windowRecord.activeTabId === tabId) {
      const replacementIndex = Math.min(index, windowRecord.tabs.length - 1);
      windowRecord.activeTabId = windowRecord.tabs[replacementIndex].tabId;
    }
    notify();
    return true;
  }

  function closeWindow(windowId) {
    const windowRecord = requireWindow(windowId);
    if (!windowRecord) {
      return false;
    }
    windowRecord.lifecycle = "closed";
    for (const tab of windowRecord.tabs) {
      tab.lifecycle = "closed";
    }
    windowRecord.tabs.length = 0;
    windowRecord.activeTabId = null;
    windows.delete(windowId);
    notify();
    return true;
  }

  function getWindow(windowId) {
    const windowRecord = requireWindow(windowId);
    return windowRecord ? windowSnapshot(windowRecord) : null;
  }

  function getTab(windowId, tabId) {
    const windowRecord = requireWindow(windowId);
    const tab = windowRecord?.tabs.find((candidate) => candidate.tabId === tabId);
    return tab ? deepFreeze(tabSnapshot(tab, windowRecord.activeTabId)) : null;
  }

  function getHistory(windowId, tabId) {
    const windowRecord = requireWindow(windowId);
    const tab = windowRecord?.tabs.find((candidate) => candidate.tabId === tabId);
    if (!tab) return null;
    return deepFreeze({ entries: [...tab.historyEntries], index: tab.historyIndex });
  }

  function restoreHistory(windowId, tabId, history) {
    const windowRecord = requireWindow(windowId);
    const tab = windowRecord?.tabs.find((candidate) => candidate.tabId === tabId);
    if (!tab || tab.lifecycle === "closed") return false;
    const normalized = normalizeHistory(history, tab.url);
    tab.historyEntries = normalized.entries;
    tab.historyIndex = normalized.index;
    if (normalized.index >= 0) tab.url = normalized.entries[normalized.index];
    notify();
    return true;
  }

  function exportWindowSession(windowId) {
    const windowRecord = requireWindow(windowId);
    if (!windowRecord) return null;
    return deepFreeze({
      bounds: windowRecord.bounds ? { ...windowRecord.bounds } : null,
      tabs: windowRecord.tabs.map((tab) => ({
        ...tabSnapshot(tab, windowRecord.activeTabId),
        history: { entries: [...tab.historyEntries], index: tab.historyIndex },
      })),
    });
  }

  function getMostRecentWindow() {
    const record = [...windows.values()]
      .filter((windowRecord) => windowRecord.lifecycle !== "closed")
      .sort((left, right) => right.lastActiveAt - left.lastActiveAt)[0];
    return record ? windowSnapshot(record) : null;
  }

  function snapshot() {
    return deepFreeze({
      windows: [...windows.values()].map(windowSnapshot),
    });
  }

  function subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("Browser registry listener is required.");
    listeners.add(listener);
    let active = true;
    return () => {
      if (!active) return false;
      active = false;
      return listeners.delete(listener);
    };
  }

  return Object.freeze({
    activateTab,
    activateWindow,
    beginNavigation,
    closeTab,
    closeWindow,
    commitNavigation,
    createTab,
    createWindow,
    exportWindowSession,
    getHistory,
    getMostRecentWindow,
    getTab,
    getWindow,
    resetTabRuntimeAuthority,
    restoreHistory,
    rotateControlEpoch,
    setCrashState,
    setTabLifecycle,
    setTabRetained,
    snapshot,
    subscribe,
    updateTab,
    updateWindowBounds,
  });
}

module.exports = {
  AUTOMATION_MODES: Object.freeze([...AUTOMATION_MODES]),
  TAB_LIFECYCLES: Object.freeze([...TAB_LIFECYCLES]),
  createBrowserRegistry,
  deepFreeze,
};
