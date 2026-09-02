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
    return displays.find((display) => String(display.id) === String(placement?.displayId)) ?? screen.getPrimaryDisplay();
  }

  function create() {
    if (window && !window.isDestroyed?.()) return window;
    const display = screen.getPrimaryDisplay();
    const saved = readPlacement(positionPath);
    const placement = clampPlacement(saved ?? defaultPlacement(display.workArea), display.workArea);
    window = new BrowserWindow({
      width: 320,
      height: 360,
      x: placement.x,
      y: placement.y,
      show: false,
      frame: false,
      transparent: true,
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

  return Object.freeze({ beginDrag, create, dispose, dragTo, endDrag, hide, load, openNia, setPointerCapture, show, window: () => window });
}

module.exports = { createCompanionWindow };
