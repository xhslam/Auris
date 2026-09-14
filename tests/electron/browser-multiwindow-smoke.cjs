"use strict";
/* eslint-disable @typescript-eslint/no-require-imports */

const http = require("node:http");
const { app, BrowserWindow, WebContentsView } = require("electron");
const { createBrowserApprovalManager } = require("../../electron/browser/browser-approvals.cjs");
const { createBrowserGrantManager } = require("../../electron/browser/browser-grants.cjs");
const { createBrowserLeaseManager } = require("../../electron/browser/browser-lease.cjs");
const { createBrowserRegistry } = require("../../electron/browser/browser-registry.cjs");
const { createBrowserStatusService } = require("../../electron/browser/browser-status-service.cjs");

function startFixture() {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`<title>${request.url}</title><button id="action">Action</button>`);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("fixture address unavailable"));
      resolve({ origin: `http://127.0.0.1:${address.port}`, server });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function run() {
  app.disableHardwareAcceleration();
  await app.whenReady();
  const { origin, server } = await startFixture();
  const registry = createBrowserRegistry();
  const leases = createBrowserLeaseManager();
  const grants = createBrowserGrantManager();
  const approvals = createBrowserApprovalManager({ grants });
  const workflows = { snapshot: () => ({ runs: [] }), subscribeAll: () => () => undefined };
  const status = createBrowserStatusService({ approvals, grants, leases, registry, workflows });
  const windows = [];
  const views = [];

  try {
    for (let windowIndex = 0; windowIndex < 2; windowIndex += 1) {
      const nativeWindow = new BrowserWindow({ height: 520, show: false, width: 760 });
      windows.push(nativeWindow);
      const windowRecord = registry.createWindow();
      for (let tabIndex = 0; tabIndex < 2; tabIndex += 1) {
        const tab = registry.createTab(windowRecord.windowId, { automationMode: "Human", url: `${origin}/w${windowIndex}-t${tabIndex}` });
        const view = new WebContentsView({ webPreferences: { contextIsolation: true, nodeIntegration: false, partition: `temp:auris-multiwindow-${windowIndex}-${tabIndex}`, sandbox: true } });
        nativeWindow.contentView.addChildView(view);
        view.setBounds({ x: 0, y: 0, width: 700, height: 440 });
        await view.webContents.loadURL(`${origin}/w${windowIndex}-t${tabIndex}`);
        const title = await view.webContents.executeJavaScript("document.title", true);
        await view.webContents.executeJavaScript("document.querySelector('#action').dataset.ran = 'true'", true);
        registry.updateTab(windowRecord.windowId, tab.tabId, { loading: false, title });
        registry.setTabLifecycle(windowRecord.windowId, tab.tabId, "ready");
        views.push({ tab, view, windowRecord });
      }
    }

    const controlled = views[0];
    leases.acquire({ connectionId: "smoke-mcp", controlEpoch: controlled.tab.controlEpoch, navigationGeneration: controlled.tab.navigationGeneration, windowId: controlled.windowRecord.windowId, tabId: controlled.tab.tabId });
    const beforeReclaim = status.getSnapshot();
    const epoch = registry.rotateControlEpoch(controlled.windowRecord.windowId, controlled.tab.tabId);
    leases.controlChanged(controlled.windowRecord.windowId, controlled.tab.tabId, epoch);

    const crashed = views[3];
    crashed.view.webContents.forcefullyCrashRenderer();
    registry.setTabLifecycle(crashed.windowRecord.windowId, crashed.tab.tabId, "crashed");
    registry.setCrashState(crashed.windowRecord.windowId, crashed.tab.tabId, { crashMode: "manual-only", crashStreak: 1 });
    await new Promise((resolve) => setTimeout(resolve, 160));
    const after = status.getSnapshot();
    if (beforeReclaim.windows.length !== 2 || beforeReclaim.windows.flatMap((windowRecord) => windowRecord.tabs).length !== 4) {
      throw new Error(`status center did not project two windows/four tabs: ${JSON.stringify(beforeReclaim)}`);
    }
    if (leases.snapshot().leases.length !== 0) throw new Error("human reclaim leaked a lease");
    if (!after.windows.flatMap((windowRecord) => windowRecord.tabs).some((tab) => tab.lifecycle === "crashed")) throw new Error("crash state missing from status center");
    process.stdout.write(`${JSON.stringify({ ok: true, windows: 2, tabs: 4, reclaimed: true, crashProjected: true })}\n`);
  } finally {
    status.dispose();
    for (const nativeWindow of windows) nativeWindow.destroy();
    await closeServer(server);
    app.exit(0);
  }
}

run().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  app.exit(1);
});
