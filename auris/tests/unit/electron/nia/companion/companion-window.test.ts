import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createCompanionWindow } = require("../../../../../electron/nia/companion/companion-window.cjs");

function fakeWindow(options: any) {
  const listeners = new Map<string, () => void>();
  let bounds = { x: options.x, y: options.y, width: options.width, height: options.height };
  return {
    options,
    webContents: { on: vi.fn(), send: vi.fn() },
    on(event: string, handler: () => void) { listeners.set(event, handler); },
    getBounds: () => bounds,
    setPosition: (x: number, y: number) => { bounds = { ...bounds, x, y }; },
    setAlwaysOnTop: vi.fn(), setVisibleOnAllWorkspaces: vi.fn(), setIgnoreMouseEvents: vi.fn(),
    show: vi.fn(), showInactive: vi.fn(), hide: vi.fn(), destroy: vi.fn(), isDestroyed: () => false,
    loadURL: vi.fn(async () => undefined),
    fire: (event: string) => listeners.get(event)?.(),
  };
}

describe("companion window policy", () => {
  it("creates a transparent all-workspaces click-through window and loads companion route", async () => {
    const made: any[] = [];
    const BrowserWindow = class {
      constructor(options: any) { const value = fakeWindow(options); made.push(value); return value as any; }
    };
    const service = createCompanionWindow({ BrowserWindow, screen: { getPrimaryDisplay: () => ({ id: 1, workArea: { x: 0, y: 0, width: 1440, height: 900 } }), getAllDisplays: () => [] }, startNextServer: async () => "http://localhost:3000", preloadPath: "/tmp/preload.cjs", positionPath: "/tmp/nia-placement.json" });
    await service.load();
    const target = made[0];
    expect(target.options).toMatchObject({ frame: false, transparent: true, skipTaskbar: true, focusable: false, alwaysOnTop: true });
    expect(target.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, { visibleOnFullScreen: true });
    expect(target.setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true });
    expect(target.loadURL).toHaveBeenCalledWith("http://localhost:3000/nia/companion");
  });
});
