"use strict";
/* eslint-disable @typescript-eslint/no-require-imports */

const fsSync = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const {
  app,
  BrowserWindow,
  session,
  WebContentsView,
} = require("electron");
const {
  createBrowserPartitionSelector,
} = require("../../electron/browser/browser-partitions.cjs");
const {
  createBrowserSurfaceManager,
} = require("../../electron/browser/browser-surface-manager.cjs");
const {
  createBrowserUxPolicy,
} = require("../../electron/browser/browser-ux-policy.cjs");

const FIXTURE_PATH = path.join(
  __dirname,
  "..",
  "fixtures",
  "browser",
  "hostile-surfaces.html",
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
        reject(new Error("Dialog feasibility fixture did not expose a TCP port."));
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
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function waitForLoad(webContents, timeoutMs = 12_000) {
  return withTimeout(
    new Promise((resolve, reject) => {
      const finish = () => {
        cleanup();
        resolve();
      };
      const fail = (_event, errorCode, errorDescription, _url, isMainFrame) => {
        if (isMainFrame === false) return;
        cleanup();
        reject(new Error(`page load failed: ${errorCode} ${errorDescription}`));
      };
      const cleanup = () => {
        webContents.removeListener("did-finish-load", finish);
        webContents.removeListener("did-fail-load", fail);
      };
      if (!webContents.isLoading() && webContents.getURL() && webContents.getURL() !== "about:blank") {
        resolve();
        return;
      }
      webContents.once("did-finish-load", finish);
      webContents.once("did-fail-load", fail);
    }),
    timeoutMs,
    "page load",
  );
}

async function run() {
  const policy = createBrowserUxPolicy();
  const { origin, server } = await startServer();
  const hostWindow = new BrowserWindow({
    height: 700,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    width: 900,
  });
  const partitionSelector = createBrowserPartitionSelector({
    getSession: (partitionName) => session.fromPartition(partitionName),
  });
  const surfaceManager = createBrowserSurfaceManager({ WebContentsView });
  const partition = partitionSelector.select("AiSandbox");
  const surface = surfaceManager.createSurface({
    hostWindow,
    initialUrl: `${origin}/dialogs`,
    partitionContext: partition,
    tabId: "tab-dialog",
    windowId: "window-dialog",
  });
  const webContents = surface.view.webContents;
  const ready = waitForLoad(webContents);
  await Promise.all([surface.loadPromise, ready]);
  surfaceManager.activateSurface("window-dialog", "tab-dialog");
  surfaceManager.layoutWindow("window-dialog", hostWindow.getContentBounds());
  hostWindow.showInactive();

  const debuggerApi = webContents.debugger;
  if (!debuggerApi || typeof debuggerApi.attach !== "function") {
    console.error("browser-dialog-feasibility: debugger unavailable");
    console.error(JSON.stringify({ disableDialogs: true, reason: "debugger-missing" }));
    surfaceManager.destroySurface("window-dialog", "tab-dialog");
    hostWindow.destroy();
    await closeServer(server);
    app.exit(1);
    return;
  }

  const openings = [];
  let detachedCleanly = false;

  try {
    if (!debuggerApi.isAttached()) debuggerApi.attach("1.3");
    await debuggerApi.sendCommand("Page.enable");
    // Prove there is no privileged page preload required for interception.
    const preload = webContents.getURL();
    if (!preload.startsWith(origin)) {
      throw new Error("unexpected page URL before dialog probes");
    }

    const onMessage = null; // replaced by waitForDialog helpers below
    void onMessage;

    async function waitForDialogOpening(timeoutMs = 4_000) {
      return withTimeout(
        new Promise((resolve) => {
          const onMessage = (_event, method, params) => {
            if (method !== "Page.javascriptDialogOpening") return;
            debuggerApi.removeListener("message", onMessage);
            resolve(params);
          };
          debuggerApi.on("message", onMessage);
        }),
        timeoutMs,
        "dialog opening",
      );
    }

    async function runDialog(expression, { accept, optional = false }) {
      const openingPromise = waitForDialogOpening(optional ? 1_500 : 4_000);
      const evalPromise = webContents.executeJavaScript(expression).then(
        (value) => ({ ok: true, value }),
        (error) => ({ ok: false, error: String(error?.message || error) }),
      );
      let params = null;
      try {
        params = await openingPromise;
      } catch (error) {
        if (!optional) throw error;
        const evaluated = await evalPromise;
        return { opening: null, evaluated };
      }
      openings.push(params?.type || "unknown");
      await debuggerApi.sendCommand("Page.handleJavaScriptDialog", {
        accept: accept === true,
      });
      const evaluated = await evalPromise;
      return { opening: params, evaluated };
    }

    await runDialog("window.alert('feasibility-alert')", { accept: true });
    await runDialog("window.confirm('feasibility-confirm')", { accept: true });
    const prompt = await runDialog(
      "window.prompt('feasibility-prompt','secret-value')",
      { accept: false, optional: true },
    );
    if (prompt.opening) {
      if (prompt.evaluated?.value !== null) {
        throw new Error("prompt must be cancelled/suppressed");
      }
    } else if (prompt.evaluated?.value != null && prompt.evaluated.value !== null) {
      throw new Error("prompt returned a value without a CDP opening");
    }
    // Engine-level prompt absence/throw also counts as suppress.

    // Navigation cancels any parked dialog work; then detach cleanly.
    const reloadReady = waitForLoad(webContents);
    await Promise.all([webContents.loadURL(`${origin}/dialogs?nav=1`), reloadReady]);
    if (debuggerApi.isAttached()) {
      debuggerApi.detach();
      detachedCleanly = !debuggerApi.isAttached();
    } else {
      detachedCleanly = true;
    }

    if (!openings.includes("alert") || !openings.includes("confirm")) {
      throw new Error(`missing dialog openings: ${openings.join(",")}`);
    }
    if (!detachedCleanly) {
      throw new Error("debugger did not detach cleanly");
    }

    console.log("browser-dialog-feasibility: ok");
    console.log(JSON.stringify({
      disableDialogs: false,
      openings,
      promptSuppressed: true,
      policy: policy.decide("alert"),
    }, null, 2));
    surfaceManager.destroySurface("window-dialog", "tab-dialog");
    hostWindow.destroy();
    await closeServer(server);
    app.exit(0);
  } catch (error) {
    console.error("browser-dialog-feasibility: failed");
    console.error(error);
    console.error(JSON.stringify({
      disableDialogs: true,
      openings,
      reason: String(error?.message || error),
    }, null, 2));
    try {
      if (debuggerApi.isAttached()) debuggerApi.detach();
    } catch {
      /* ignore */
    }
    surfaceManager.destroySurface("window-dialog", "tab-dialog");
    hostWindow.destroy();
    await closeServer(server);
    app.exit(1);
  }
}

app.whenReady().then(() => run().catch((error) => {
  console.error(error);
  app.exit(1);
}));
