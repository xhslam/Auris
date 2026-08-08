"use strict";
/* eslint-disable @typescript-eslint/no-require-imports */

const http = require("node:http");
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
  createBrowserRegistry,
} = require("../../electron/browser/browser-registry.cjs");
const {
  createBrowserRecovery,
} = require("../../electron/browser/browser-recovery.cjs");
const {
  createBrowserHibernation,
} = require("../../electron/browser/browser-hibernation.cjs");
const {
  createBrowserLeaseManager,
} = require("../../electron/browser/browser-lease.cjs");
const {
  createBrowserApprovalManager,
} = require("../../electron/browser/browser-approvals.cjs");
const {
  createBrowserGrantManager,
} = require("../../electron/browser/browser-grants.cjs");

const FIXTURE = `<!doctype html><html><body><h1>crash probe</h1></body></html>`;

function startServer() {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, {
      "content-security-policy": "default-src 'self'",
      "content-type": "text/html; charset=utf-8",
    });
    response.end(FIXTURE);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Crash recovery fixture did not expose a TCP port."));
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
  const { origin, server } = await startServer();
  const registry = createBrowserRegistry();
  const leases = createBrowserLeaseManager();
  const grants = createBrowserGrantManager();
  const approvals = createBrowserApprovalManager({ grants });
  const recovery = createBrowserRecovery({ backoffMs: [0, 0, 0], maxAutoReloads: 3 });
  const hibernation = createBrowserHibernation({ maxLiveViews: 1 });

  const hostWindow = new BrowserWindow({
    height: 700,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    width: 900,
  });
  const partitionSelector = createBrowserPartitionSelector({
    getSession: (partitionName) => session.fromPartition(partitionName),
  });

  const events = [];
  const surfaceManager = createBrowserSurfaceManager({
    WebContentsView,
    onEvent: (event) => events.push(event),
  });

  const window = registry.createWindow();
  const tab = registry.createTab(window.windowId, {
    automationMode: "Human",
    title: "Crash",
    url: `${origin}/one`,
  });
  registry.setTabLifecycle(window.windowId, tab.tabId, "ready");
  const partition = partitionSelector.select("Human");
  const surface = surfaceManager.createSurface({
    hostWindow,
    initialUrl: `${origin}/one`,
    partitionContext: partition,
    tabId: tab.tabId,
    windowId: window.windowId,
  });
  const ready = waitForLoad(surface.view.webContents);
  await Promise.all([surface.loadPromise, ready]);
  surfaceManager.activateSurface(window.windowId, tab.tabId);
  surfaceManager.layoutWindow(window.windowId, hostWindow.getContentBounds());

  // Acquire a lease then crash: recovery must invalidate authority.
  const control = leases.acquire({
    connectionId: "connection-crash",
    controlEpoch: tab.controlEpoch,
    navigationGeneration: tab.navigationGeneration,
    tabId: tab.tabId,
    windowId: window.windowId,
  });
  const beforeEpoch = registry.getTab(window.windowId, tab.tabId).controlEpoch;

  const decision1 = recovery.noteFailure(window.windowId, tab.tabId, { kind: "crash" });
  if (decision1.action !== "auto-reload") reasons.push("first crash should auto-reload");
  leases.controlChanged(window.windowId, tab.tabId);
  approvals.controlChanged?.(window.windowId, tab.tabId);
  grants.controlChanged?.(window.windowId, tab.tabId);
  registry.setTabLifecycle(window.windowId, tab.tabId, "crashed");

  surface.view.webContents.forcefullyCrashRenderer?.();
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Recreate surface for auto recovery path.
  surfaceManager.destroySurface(window.windowId, tab.tabId);
  const reset = registry.resetTabRuntimeAuthority(window.windowId, tab.tabId, {
    automationMode: "Human",
    title: "Crash",
    url: `${origin}/one`,
  });
  if (!reset) reasons.push("resetTabRuntimeAuthority failed");
  if (reset.controlEpoch <= beforeEpoch) reasons.push("controlEpoch did not advance");
  if (registry.getHistory(window.windowId, tab.tabId)?.entries?.length !== 1) {
    reasons.push("history survived crash recovery");
  }
  if (leases.isAvailable(window.windowId, tab.tabId) !== true) {
    reasons.push("lease remained held after crash authority purge");
  }
  try {
    leases.assert({
      connectionId: "connection-crash",
      controlEpoch: control.controlEpoch,
      leaseToken: control.leaseToken,
      navigationGeneration: control.navigationGeneration,
      tabId: tab.tabId,
      windowId: window.windowId,
    });
    reasons.push("stale lease remained valid after crash recovery");
  } catch {
    /* expected LEASE_LOST */
  }

  const recovered = surfaceManager.createSurface({
    hostWindow,
    initialUrl: `${origin}/one`,
    partitionContext: partition,
    tabId: tab.tabId,
    windowId: window.windowId,
  });
  const recoveredReady = waitForLoad(recovered.view.webContents);
  await Promise.all([recovered.loadPromise, recoveredReady]);
  recovery.noteSuccessfulLoad(window.windowId, tab.tabId);
  registry.setTabLifecycle(window.windowId, tab.tabId, "ready");
  registry.setCrashState(window.windowId, tab.tabId, { crashMode: "ok", crashStreak: 0 });

  // Exhaust budget into manual-only.
  recovery.noteFailure(window.windowId, tab.tabId, { kind: "crash" });
  recovery.noteFailure(window.windowId, tab.tabId, { kind: "crash" });
  recovery.noteFailure(window.windowId, tab.tabId, { kind: "crash" });
  const manual = recovery.noteFailure(window.windowId, tab.tabId, { kind: "crash" });
  if (manual.action !== "manual-only") reasons.push("fourth crash should be manual-only");

  // Hibernation eligibility: background ready tab may hibernate.
  const bg = registry.createTab(window.windowId, {
    automationMode: "Human",
    title: "BG",
    url: `${origin}/bg`,
  });
  registry.setTabLifecycle(window.windowId, bg.tabId, "ready");
  registry.activateTab(window.windowId, tab.tabId);
  if (!hibernation.canHibernate({
    active: false,
    controlled: false,
    lifecycle: "ready",
    loading: false,
    pendingApproval: false,
  })) {
    reasons.push("background ready tab should be hibernation-eligible");
  }
  const serialized = hibernation.serialize(registry.getTab(window.windowId, bg.tabId));
  if ("historyEntries" in serialized || "leaseToken" in serialized) {
    reasons.push("hibernation serialized unsafe fields");
  }

  surfaceManager.destroySurface(window.windowId, tab.tabId);
  hostWindow.destroy();
  await closeServer(server);

  if (reasons.length > 0) {
    console.error("browser-crash-recovery: failed");
    console.error(JSON.stringify({ events: events.map((e) => e.type), reasons }, null, 2));
    app.exit(1);
    return;
  }

  console.log("browser-crash-recovery: ok");
  console.log(JSON.stringify({
    manual,
    resetEpoch: reset.controlEpoch,
    serialized,
  }, null, 2));
  app.exit(0);
}

app.whenReady().then(() => run().catch((error) => {
  console.error(error);
  app.exit(1);
}));
