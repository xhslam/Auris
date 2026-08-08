"use strict";

const { decideHttpNavigation } = require("./browser-page-policy.cjs");

function createBrowserWindowManager({
  BrowserWindow,
  capabilities,
  hibernation = null,
  logger = () => undefined,
  onAuthorityPurge = null,
  partitionSelector = null,
  platform = process.platform,
  preloadPath,
  recovery = null,
  registry,
  screen,
  stateRepository = null,
  surfaceManager,
  targetUrl,
} = {}) {
  const nativeWindows = new Map();
  const controllersBySender = new Map();
  const closedSessions = [];
  const hibernatedTabs = new Map();
  const pendingAutoReloads = new Map();
  let closingAll = false;

  function chromeUrl() {
    return new URL("/browser", targetUrl).href;
  }

  function hibernateKey(windowId, tabId) {
    return `${windowId}\u0000${tabId}`;
  }

  function getNativeWindow(windowId) {
    const nativeWindow = nativeWindows.get(windowId);
    return nativeWindow && !nativeWindow.isDestroyed?.() ? nativeWindow : null;
  }

  function resolveTab(windowId, requestedTabId) {
    const windowSnapshot = registry.getWindow(windowId);
    const tabId = requestedTabId ?? windowSnapshot?.activeTabId;
    return tabId ? registry.getTab(windowId, tabId) : null;
  }

  function pageContents(windowId, tabId) {
    return surfaceManager.getSurface(windowId, tabId)?.view?.webContents ?? null;
  }

  function publishSnapshot() {
    return Object.freeze({
      ...registry.snapshot(),
      bookmarks: Object.freeze(stateRepository?.listBookmarks?.() ?? []),
    });
  }

  function purgeAuthority(windowId, tabId, meta) {
    if (typeof onAuthorityPurge === "function") {
      try {
        onAuthorityPurge(windowId, tabId, meta);
      } catch {
        /* authority owners own their failures */
      }
    }
  }

  function clearPendingReload(windowId, tabId) {
    const key = hibernateKey(windowId, tabId);
    const timer = pendingAutoReloads.get(key);
    if (timer) {
      clearTimeout(timer);
      pendingAutoReloads.delete(key);
    }
  }

  async function recreateSurface(windowId, tabId, { url, title, automationMode }) {
    const nativeWindow = getNativeWindow(windowId);
    if (!nativeWindow) return false;
    clearPendingReload(windowId, tabId);
    surfaceManager.destroySurface(windowId, tabId);
    const reset = registry.resetTabRuntimeAuthority?.(windowId, tabId, {
      automationMode,
      title,
      url,
    });
    if (!reset) return false;
    registry.setTabLifecycle(windowId, tabId, "creating");
    const partitionContext = partitionSelector?.select?.(reset.automationMode) ?? null;
    const surface = surfaceManager.createSurface({
      hostWindow: nativeWindow,
      initialUrl: url || undefined,
      ...(partitionContext ? { partitionContext } : {}),
      tabId,
      windowId,
    });
    if (registry.getTab(windowId, tabId)?.active) {
      surfaceManager.activateSurface(windowId, tabId);
    }
    surfaceManager.layoutWindow(windowId, nativeWindow.getContentBounds());
    await surface.loadPromise;
    return true;
  }

  function scheduleAutoReload(windowId, tabId, delayMs) {
    const key = hibernateKey(windowId, tabId);
    clearPendingReload(windowId, tabId);
    const timer = setTimeout(() => {
      pendingAutoReloads.delete(key);
      const tab = registry.getTab(windowId, tabId);
      if (!tab || tab.lifecycle === "closed") return;
      void recreateSurface(windowId, tabId, {
        automationMode: tab.automationMode,
        title: tab.title,
        url: tab.url,
      }).catch(() => undefined);
    }, Math.max(0, delayMs || 0));
    pendingAutoReloads.set(key, timer);
  }

  function handleSurfaceEvent(event) {
    const { windowId, tabId, type } = event || {};
    if (!windowId || !tabId) return publishSnapshot();

    if (type === "navigated") {
      registry.commitNavigation(windowId, tabId, {
        expectedGeneration: event.expectedGeneration,
        url: event.url,
      });
      return publishSnapshot();
    }
    if (type === "loading-started") {
      registry.updateTab(windowId, tabId, { loading: true });
      return publishSnapshot();
    }
    if (type === "loading-stopped") {
      registry.updateTab(windowId, tabId, { loading: false });
      return publishSnapshot();
    }
    if (type === "load-succeeded") {
      recovery?.noteSuccessfulLoad?.(windowId, tabId);
      registry.setCrashState?.(windowId, tabId, { crashMode: "ok", crashStreak: 0 });
      registry.setTabLifecycle(windowId, tabId, "ready");
      registry.updateTab(windowId, tabId, { loading: false });
      return publishSnapshot();
    }
    if (type === "load-failed" || type === "crashed" || type === "unresponsive") {
      const kind = type === "load-failed"
        ? "failed-load"
        : type === "unresponsive"
          ? "unresponsive"
          : "crash";
      purgeAuthority(windowId, tabId, { kind });
      registry.setTabLifecycle(windowId, tabId, "crashed");
      registry.updateTab(windowId, tabId, { loading: false });
      if (!recovery) return publishSnapshot();
      const decision = recovery.noteFailure(windowId, tabId, { kind });
      registry.setCrashState?.(windowId, tabId, {
        crashMode: decision.action === "manual-only" ? "manual-only" : "auto",
        crashStreak: decision.streak,
      });
      if (decision.action === "auto-reload") {
        scheduleAutoReload(windowId, tabId, decision.delayMs);
      }
      return publishSnapshot();
    }
    if (type === "responsive") {
      return publishSnapshot();
    }
    return publishSnapshot();
  }

  function hibernateTab(windowId, tabId) {
    if (!hibernation) return false;
    const tab = registry.getTab(windowId, tabId);
    const windowRecord = registry.getWindow(windowId);
    if (!tab || !windowRecord) return false;
    const context = {
      active: tab.active === true,
      controlled: false,
      lastActiveAt: windowRecord.lastActiveAt,
      lifecycle: tab.lifecycle,
      loading: tab.loading === true,
      pendingApproval: false,
      tabId,
      windowId,
    };
    if (!hibernation.canHibernate(context)) return false;
    const serialized = hibernation.serialize(tab);
    clearPendingReload(windowId, tabId);
    purgeAuthority(windowId, tabId, { kind: "hibernate" });
    surfaceManager.destroySurface(windowId, tabId);
    registry.resetTabRuntimeAuthority?.(windowId, tabId, serialized);
    registry.setTabLifecycle(windowId, tabId, "hibernated");
    hibernatedTabs.set(hibernateKey(windowId, tabId), {
      ...serialized,
      hibernatedAt: hibernation.markHibernatedAt(),
    });
    return true;
  }

  async function wakeHibernatedTab(windowId, tabId) {
    const key = hibernateKey(windowId, tabId);
    const serialized = hibernatedTabs.get(key);
    const tab = registry.getTab(windowId, tabId);
    if (!tab || tab.lifecycle !== "hibernated") return false;
    hibernatedTabs.delete(key);
    await recreateSurface(windowId, tabId, {
      automationMode: serialized?.automationMode ?? tab.automationMode,
      title: serialized?.title ?? tab.title,
      url: serialized?.url ?? tab.url,
    });
    return true;
  }

  function createController(windowId, nativeWindow) {
    return Object.freeze({
      currentWindowId: windowId,
      getSnapshot: async () => Object.freeze({
        ...publishSnapshot(),
        currentWindowId: windowId,
      }),
      createTab: async (input = {}) => {
        const {
          automationMode = "Human",
          confirmAiShared = false,
          history,
          retained,
          title,
          url,
        } = input;
        if (url && !decideHttpNavigation(url).allowed) throw new TypeError("Navigation blocked");
        if (!["Human", "AiSandbox", "AiShared"].includes(automationMode)) {
          throw new TypeError("Invalid browser automation mode");
        }
        if (automationMode === "AiShared" && confirmAiShared !== true) {
          throw new TypeError("AiShared tabs require explicit confirmation");
        }
        const partitionContext = partitionSelector?.select?.(automationMode) ?? null;
        const tab = registry.createTab(windowId, {
          automationMode,
          history,
          retained,
          title,
          url: url ?? "",
        });
        const historyEntries = Array.isArray(history?.entries) ? history.entries : [];
        const surface = surfaceManager.createSurface({
          hostWindow: nativeWindow,
          initialUrl: historyEntries[0] ?? url,
          ...(partitionContext ? { partitionContext } : {}),
          tabId: tab.tabId,
          windowId,
        });
        surfaceManager.activateSurface(windowId, tab.tabId);
        surfaceManager.layoutWindow(windowId, nativeWindow.getContentBounds());
        await surface.loadPromise;
        if (historyEntries.length > 1) {
          const contents = pageContents(windowId, tab.tabId);
          for (const historyUrl of historyEntries.slice(1)) {
            await contents?.loadURL?.(historyUrl);
          }
          contents?.navigationHistory?.goToIndex?.(history.index);
          registry.restoreHistory?.(windowId, tab.tabId, history);
        }
        return tab;
      },
      closeTab: async ({ tabId }) => {
        clearPendingReload(windowId, tabId);
        hibernatedTabs.delete(hibernateKey(windowId, tabId));
        recovery?.purgeTab?.(windowId, tabId);
        purgeAuthority(windowId, tabId, { kind: "close" });
        surfaceManager.destroySurface(windowId, tabId);
        const closed = registry.closeTab(windowId, tabId);
        if (closed && !registry.getWindow(windowId) && !nativeWindow.isDestroyed?.()) {
          nativeWindow.close();
        }
        return closed;
      },
      activateTab: async ({ tabId }) => {
        const tab = registry.getTab(windowId, tabId);
        if (tab?.lifecycle === "hibernated") {
          await wakeHibernatedTab(windowId, tabId);
        }
        const activated = registry.activateTab(windowId, tabId);
        if (activated) {
          surfaceManager.activateSurface(windowId, tabId);
          surfaceManager.layoutWindow(windowId, nativeWindow.getContentBounds());
        }
        return activated;
      },
      setChromeTheme: async ({ backgroundColor }) => {
        if (typeof nativeWindow.setBackgroundColor === "function") {
          nativeWindow.setBackgroundColor(backgroundColor);
        }
        surfaceManager.setWindowBackgroundColor?.(windowId, backgroundColor);
        return true;
      },
      setSideInset: async ({ width }) => {
        if (typeof surfaceManager.setSideInsetRight !== "function") {
          throw new Error("Browser surface manager cannot set side inset");
        }
        const next = surfaceManager.setSideInsetRight(windowId, width);
        surfaceManager.layoutWindow(windowId, nativeWindow.getContentBounds());
        return { width: next };
      },
      navigate: async ({ tabId, url }) => {
        if (!decideHttpNavigation(url).allowed) throw new TypeError("Navigation blocked");
        const tab = resolveTab(windowId, tabId);
        if (!tab) return false;
        if (tab.lifecycle === "hibernated" || tab.lifecycle === "crashed") {
          await recreateSurface(windowId, tab.tabId, {
            automationMode: tab.automationMode,
            title: tab.title,
            url,
          });
          return true;
        }
        const contents = pageContents(windowId, tab.tabId);
        if (!contents) return false;
        const generation = registry.beginNavigation(windowId, tab.tabId);
        surfaceManager.expectNavigation?.(windowId, tab.tabId, url, generation);
        await contents.loadURL(url);
        return true;
      },
      goBack: async ({ tabId } = {}) => {
        const tab = resolveTab(windowId, tabId);
        const contents = tab ? pageContents(windowId, tab.tabId) : null;
        if (!contents?.canGoBack?.()) return false;
        contents.goBack();
        return true;
      },
      goForward: async ({ tabId } = {}) => {
        const tab = resolveTab(windowId, tabId);
        const contents = tab ? pageContents(windowId, tab.tabId) : null;
        if (!contents?.canGoForward?.()) return false;
        contents.goForward();
        return true;
      },
      reload: async ({ tabId } = {}) => {
        const tab = resolveTab(windowId, tabId);
        if (!tab) return false;
        if (tab.lifecycle === "crashed" || tab.lifecycle === "hibernated") {
          await recreateSurface(windowId, tab.tabId, {
            automationMode: tab.automationMode,
            title: tab.title,
            url: tab.url,
          });
          return true;
        }
        const contents = pageContents(windowId, tab.tabId);
        if (!contents) return false;
        contents.reload();
        return true;
      },
      stop: async ({ tabId } = {}) => {
        const tab = resolveTab(windowId, tabId);
        const contents = tab ? pageContents(windowId, tab.tabId) : null;
        if (!contents) return false;
        contents.stop();
        return true;
      },
      bookmark: async ({ tabId } = {}) => {
        const tab = resolveTab(windowId, tabId);
        if (!tab?.url || !stateRepository?.upsertBookmark) return false;
        return stateRepository.upsertBookmark({ title: tab.title, url: tab.url });
      },
      removeBookmark: async ({ url }) =>
        stateRepository?.removeBookmark?.(url) ?? false,
      find: async ({ tabId, text }) => {
        const tab = resolveTab(windowId, tabId);
        const contents = tab ? pageContents(windowId, tab.tabId) : null;
        if (!contents) return false;
        contents.findInPage(text);
        return true;
      },
      setZoom: async ({ factor, tabId }) => {
        const tab = resolveTab(windowId, tabId);
        const contents = tab ? pageContents(windowId, tab.tabId) : null;
        if (!contents) return false;
        contents.setZoomFactor(factor);
        return true;
      },
      hibernateTab: async ({ tabId }) => hibernateTab(windowId, tabId),
    });
  }

  async function createWindow({ bounds = null, restoredTabs = [], url } = {}) {
    const registryWindow = registry.createWindow({ bounds });
    const windowId = registryWindow.windowId;
    const options = {
      backgroundColor: "#edf3e8",
      height: bounds?.height ?? 800,
      show: false,
      width: bounds?.width ?? 1200,
      ...(Number.isFinite(bounds?.x) ? { x: bounds.x } : {}),
      ...(Number.isFinite(bounds?.y) ? { y: bounds.y } : {}),
      ...(platform === "darwin" ? { titleBarStyle: "hiddenInset" } : {}),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: preloadPath,
        // Match the Notes main window: sandboxed preloads cannot require local
        // sibling modules (browser-ipc / nia-ipc), so bridges never expose and
        // chrome stays stuck on "Connecting" with Nia unavailable.
        sandbox: false,
      },
    };
    const nativeWindow = new BrowserWindow(options);
    const chromeWebContents = nativeWindow.webContents;
    registry.updateWindowBounds?.(
      windowId,
      nativeWindow.getBounds?.() ?? nativeWindow.getContentBounds(),
    );
    nativeWindows.set(windowId, nativeWindow);
    const controller = createController(windowId, nativeWindow);
    controllersBySender.set(chromeWebContents, controller);

    nativeWindow.on("focus", () => registry.activateWindow(windowId));
    nativeWindow.on("resize", () => {
      registry.updateWindowBounds?.(
        windowId,
        nativeWindow.getBounds?.() ?? nativeWindow.getContentBounds(),
      );
      surfaceManager.layoutWindow(windowId, nativeWindow.getContentBounds());
    });
    nativeWindow.once("ready-to-show", () => nativeWindow.show());
    nativeWindow.on("closed", () => {
      const closingSession = registry.exportWindowSession?.(windowId);
      if (!closingAll) {
        if (closingSession) closedSessions.push(closingSession);
      }
      for (const tab of closingSession?.tabs ?? []) {
        clearPendingReload(windowId, tab.tabId);
        hibernatedTabs.delete(hibernateKey(windowId, tab.tabId));
        recovery?.purgeTab?.(windowId, tab.tabId);
        purgeAuthority(windowId, tab.tabId, { kind: "window-close" });
      }
      controllersBySender.delete(chromeWebContents);
      nativeWindows.delete(windowId);
      surfaceManager.destroyWindow(windowId);
      registry.closeWindow(windowId);
      logger(`browser-window:closed ${windowId}`);
    });

    // Create the first tab before loading chrome so the initial getSnapshot
    // already has an owner window + active tab (avoids a stuck empty chrome).
    if (restoredTabs.length > 0) {
      let activeTabId = null;
      for (const restoredTab of restoredTabs) {
        const created = await controller.createTab(restoredTab);
        if (restoredTab.active) activeTabId = created.tabId;
      }
      if (activeTabId) await controller.activateTab({ tabId: activeTabId });
    } else {
      await controller.createTab(url ? { url } : {});
    }
    await nativeWindow.loadURL(chromeUrl());
    logger(`browser-window:created ${windowId}`);
    return registry.getWindow(windowId);
  }

  async function openBrowser({ newWindow = false, url, localFixture = false } = {}) {
    capabilities.assertOpenAllowed({ localFixture });
    if (url && !decideHttpNavigation(url).allowed) throw new TypeError("Navigation blocked");
    if (!newWindow) {
      const recent = registry.getMostRecentWindow();
      const nativeWindow = recent ? getNativeWindow(recent.windowId) : null;
      if (recent && nativeWindow) {
        if (nativeWindow.isMinimized?.()) nativeWindow.restore();
        nativeWindow.focus();
        if (url) await createController(recent.windowId, nativeWindow).navigate({ url });
        return registry.getWindow(recent.windowId);
      }
      if (!url && closedSessions.length > 0) {
        const session = closedSessions.pop();
        return createWindow({
          bounds: session.bounds,
          restoredTabs: session.tabs,
        });
      }
    }
    return createWindow({ url });
  }

  function focusTarget(windowId) {
    const nativeWindow = getNativeWindow(windowId);
    if (!nativeWindow) return false;
    if (nativeWindow.isMinimized?.()) nativeWindow.restore();
    nativeWindow.focus();
    registry.activateWindow(windowId);
    return true;
  }

  async function focusTab(windowId, tabId) {
    const nativeWindow = getNativeWindow(windowId);
    if (!nativeWindow || !registry.getTab(windowId, tabId)) return false;
    const activated = await createController(windowId, nativeWindow).activateTab({ tabId });
    if (!activated) return false;
    focusTarget(windowId);
    return true;
  }

  async function createTabInWindow(windowId, input = {}) {
    const nativeWindow = getNativeWindow(windowId);
    if (!nativeWindow) throw new TypeError("Browser window was not found.");
    return createController(windowId, nativeWindow).createTab(input);
  }

  function closeWindow(windowId) {
    const nativeWindow = getNativeWindow(windowId);
    if (!nativeWindow) return false;
    nativeWindow.close();
    return true;
  }

  function closeAll() {
    if (closingAll) return 0;
    closingAll = true;
    const targets = [...nativeWindows.values()].filter((window) => !window.isDestroyed?.());
    if (targets.length > 0) persistState();
    for (const nativeWindow of targets) nativeWindow.close();
    closingAll = false;
    return targets.length;
  }

  function persistState() {
    if (!stateRepository?.saveWindows) return false;
    stateRepository.saveWindows(registry.snapshot().windows);
    return true;
  }

  async function restore({ localFixture = false } = {}) {
    capabilities.assertOpenAllowed({ localFixture });
    if (!stateRepository?.loadWindows || nativeWindows.size > 0) return [];
    const saved = stateRepository.loadWindows({
      displays: screen?.getAllDisplays?.() ?? [],
    });
    const restored = [];
    for (const entry of saved) {
      restored.push(await createWindow({
        bounds: entry.bounds,
        restoredTabs: entry.tabs,
      }));
    }
    return restored;
  }

  async function createAiSandboxTarget({ url, partition, signal } = {}) {
    if (signal?.aborted === true) {
      const error = new Error("Cancelled");
      error.code = "CANCELLED";
      throw error;
    }
    capabilities.assertOpenAllowed({});
    let windowRecord = registry.getMostRecentWindow();
    if (!windowRecord || !getNativeWindow(windowRecord.windowId)) {
      windowRecord = await openBrowser({});
    }
    const nativeWindow = getNativeWindow(windowRecord.windowId);
    if (!nativeWindow) {
      throw new TypeError("Browser window is required for AiSandbox targets.");
    }
    const controller = createController(windowRecord.windowId, nativeWindow);
    const tab = await controller.createTab({
      automationMode: "AiSandbox",
      url,
    });
    if (signal?.aborted === true) {
      await controller.closeTab({ tabId: tab.tabId });
      const error = new Error("Cancelled");
      error.code = "CANCELLED";
      throw error;
    }
    const webContents = pageContents(windowRecord.windowId, tab.tabId);
    const selected = partitionSelector?.select?.("AiSandbox");
    if (partition && selected && partition.partition !== selected.partition) {
      throw new TypeError("AiSandbox partition mismatch.");
    }
    return Object.freeze({
      automationMode: "AiSandbox",
      partition: selected?.partition ?? partition?.partition,
      tabId: tab.tabId,
      webContents,
      windowId: windowRecord.windowId,
    });
  }

  async function destroyTarget({ windowId, tabId }) {
    const nativeWindow = getNativeWindow(windowId);
    if (!nativeWindow) {
      surfaceManager.destroySurface(windowId, tabId);
      registry.closeTab(windowId, tabId);
      return true;
    }
    const controller = createController(windowId, nativeWindow);
    await controller.closeTab({ tabId });
    return true;
  }

  return Object.freeze({
    closeAll,
    closeWindow,
    createAiSandboxTarget,
    createTabInWindow,
    destroyTarget,
    focusTab,
    focusTarget,
    getControllerForWebContents: (sender) => controllersBySender.get(sender) ?? null,
    getPageWebContents: pageContents,
    handleSurfaceEvent,
    hibernateTab,
    openBrowser,
    persistState,
    restore,
    snapshot: publishSnapshot,
    wakeHibernatedTab,
  });
}

module.exports = { createBrowserWindowManager };
