import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createBrowserSurfaceManager } = require(
  "../../../../electron/browser/browser-surface-manager.cjs",
);

describe("browser surface manager", () => {
  it("constructs isolated WebContentsView pages with no preload", () => {
    const fixture = createFixture();
    fixture.manager.createSurface({
      hostWindow: fixture.host,
      tabId: "tab-1",
      windowId: "window-1",
    });

    expect(fixture.views).toHaveLength(1);
    expect(fixture.views[0].options).toEqual({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    expect(fixture.views[0].options.webPreferences).not.toHaveProperty("preload");
  });

  it("attaches listeners before the first load", async () => {
    const fixture = createFixture();
    const surface = fixture.manager.createSurface({
      hostWindow: fixture.host,
      initialUrl: "https://example.com/",
      tabId: "tab-1",
      windowId: "window-1",
    });
    await surface.loadPromise;

    expect(fixture.calls.indexOf("listener:did-start-loading")).toBeLessThan(
      fixture.calls.indexOf("load:https://example.com/"),
    );
  });

  it("shows only the active view and lays it out below chrome", () => {
    const fixture = createFixture();
    fixture.manager.createSurface({ hostWindow: fixture.host, tabId: "tab-1", windowId: "window-1" });
    fixture.manager.createSurface({ hostWindow: fixture.host, tabId: "tab-2", windowId: "window-1" });

    fixture.manager.activateSurface("window-1", "tab-1");
    fixture.manager.layoutWindow("window-1", { width: 1_200, height: 800 });

    expect(fixture.views[0].visible).toBe(true);
    expect(fixture.views[1].visible).toBe(false);
    expect(fixture.views[0].bounds).toEqual({ x: 0, y: 112, width: 840, height: 688 });
  });

  it("can lay out without a Nia side dock", () => {
    const fixture = createFixture({ sideInsetRight: 0 });
    fixture.manager.createSurface({ hostWindow: fixture.host, tabId: "tab-1", windowId: "window-1" });
    fixture.manager.activateSurface("window-1", "tab-1");
    fixture.manager.layoutWindow("window-1", { width: 1_200, height: 800 });
    expect(fixture.views[0].bounds).toEqual({ x: 0, y: 112, width: 1_200, height: 688 });
  });

  it("updates per-window side inset and relayout width", () => {
    const fixture = createFixture();
    fixture.manager.createSurface({ hostWindow: fixture.host, tabId: "tab-1", windowId: "window-1" });
    fixture.manager.activateSurface("window-1", "tab-1");
    expect(fixture.manager.setSideInsetRight("window-1", 40)).toBe(40);
    fixture.manager.layoutWindow("window-1", { width: 1_200, height: 800 });
    expect(fixture.views[0].bounds).toEqual({ x: 0, y: 112, width: 1_160, height: 688 });
    expect(fixture.manager.setSideInsetRight("window-1", 999)).toBe(480);
  });

  it("clamps invalid resize bounds", () => {
    const fixture = createFixture();
    fixture.manager.createSurface({ hostWindow: fixture.host, tabId: "tab-1", windowId: "window-1" });
    fixture.manager.activateSurface("window-1", "tab-1");
    fixture.manager.layoutWindow("window-1", { width: -5, height: 40 });
    expect(fixture.views[0].bounds).toEqual({ x: 0, y: 40, width: 0, height: 0 });
  });

  it("removes child views, listeners, and destroys contents exactly once", () => {
    const fixture = createFixture();
    fixture.manager.createSurface({ hostWindow: fixture.host, tabId: "tab-1", windowId: "window-1" });

    expect(fixture.manager.destroySurface("window-1", "tab-1")).toBe(true);
    expect(fixture.manager.destroySurface("window-1", "tab-1")).toBe(false);
    expect(fixture.host.contentView.removeChildView).toHaveBeenCalledOnce();
    expect(fixture.views[0].webContents.destroy).toHaveBeenCalledOnce();
    expect(fixture.policyDisposers[0]).toHaveBeenCalledOnce();
  });

  it("rejects late events after teardown", () => {
    const onEvent = vi.fn();
    const fixture = createFixture({ onEvent });
    fixture.manager.createSurface({ hostWindow: fixture.host, tabId: "tab-1", windowId: "window-1" });
    fixture.views[0].webContents.emit("did-start-loading");
    expect(onEvent).toHaveBeenCalledOnce();

    fixture.manager.destroySurface("window-1", "tab-1");
    fixture.views[0].webContents.emit("did-stop-loading");
    fixture.views[0].webContents.emit("did-navigate", {}, "https://late.test/");
    expect(onEvent).toHaveBeenCalledOnce();
  });

  it("destroys every surface for one window without affecting another", () => {
    const fixture = createFixture();
    fixture.manager.createSurface({ hostWindow: fixture.host, tabId: "tab-1", windowId: "window-1" });
    fixture.manager.createSurface({ hostWindow: fixture.host, tabId: "tab-2", windowId: "window-1" });
    fixture.manager.createSurface({ hostWindow: fixture.otherHost, tabId: "tab-3", windowId: "window-2" });

    expect(fixture.manager.destroyWindow("window-1")).toBe(2);
    expect(fixture.manager.getSurface("window-2", "tab-3")).not.toBeNull();
  });
});

function createFixture({ onEvent = vi.fn(), sideInsetRight = 360 } = {}) {
  const calls: string[] = [];
  const views: SurfaceViewFixture[] = [];
  const policyDisposers: ReturnType<typeof vi.fn>[] = [];
  class FakeView {
    options: Record<string, unknown>;
    bounds = null as null | Record<string, number>;
    visible = false;
    webContents = createFakeWebContents(calls);
    constructor(options: Record<string, unknown>) {
      this.options = options;
      views.push(this);
    }
    setBounds(bounds: Record<string, number>) { this.bounds = bounds; }
    setVisible(visible: boolean) { this.visible = visible; }
  }
  const host = createHost();
  const otherHost = createHost();
  const manager = createBrowserSurfaceManager({
    WebContentsView: FakeView,
    chromeInset: 112,
    sideInsetRight,
    createPagePolicy: () => ({
      attach: () => {
        const dispose = vi.fn();
        policyDisposers.push(dispose);
        return dispose;
      },
    }),
    onEvent,
  });
  return { calls, host, manager, onEvent, otherHost, policyDisposers, views };
}

type SurfaceViewFixture = {
  options: { webPreferences: Record<string, unknown> };
  bounds: null | Record<string, number>;
  visible: boolean;
  webContents: ReturnType<typeof createFakeWebContents>;
};

function createHost() {
  return {
    contentView: {
      addChildView: vi.fn(),
      removeChildView: vi.fn(),
    },
  };
}

function createFakeWebContents(calls: string[]) {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    destroy: vi.fn(),
    emit(name: string, ...args: unknown[]) {
      for (const listener of listeners.get(name) ?? []) listener(...args);
    },
    isDestroyed: vi.fn(() => false),
    loadURL: vi.fn(async (url: string) => { calls.push(`load:${url}`); }),
    on(name: string, listener: (...args: unknown[]) => void) {
      calls.push(`listener:${name}`);
      const entries = listeners.get(name) ?? new Set();
      entries.add(listener);
      listeners.set(name, entries);
    },
    removeListener(name: string, listener: (...args: unknown[]) => void) {
      listeners.get(name)?.delete(listener);
    },
  };
}
