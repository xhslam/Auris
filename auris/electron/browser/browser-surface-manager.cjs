"use strict";

const { createBrowserPagePolicy } = require("./browser-page-policy.cjs");

function createBrowserSurfaceManager({
  WebContentsView,
  attachHumanReclaim = null,
  attachDialogService = null,
  attachDownloadService = null,
  chromeInset = 112,
  // Reserve the right-hand HTML Nia dock so the native page view cannot cover it.
  sideInsetRight = 360,
  pageBackgroundColor = "#edf3e8",
  createPagePolicy = createBrowserPagePolicy,
  onEvent = () => undefined,
} = {}) {
  if (typeof WebContentsView !== "function") {
    throw new TypeError("WebContentsView constructor is required");
  }
  const surfaces = new Map();
  const windowBackgrounds = new Map();
  const windowSideInsets = new Map();
  const defaultSideInsetRight = Math.min(480, Math.max(0, Math.round(sideInsetRight)));

  function resolveSideInset(windowId) {
    if (typeof windowId === "string" && windowSideInsets.has(windowId)) {
      return windowSideInsets.get(windowId);
    }
    return defaultSideInsetRight;
  }

  function key(windowId, tabId) {
    return `${windowId}\u0000${tabId}`;
  }

  function resolveBackground(windowId) {
    return windowBackgrounds.get(windowId) || pageBackgroundColor;
  }

  function applyViewBackground(view, color) {
    if (view && typeof view.setBackgroundColor === "function") {
      view.setBackgroundColor(color);
    }
  }

  function createSurface({
    hostWindow,
    initialUrl,
    partitionContext = null,
    tabId,
    windowId,
  }) {
    const surfaceKey = key(windowId, tabId);
    if (surfaces.has(surfaceKey)) {
      throw new Error(`Duplicate browser surface: ${windowId}/${tabId}`);
    }
    const webPreferences = partitionContext?.webPreferences
      ? { ...partitionContext.webPreferences }
      : {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      };
    const view = new WebContentsView({ webPreferences });
    applyViewBackground(view, resolveBackground(windowId));
    const record = {
      active: false,
      automationMode: partitionContext?.automationMode ?? "Human",
      destroyed: false,
      disposeDialogs: null,
      disposeDownloads: null,
      disposePolicy: null,
      disposeReclaim: null,
      expectedNavigations: new Map(),
      hostWindow,
      listeners: [],
      partition: partitionContext?.partition ?? null,
      tabId,
      view,
      windowId,
    };

    const listen = (name, listener) => {
      const guarded = (...args) => {
        if (!record.destroyed) listener(...args);
      };
      view.webContents.on(name, guarded);
      record.listeners.push([name, guarded]);
    };
    listen("did-start-loading", () => onEvent({ tabId, type: "loading-started", windowId }));
    listen("did-stop-loading", () => onEvent({ tabId, type: "loading-stopped", windowId }));
    listen("did-finish-load", () => onEvent({ tabId, type: "load-succeeded", windowId }));
    listen("did-fail-load", (_event, errorCode, errorDescription, _validatedURL, isMainFrame) => {
      if (isMainFrame === false) return;
      onEvent({
        errorCode,
        errorDescription,
        tabId,
        type: "load-failed",
        windowId,
      });
    });
    listen("did-navigate", (_event, url) => {
      const expectedGeneration = record.expectedNavigations.get(url);
      if (expectedGeneration !== undefined) record.expectedNavigations.delete(url);
      onEvent({
        ...(expectedGeneration === undefined ? {} : { expectedGeneration }),
        tabId,
        type: "navigated",
        url,
        windowId,
      });
    });
    listen("render-process-gone", (_event, details) =>
      onEvent({ details, tabId, type: "crashed", windowId }),
    );
    listen("unresponsive", () => onEvent({ tabId, type: "unresponsive", windowId }));
    listen("responsive", () => onEvent({ tabId, type: "responsive", windowId }));
    if (typeof attachHumanReclaim === "function") {
      record.disposeReclaim = attachHumanReclaim(view.webContents, { tabId, windowId });
    }
    if (partitionContext && typeof partitionContext.attachPagePolicy === "function") {
      record.disposePolicy = partitionContext.attachPagePolicy(view.webContents);
    } else {
      record.disposePolicy = createPagePolicy().attach(view.webContents);
    }
    if (typeof attachDialogService === "function") {
      record.disposeDialogs = attachDialogService(view.webContents, { tabId, windowId });
    }
    if (typeof attachDownloadService === "function") {
      record.disposeDownloads = attachDownloadService(view.webContents, { tabId, windowId });
    }
    hostWindow.contentView.addChildView(view);
    view.setVisible(false);
    surfaces.set(surfaceKey, record);

    const loadPromise = initialUrl
      ? Promise.resolve().then(() => view.webContents.loadURL(initialUrl))
      : Promise.resolve();
    return Object.freeze({
      automationMode: record.automationMode,
      loadPromise,
      partition: record.partition,
      tabId,
      view,
      windowId,
    });
  }

  function activateSurface(windowId, tabId) {
    const target = surfaces.get(key(windowId, tabId));
    if (!target || target.destroyed) return false;
    for (const record of surfaces.values()) {
      if (record.windowId !== windowId || record.destroyed) continue;
      record.active = record === target;
      record.view.setVisible(record.active);
    }
    return true;
  }

  function expectNavigation(windowId, tabId, url, generation) {
    const record = surfaces.get(key(windowId, tabId));
    if (!record || record.destroyed || !Number.isSafeInteger(generation)) return false;
    record.expectedNavigations.set(url, generation);
    return true;
  }

  function layoutWindow(windowId, bounds) {
    const width = Number.isFinite(bounds?.width) ? Math.max(0, Math.round(bounds.width)) : 0;
    const totalHeight = Number.isFinite(bounds?.height) ? Math.max(0, Math.round(bounds.height)) : 0;
    const inset = Math.min(Math.max(0, chromeInset), totalHeight);
    const side = Math.min(Math.max(0, Math.round(resolveSideInset(windowId))), width);
    const pageBounds = {
      height: Math.max(0, totalHeight - inset),
      width: Math.max(0, width - side),
      x: 0,
      y: inset,
    };
    for (const record of surfaces.values()) {
      if (record.windowId === windowId && record.active && !record.destroyed) {
        record.view.setBounds(pageBounds);
      }
    }
    return pageBounds;
  }

  function setSideInsetRight(windowId, width) {
    if (typeof windowId !== "string" || windowId.length === 0) {
      throw new TypeError("windowId is required to set the Nia side inset");
    }
    if (!Number.isFinite(width)) {
      throw new TypeError("side inset width must be a finite number");
    }
    const clamped = Math.min(480, Math.max(0, Math.round(width)));
    windowSideInsets.set(windowId, clamped);
    return clamped;
  }

  function setWindowBackgroundColor(windowId, backgroundColor) {
    if (typeof windowId !== "string" || typeof backgroundColor !== "string") return false;
    windowBackgrounds.set(windowId, backgroundColor);
    for (const record of surfaces.values()) {
      if (record.windowId === windowId && !record.destroyed) {
        applyViewBackground(record.view, backgroundColor);
      }
    }
    return true;
  }

  function destroySurface(windowId, tabId) {
    const surfaceKey = key(windowId, tabId);
    const record = surfaces.get(surfaceKey);
    if (!record || record.destroyed) return false;
    record.destroyed = true;
    surfaces.delete(surfaceKey);
    for (const [name, listener] of record.listeners) {
      record.view.webContents.removeListener(name, listener);
    }
    record.listeners.length = 0;
    record.expectedNavigations.clear();
    try {
      record.disposeDialogs?.();
    } catch {
      // Dialog drain is best-effort during teardown.
    }
    record.disposeDialogs = null;
    try {
      record.disposeDownloads?.();
    } catch {
      // Download cancel is best-effort during teardown.
    }
    record.disposeDownloads = null;
    try {
      record.disposeReclaim?.();
    } catch {
      // Reclaim detach is best-effort during teardown.
    }
    record.disposeReclaim = null;
    try {
      record.disposePolicy?.();
    } catch {
      // Page-policy detach is best-effort during teardown.
    }
    record.disposePolicy = null;
    try {
      if (!record.hostWindow?.isDestroyed?.()) {
        record.hostWindow.contentView.removeChildView(record.view);
      }
    } catch {
      // Host may already be gone when the closed handler runs.
    }
    try {
      if (!record.view.webContents.isDestroyed?.()) {
        record.view.webContents.destroy();
      }
    } catch {
      // WebContents may already be destroyed with the host window.
    }
    return true;
  }

  function destroyWindow(windowId) {
    const targets = [...surfaces.values()].filter((record) => record.windowId === windowId);
    for (const record of targets) destroySurface(record.windowId, record.tabId);
    windowBackgrounds.delete(windowId);
    windowSideInsets.delete(windowId);
    return targets.length;
  }

  function getSurface(windowId, tabId) {
    const record = surfaces.get(key(windowId, tabId));
    return record && !record.destroyed
      ? Object.freeze({ active: record.active, tabId, view: record.view, windowId })
      : null;
  }

  return Object.freeze({
    activateSurface,
    createSurface,
    destroySurface,
    destroyWindow,
    expectNavigation,
    getSurface,
    layoutWindow,
    setSideInsetRight,
    setWindowBackgroundColor,
  });
}

module.exports = { createBrowserSurfaceManager };
