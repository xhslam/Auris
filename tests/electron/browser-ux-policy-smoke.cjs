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
const {
  createBrowserDialogService,
} = require("../../electron/browser/browser-dialog-service.cjs");
const {
  createBrowserDownloadService,
} = require("../../electron/browser/browser-download-service.cjs");
const {
  createBrowserPagePolicy,
} = require("../../electron/browser/browser-page-policy.cjs");

const FIXTURE_PATH = path.join(
  __dirname,
  "..",
  "fixtures",
  "browser",
  "hostile-surfaces.html",
);
const SECRET_BYTES = Buffer.from("not-for-agents");

function startServer() {
  const html = fsSync.readFileSync(FIXTURE_PATH, "utf8");
  const server = http.createServer((request, response) => {
    if (request.url?.startsWith("/secret.bin")) {
      response.writeHead(200, {
        "content-disposition": "attachment; filename=\"secret.bin\"",
        "content-type": "application/octet-stream",
      });
      response.end(SECRET_BYTES);
      return;
    }
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
        reject(new Error("UX policy fixture did not expose a TCP port."));
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
  const reasons = [];
  const uxPolicy = createBrowserUxPolicy();
  const downloadStatuses = [];
  const dialogService = createBrowserDialogService({ uxPolicy });
  const downloadService = createBrowserDownloadService({
    uxPolicy,
    // No save dialog in smoke => downloads cancel (fail-closed, not auto-save).
    onStatus: (status) => downloadStatuses.push(status),
  });

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
  const pagePolicy = createBrowserPagePolicy({ uxPolicy });
  // Prefer surface manager page policy over partition attach for this smoke.
  let dialogDispose = null;
  const surfaceManager = createBrowserSurfaceManager({
    WebContentsView,
    attachDialogService: (webContents, ids) => {
      dialogDispose = dialogService.attach(webContents, ids);
      return dialogDispose;
    },
    attachDownloadService: downloadService.attach,
    createPagePolicy: () => pagePolicy,
  });
  const partition = partitionSelector.select("AiSandbox");
  const surface = surfaceManager.createSurface({
    hostWindow,
    initialUrl: `${origin}/hostile`,
    partitionContext: {
      ...partition,
      attachPagePolicy: (webContents) => pagePolicy.attach(webContents),
    },
    tabId: "tab-ux",
    windowId: "window-ux",
  });
  const webContents = surface.view.webContents;
  const ready = waitForLoad(webContents);
  await Promise.all([surface.loadPromise, ready]);
  if (dialogDispose?.ready) await dialogDispose.ready;
  surfaceManager.activateSurface("window-ux", "tab-ux");
  surfaceManager.layoutWindow("window-ux", hostWindow.getContentBounds());
  hostWindow.showInactive();

  // Alert/confirm handled; prompt suppressed (engine may throw instead of opening).
  await webContents.executeJavaScript("window.alert('ux-alert')");
  const confirmResult = await webContents.executeJavaScript("window.confirm('ux-confirm')");
  if (confirmResult !== true) reasons.push("confirm was not accepted by bounded handler");
  const promptResult = await webContents.executeJavaScript(
    "window.prompt('ux-prompt','secret-value')",
  ).then((value) => value, () => null);
  if (promptResult !== null) reasons.push("prompt leaked a value");

  const popupResult = await webContents.executeJavaScript(
    "(() => { const w = window.open('about:blank','_blank'); return w ? 'opened' : 'blocked'; })()",
  );
  if (popupResult !== "blocked") reasons.push("popup was not blocked");

  const mailtoBlocked = pagePolicy.decideNavigation("mailto:leak@example.com");
  if (mailtoBlocked.allowed) reasons.push("external protocol navigation was allowed");

  // Permission deny-by-default already on partition; assert geolocation path fails closed.
  const geo = await webContents.executeJavaScript(`
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve('unavailable');
      navigator.geolocation.getCurrentPosition(
        () => resolve('allowed'),
        () => resolve('denied'),
        { timeout: 1500 },
      );
      setTimeout(() => resolve('denied'), 1600);
    })
  `);
  if (geo === "allowed") reasons.push("geolocation was allowed");

  // Download must not auto-save without a human destination.
  webContents.downloadURL(`${origin}/secret.bin`);
  await new Promise((resolve) => setTimeout(resolve, 400));
  if (downloadStatuses.some((entry) => entry.state === "completed")) {
    reasons.push("download completed without human save destination");
  }
  if (JSON.stringify(downloadStatuses).includes(String(SECRET_BYTES))) {
    reasons.push("download status leaked file bytes");
  }

  // Teardown must drain late callbacks.
  surfaceManager.destroySurface("window-ux", "tab-ux");
  expectNoThrow(() => dialogService.cancelAll(webContents), reasons, "late dialog cancel");
  expectNoThrow(() => downloadService.cancelAll(webContents), reasons, "late download cancel");

  hostWindow.destroy();
  await closeServer(server);

  if (reasons.length > 0) {
    console.error("browser-ux-policy: failed");
    console.error(JSON.stringify({ downloadStatuses, reasons }, null, 2));
    app.exit(1);
    return;
  }

  console.log("browser-ux-policy: ok");
  console.log(JSON.stringify({
    downloadStatuses,
    snapshot: uxPolicy.snapshot(),
  }, null, 2));
  app.exit(0);
}

function expectNoThrow(fn, reasons, label) {
  try {
    fn();
  } catch (error) {
    reasons.push(`${label} threw: ${error?.message || error}`);
  }
}

app.whenReady().then(() => run().catch((error) => {
  console.error(error);
  app.exit(1);
}));
