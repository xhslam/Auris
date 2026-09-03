"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { clampPlacement, defaultPlacement, normalizePlacement } = require("./companion-position.cjs");

function readPlacement(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return normalizePlacement(parsed);
  } catch { return null; }
}

function writePlacement(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(normalizePlacement(value)), { mode: 0o600 });
  fs.renameSync(tempPath, filePath);
}

function createCompanionWindow({
  BrowserWindow,
  screen,
  app,
  startNextServer,
  preloadPath,
  positionPath,
  onMessage = () => undefined,
  onNavigateToNia = () => undefined,
} = {}) {
  if (typeof BrowserWindow !== "function" || !screen || typeof startNextServer !== "function") throw new TypeError("Companion window dependencies are incomplete.");
  let window = null;
  let dragging = null;
  let visible = false;

  function displayForPlacement(placement) {
    const displays = screen.getAllDisplays?.() ?? [screen.getPrimaryDisplay()];
    const byId = displays.find((display) => String(display.id) === String(placement?.displayId));
    if (byId) return byId;
    const point = { x: Number(placement?.x), y: Number(placement?.y) };
    const byPoint = displays.find((display) => {
      const area = display.workArea;
      return Number.isFinite(point.x) && Number.isFinite(point.y)
        && point.x >= area.x && point.x < area.x + area.width
        && point.y >= area.y && point.y < area.y + area.height;
    });
    return byPoint ?? screen.getPrimaryDisplay();
  }

  function create() {
    if (window && !window.isDestroyed?.()) return window;
    const saved = readPlacement(positionPath);
    const display = displayForPlacement(saved ?? {});
    const placement = clampPlacement(saved ?? defaultPlacement(display.workArea), display.workArea);
    window = new BrowserWindow({
      width: 320,
      height: 360,
      x: placement.x,
      y: placement.y,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      resizable: false,
      hasShadow: false,
      skipTaskbar: true,
      focusable: false,
      alwaysOnTop: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: preloadPath,
        sandbox: false,
      },
    });
    // Keep the native backing surface transparent as well as the renderer DOM.
    // Without this, a transparent BrowserWindow can still flash or retain a
    // black backing rectangle on macOS while the page is painting.
    window.setBackgroundColor?.("#00000000");
    window.setAlwaysOnTop?.(true, "screen-saver");
    window.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
    window.setIgnoreMouseEvents?.(true, { forward: true });
    window.on?.("closed", () => { window = null; visible = false; dragging = null; });
    window.on?.("move", () => {
      if (!dragging || window.isDestroyed?.()) return;
      const bounds = window.getBounds();
      writePlacement(positionPath, { displayId: String(displayForPlacement({ x: bounds.x, y: bounds.y }).id), x: bounds.x, y: bounds.y });
    });
    window.webContents?.on?.("ipc-message", (_event, channel, ...args) => onMessage({ channel, args }));
    return window;
  }

  async function load() {
    const target = create();
    const server = await startNextServer();
    await target.loadURL(new URL("/nia/companion", `${server}/`).toString());
    return true;
  }

  function show() {
    const target = create();
    if (!visible) {
      target.showInactive?.();
      if (!target.showInactive) target.show();
      visible = true;
    }
    return true;
  }

  function hide() {
    if (!window || window.isDestroyed?.()) return false;
    window.hide();
    visible = false;
    return true;
  }

  function isVisible() {
    if (!window || window.isDestroyed?.()) return false;
    return typeof window.isVisible === "function" ? window.isVisible() : visible;
  }

  function setPointerCapture(on) {
    if (!window || window.isDestroyed?.()) return false;
    window.setIgnoreMouseEvents?.(!on, { forward: true });
    return true;
  }

  function beginDrag(point) {
    if (!window || window.isDestroyed?.()) return false;
    const bounds = window.getBounds();
    dragging = { offsetX: point.x - bounds.x, offsetY: point.y - bounds.y };
    setPointerCapture(true);
    return true;
  }

  function dragTo(point) {
    if (!dragging || !window || window.isDestroyed?.()) return false;
    window.setPosition(Math.round(point.x - dragging.offsetX), Math.round(point.y - dragging.offsetY));
    return true;
  }

  function endDrag() {
    if (!dragging || !window || window.isDestroyed?.()) return false;
    const bounds = window.getBounds();
    const display = displayForPlacement({ x: bounds.x, y: bounds.y });
    const next = clampPlacement({ displayId: String(display.id), x: bounds.x, y: bounds.y }, display.workArea);
    window.setPosition(next.x, next.y);
    writePlacement(positionPath, next);
    dragging = null;
    setPointerCapture(false);
    return true;
  }

  function openNia() {
    onNavigateToNia();
    return true;
  }

  function dispose() {
    if (!window || window.isDestroyed?.()) return;
    window.destroy();
    window = null;
    visible = false;
    dragging = null;
  }

  return Object.freeze({ beginDrag, create, dispose, dragTo, endDrag, hide, isVisible, load, openNia, setPointerCapture, show, window: () => window });
}

module.exports = { createCompanionWindow };
