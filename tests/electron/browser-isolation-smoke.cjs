"use strict";
/* eslint-disable @typescript-eslint/no-require-imports */

const fsSync = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { app, BrowserWindow, WebContentsView } = require("electron");
const {
  createBrowserSurfaceManager,
} = require("../../electron/browser/browser-surface-manager.cjs");

const FIXTURE_PATH = path.join(
  __dirname,
  "..",
  "fixtures",
  "browser",
  "isolation-probe.html",
);

function startServer() {
  const html = fsSync.readFileSync(FIXTURE_PATH, "utf8");
  const server = http.createServer((_request, response) => {
    response.writeHead(200, {
      "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline'",
      "content-type": "text/html; charset=utf-8",
    });
    response.end(html);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Browser isolation fixture did not expose a TCP port."));
        return;
      }
      resolve({ origin: `http://127.0.0.1:${address.port}`, server });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function withTimeout(promise, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out.`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function run() {
  const { origin, server } = await startServer();
  let hostWindow;
  try {
    hostWindow = new BrowserWindow({
      height: 700,
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
      width: 1000,
    });
    await hostWindow.loadURL(origin);
    const manager = createBrowserSurfaceManager({ WebContentsView });
    const surface = manager.createSurface({
      hostWindow,
      initialUrl: `${origin}/isolation-probe.html`,
      tabId: "browser-tab-isolation",
      windowId: "browser-window-isolation",
    });
    manager.activateSurface("browser-window-isolation", "browser-tab-isolation");
    manager.layoutWindow("browser-window-isolation", hostWindow.getContentBounds());
    await withTimeout(surface.loadPromise, 15_000, "Isolation page load");

    const globals = await surface.view.webContents.executeJavaScript(`({
      aurisBrowser: typeof window.aurisBrowser,
      electron: typeof window.electron,
      ipcRenderer: typeof window.ipcRenderer,
      process: typeof window.process,
      require: typeof window.require,
      shadowingDesktop: typeof window.shadowingDesktop
    })`, true);
    const expected = {
      aurisBrowser: "undefined",
      electron: "undefined",
      ipcRenderer: "undefined",
      process: "undefined",
      require: "undefined",
      shadowingDesktop: "undefined",
    };
    if (JSON.stringify(globals) !== JSON.stringify(expected)) {
      throw new Error(`Page isolation failed: ${JSON.stringify(globals)}`);
    }
    const popupDenied = await surface.view.webContents.executeJavaScript(
      `window.open("${origin}/popup") === null`,
      true,
    );
    if (!popupDenied) throw new Error("Page popup policy did not fail closed.");

    const preferences = surface.view.webContents.getLastWebPreferences();
    if (
      preferences.nodeIntegration !== false
      || preferences.contextIsolation !== true
      || preferences.sandbox !== true
      || preferences.preload
    ) {
      throw new Error(`Unsafe page preferences: ${JSON.stringify(preferences)}`);
    }
    process.stdout.write(`${JSON.stringify({
      electron: process.versions.electron,
      globals,
      hostAlive: !hostWindow.isDestroyed(),
      popupDenied,
    })}\n`);
    manager.destroyWindow("browser-window-isolation");
  } finally {
    hostWindow?.destroy();
    await closeServer(server);
  }
}

app.disableHardwareAcceleration();
app.whenReady()
  .then(run)
  .then(() => app.quit())
  .catch((error) => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    app.exit(1);
  });
