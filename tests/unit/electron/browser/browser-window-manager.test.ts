import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createBrowserCapabilities } = require(
  "../../../../electron/browser/browser-capabilities.cjs",
);
const { createBrowserSecurityGates } = require(
  "../../../../electron/browser/browser-security-gates.cjs",
);
const { createBrowserRegistry } = require(
  "../../../../electron/browser/browser-registry.cjs",
);
const { createBrowserWindowManager } = require(
  "../../../../electron/browser/browser-window-manager.cjs",
);

describe("browser window manager", () => {
  it("refuses normal production open before capability verification", async () => {
    const fixture = createFixture({
      localFixtureEnabled: false,
      securityVerified: false,
    });
    await expect(fixture.manager.openBrowser()).rejects.toMatchObject({
      code: "CAPABILITY_NOT_VERIFIED",
    });
    expect(fixture.windows).toHaveLength(0);
  });

  it("opens only through explicit local-fixture composition before security gates verify", async () => {
    const fixture = createFixture({ securityVerified: false });
    await expect(fixture.manager.openBrowser()).rejects.toMatchObject({ code: "CAPABILITY_NOT_VERIFIED" });
    const opened = await fixture.manager.openBrowser({
      localFixture: true,
      url: "http://127.0.0.1:43111/start",
    });

    expect(opened.windowId).toBe("browser-window-1");
    expect(fixture.windows).toHaveLength(1);
    expect(fixture.windows[0].options).toMatchObject({
      height: 800,
      titleBarStyle: "hiddenInset",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: "/app/electron/browser/browser-preload.cjs",
        sandbox: false,
      },
      width: 1200,
    });
    expect(fixture.windows[0].loadedUrl).toBe("http://127.0.0.1:3000/browser");
    expect(fixture.surfaceManager.createSurface).toHaveBeenCalledWith(expect.objectContaining({
      initialUrl: "http://127.0.0.1:43111/start",
      windowId: "browser-window-1",
    }));
  });

  it("reuses the most recent browser window unless newWindow is explicit", async () => {
    const fixture = createFixture();
    const first = await fixture.manager.openBrowser({ localFixture: true });
    const reused = await fixture.manager.openBrowser({ localFixture: true });
    const second = await fixture.manager.openBrowser({ localFixture: true, newWindow: true });

    expect(reused.windowId).toBe(first.windowId);
    expect(second.windowId).not.toBe(first.windowId);
    expect(fixture.windows).toHaveLength(2);
    expect(fixture.windows[0].focus).toHaveBeenCalled();
  });

  it("binds chrome webContents to its controller without renderer identity", async () => {
    const fixture = createFixture();
    await fixture.manager.openBrowser({ localFixture: true });
    const controller = fixture.manager.getControllerForWebContents(fixture.windows[0].webContents);
    expect(controller).not.toBeNull();
    await expect(controller.getSnapshot()).resolves.toMatchObject({
      currentWindowId: "browser-window-1",
    });
    await controller.createTab({ url: "https://example.com/two" });
    expect(fixture.registry.snapshot().windows[0].tabs).toHaveLength(2);
    expect(fixture.manager.getControllerForWebContents({ id: 999 })).toBeNull();
  });

  it("projects native page title updates into browser chrome", async () => {
    const fixture = createFixture();
    const opened = await fixture.manager.openBrowser({
      localFixture: true,
      url: "https://example.com/docs",
    });

    fixture.manager.handleSurfaceEvent({
      tabId: opened.tabs[0].tabId,
      title: "Example documentation",
      type: "title-updated",
      windowId: opened.windowId,
    });

    expect(fixture.registry.getTab(opened.windowId, opened.tabs[0].tabId).title)
      .toBe("Example documentation");
  });

  it("creates an embedded empty tab without an initial URL", async () => {
    const fixture = createFixture();
    const attached = await fixture.manager.attachEmbeddedHost({
      hostWindow: fixture.mainWindow,
    });
    const controller = fixture.manager.getControllerForWebContents(
      fixture.mainWindow.webContents,
    );
    expect(controller).not.toBeNull();

    const tab = await controller.createTab({ automationMode: "Human" });

    expect(tab).toMatchObject({
      canGoBack: false,
      canGoForward: false,
      title: "",
      url: "",
    });
    expect(fixture.surfaceManager.createSurface).toHaveBeenCalledWith(expect.objectContaining({
      hostWindow: fixture.mainWindow,
      initialUrl: undefined,
      tabId: tab.tabId,
      windowId: attached.windowId,
    }));
  });

  it("attaches an embedded browser workspace to the trusted main window without owning its lifecycle", async () => {
    const fixture = createFixture();
    const attached = await fixture.manager.attachEmbeddedHost({
      hostWindow: fixture.mainWindow,
    });
    const controller = fixture.manager.getControllerForWebContents(
      fixture.mainWindow.webContents,
    );

    expect(attached).toMatchObject({ activeTabId: null, tabs: [] });
    expect(fixture.windows).toHaveLength(0);
    expect(controller).not.toBeNull();

    const tab = await controller.createTab({ url: "https://example.com/notes" });
    await controller.setViewport({
      height: 520,
      visible: true,
      width: 800,
      x: 220,
      y: 118,
    });

    expect(fixture.surfaceManager.createSurface).toHaveBeenCalledWith(expect.objectContaining({
      hostWindow: fixture.mainWindow,
      tabId: tab.tabId,
      windowId: attached.windowId,
    }));
    expect(fixture.surfaceManager.setWindowViewport).toHaveBeenCalledWith(
      attached.windowId,
      { height: 520, visible: true, width: 800, x: 220, y: 118 },
    );

    await expect(controller.closeTab({ tabId: tab.tabId })).resolves.toBe(false);
    expect(fixture.mainWindow.close).not.toHaveBeenCalled();
    expect(fixture.registry.getTab(attached.windowId, tab.tabId)).not.toBeNull();
    expect(fixture.manager.closeAll()).toBe(0);
    expect(fixture.mainWindow.close).not.toHaveBeenCalled();
  });

  it("focuses explicit targets and keeps browser/main window lifecycles independent", async () => {
    const fixture = createFixture();
    const first = await fixture.manager.openBrowser({ localFixture: true });
    const second = await fixture.manager.openBrowser({ localFixture: true, newWindow: true });
    expect(fixture.manager.focusTarget(first.windowId)).toBe(true);
    expect(fixture.windows[0].focus).toHaveBeenCalled();

    fixture.windows[0].emit("closed");
    expect(fixture.surfaceManager.destroyWindow).toHaveBeenCalledWith(first.windowId);
    expect(fixture.registry.getWindow(first.windowId)).toBeNull();
    expect(fixture.registry.getWindow(second.windowId)).not.toBeNull();
    expect(fixture.mainWindow.close).not.toHaveBeenCalled();
  });

  it("creates tabs in an explicit window and purges each target when that window closes", async () => {
    const onAuthorityPurge = vi.fn();
    const fixture = createFixture({ onAuthorityPurge });
    const first = await fixture.manager.openBrowser({ localFixture: true });
    const second = await fixture.manager.openBrowser({ localFixture: true, newWindow: true });
    const selected = await fixture.manager.createTabInWindow(first.windowId, { url: "https://example.com/selected" });
    expect(fixture.registry.getWindow(first.windowId).tabs).toHaveLength(2);
    expect(fixture.registry.getWindow(second.windowId).tabs).toHaveLength(1);
    await expect(fixture.manager.focusTab(first.windowId, selected.tabId)).resolves.toBe(true);
    expect(fixture.registry.getWindow(first.windowId).activeTabId).toBe(selected.tabId);
    expect(fixture.manager.closeWindow(first.windowId)).toBe(true);
    expect(onAuthorityPurge).toHaveBeenCalledTimes(2);
    expect(onAuthorityPurge).toHaveBeenCalledWith(first.windowId, selected.tabId, { kind: "window-close" });
    expect(fixture.registry.getWindow(first.windowId)).toBeNull();
    expect(fixture.registry.getWindow(second.windowId)).not.toBeNull();
  });

  it("closeAll closes browser windows once during app quit", async () => {
    const fixture = createFixture();
    await fixture.manager.openBrowser({ localFixture: true });
    await fixture.manager.openBrowser({ localFixture: true, newWindow: true });
    expect(fixture.manager.closeAll()).toBe(2);
    expect(fixture.windows[0].close).toHaveBeenCalledOnce();
    expect(fixture.windows[1].close).toHaveBeenCalledOnce();
    expect(fixture.mainWindow.close).not.toHaveBeenCalled();
  });

  it("projects exact bookmarks through the owner controller", async () => {
    const stateRepository = createStateRepository();
    stateRepository.listBookmarks.mockReturnValue([
      { title: "Exact", url: "https://example.com/?q=one#two" },
    ]);
    const fixture = createFixture({ stateRepository });
    await fixture.manager.openBrowser({
      localFixture: true,
      url: "https://example.com/?q=one#two",
    });
    const controller = fixture.manager.getControllerForWebContents(fixture.windows[0].webContents);

    await expect(controller.getSnapshot()).resolves.toMatchObject({
      bookmarks: [{ title: "Exact", url: "https://example.com/?q=one#two" }],
    });
    await controller.bookmark();
    expect(stateRepository.upsertBookmark).toHaveBeenCalledWith({
      title: "",
      url: "https://example.com/?q=one#two",
    });
    await controller.removeBookmark({ url: "https://example.com/?q=one#two" });
    expect(stateRepository.removeBookmark).toHaveBeenCalledWith(
      "https://example.com/?q=one#two",
    );
  });

  it("restores bounded windows with fresh IDs and retained Human tabs only", async () => {
    const stateRepository = createStateRepository();
    stateRepository.loadWindows.mockReturnValue([{
      bounds: { height: 720, width: 1100, x: 30, y: 40 },
      tabs: [{
        active: true,
        automationMode: "Human",
        retained: true,
        title: "Restored research",
        url: "https://example.com/restored",
      }],
    }]);
    const fixture = createFixture({ stateRepository });

    const restored = await fixture.manager.restore({ localFixture: true });

    expect(stateRepository.loadWindows).toHaveBeenCalledWith({
      displays: [{ workArea: { height: 900, width: 1440, x: 0, y: 0 } }],
    });
    expect(restored).toHaveLength(1);
    expect(fixture.windows[0].options).toMatchObject({
      height: 720,
      width: 1100,
      x: 30,
      y: 40,
    });
    expect(restored[0].windowId).toBe("browser-window-1");
    expect(restored[0].tabs[0]).toMatchObject({
      automationMode: "Human",
      retained: true,
      tabId: "browser-tab-1",
      title: "Restored research",
      url: "https://example.com/restored",
    });
  });

  it("persists the authoritative registry snapshot before closing all", async () => {
    const stateRepository = createStateRepository();
    const fixture = createFixture({ stateRepository });
    await fixture.manager.openBrowser({ localFixture: true });
    fixture.manager.closeAll();
    expect(stateRepository.saveWindows).toHaveBeenCalledOnce();
    expect(stateRepository.saveWindows).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ windowId: "browser-window-1" })]),
    );
  });

  it("retains back-forward history only for same-process window reopen", async () => {
    const fixture = createFixture();
    const first = await fixture.manager.openBrowser({
      localFixture: true,
      url: "https://example.com/one",
    });
    const tabId = first.activeTabId;
    fixture.registry.commitNavigation(first.windowId, tabId, {
      url: "https://example.com/two",
    });
    fixture.registry.commitNavigation(first.windowId, tabId, {
      url: "https://example.com/one",
    });
    fixture.windows[0].emit("closed");

    const reopened = await fixture.manager.openBrowser({ localFixture: true });
    expect(reopened.windowId).toBe("browser-window-2");
    expect(reopened.activeTabId).toBe("browser-tab-2");
    expect(fixture.registry.getHistory(reopened.windowId, reopened.activeTabId)).toEqual({
      entries: ["https://example.com/one", "https://example.com/two"],
      index: 0,
    });
    const restoredSurface = fixture.surfaceManager.getSurface(reopened.windowId, reopened.activeTabId);
    expect(restoredSurface).not.toBeNull();
    if (!restoredSurface) throw new Error("Expected the restored surface");
    const restoredContents = restoredSurface.view.webContents;
    expect(restoredContents.loadURL).toHaveBeenCalledWith("https://example.com/two");
    expect(restoredContents.navigationHistory.goToIndex).toHaveBeenCalledWith(0);
  });
});

function createFixture({
  localFixtureEnabled = true,
  onAuthorityPurge = null as null | ((windowId: string, tabId: string, meta: unknown) => void),
  securityVerified = true,
  stateRepository = createStateRepository(),
} = {}) {
  const windows: FakeWindow[] = [];
  class FakeBrowserWindow {
    options: Record<string, unknown>;
    loadedUrl = "";
    destroyed = false;
    minimized = false;
    listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    webContents = createWebContents();
    contentView = { addChildView: vi.fn(), removeChildView: vi.fn() };
    close = vi.fn(() => this.emit("closed"));
    focus = vi.fn();
    getBounds = vi.fn(() => ({ height: 800, width: 1200, x: 10, y: 20 }));
    getContentBounds = vi.fn(() => ({ width: 1200, height: 800 }));
    isDestroyed = vi.fn(() => this.destroyed);
    isMinimized = vi.fn(() => this.minimized);
    restore = vi.fn(() => { this.minimized = false; });
    show = vi.fn();
    constructor(options: Record<string, unknown>) {
      this.options = options;
      windows.push(this as unknown as FakeWindow);
    }
    async loadURL(url: string) { this.loadedUrl = url; }
    on(name: string, listener: (...args: unknown[]) => void) {
      const entries = this.listeners.get(name) ?? new Set();
      entries.add(listener);
      this.listeners.set(name, entries);
    }
    once(name: string, listener: (...args: unknown[]) => void) { this.on(name, listener); }
    emit(name: string, ...args: unknown[]) {
      if (name === "closed") this.destroyed = true;
      for (const listener of this.listeners.get(name) ?? []) listener(...args);
    }
  }
  const surfaceManager = {
    activateSurface: vi.fn(() => true),
    surfaces: new Map<string, { loadPromise: Promise<void>; view: { webContents: ReturnType<typeof createWebContents> } }>(),
    createSurface: vi.fn((input) => {
      const surface = {
        loadPromise: Promise.resolve(),
        view: { webContents: createWebContents() },
      };
      surfaceManager.surfaces.set(`${input.windowId}:${input.tabId}`, surface);
      return surface;
    }),
    destroySurface: vi.fn((windowId, tabId) =>
      surfaceManager.surfaces.delete(`${windowId}:${tabId}`)),
    destroyWindow: vi.fn((windowId) => {
      let removed = 0;
      for (const key of [...surfaceManager.surfaces.keys()]) {
        if (key.startsWith(`${windowId}:`)) {
          surfaceManager.surfaces.delete(key);
          removed += 1;
        }
      }
      return removed;
    }),
    getSurface: vi.fn((windowId, tabId) =>
      surfaceManager.surfaces.get(`${windowId}:${tabId}`) ?? null),
    layoutWindow: vi.fn(),
    setWindowViewport: vi.fn((_windowId, viewport) => viewport),
  };
  const registry = createBrowserRegistry();
  const mainWindow = new FakeBrowserWindow({ embedded: true });
  windows.pop();
  const securityGates = createBrowserSecurityGates(
    securityVerified
      ? undefined
      : {
        adversarial: false,
        audit: true,
        crash: true,
        dialog: true,
        mode: true,
        reclaim: true,
        session: true,
        ux: true,
      },
  );
  const manager = createBrowserWindowManager({
    BrowserWindow: FakeBrowserWindow,
    capabilities: createBrowserCapabilities({
      localFixtureEnabled,
      securityGates,
    }),
    platform: "darwin",
    onAuthorityPurge,
    preloadPath: "/app/electron/browser/browser-preload.cjs",
    registry,
    screen: {
      getAllDisplays: vi.fn(() => [
        { workArea: { height: 900, width: 1440, x: 0, y: 0 } },
      ]),
    },
    stateRepository,
    surfaceManager,
    targetUrl: "http://127.0.0.1:3000",
  });
  return { mainWindow, manager, registry, stateRepository, surfaceManager, windows };
}

function createStateRepository() {
  return {
    listBookmarks: vi.fn<() => Array<{ title: string; url: string }>>(() => []),
    loadWindows: vi.fn<() => Array<{
      bounds: { height: number; width: number; x: number; y: number };
      tabs: Array<{ active: boolean; automationMode: "Human"; retained: boolean; title: string; url: string }>;
    }>>(() => []),
    removeBookmark: vi.fn(() => true),
    saveWindows: vi.fn(),
    upsertBookmark: vi.fn((bookmark) => bookmark),
  };
}

type FakeWindow = {
  close: ReturnType<typeof vi.fn>;
  contentView: unknown;
  emit(name: string, ...args: unknown[]): void;
  focus: ReturnType<typeof vi.fn>;
  getBounds: ReturnType<typeof vi.fn>;
  getContentBounds?: ReturnType<typeof vi.fn>;
  isDestroyed: ReturnType<typeof vi.fn>;
  loadedUrl: string;
  options: Record<string, unknown>;
  webContents: ReturnType<typeof createWebContents>;
};

let nextWebContentsId = 1;
function createWebContents() {
  return {
    canGoBack: vi.fn(() => false),
    canGoForward: vi.fn(() => false),
    findInPage: vi.fn(),
    getURL: vi.fn(() => "https://example.com/"),
    goBack: vi.fn(),
    goForward: vi.fn(),
    id: nextWebContentsId++,
    isDestroyed: vi.fn(() => false),
    loadURL: vi.fn(async () => undefined),
    navigationHistory: {
      goToIndex: vi.fn(),
    },
    reload: vi.fn(),
    send: vi.fn(),
    setZoomFactor: vi.fn(),
    stop: vi.fn(),
  };
}
