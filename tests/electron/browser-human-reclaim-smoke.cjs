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
  createBrowserApprovalManager,
} = require("../../electron/browser/browser-approvals.cjs");
const {
  createBrowserCommandDispatcher,
} = require("../../electron/browser/browser-command-dispatcher.cjs");
const {
  createBrowserGrantManager,
} = require("../../electron/browser/browser-grants.cjs");
const {
  createBrowserHumanReclaim,
} = require("../../electron/browser/browser-human-reclaim.cjs");
const {
  createBrowserLeaseManager,
} = require("../../electron/browser/browser-lease.cjs");
const {
  createBrowserPartitionSelector,
} = require("../../electron/browser/browser-partitions.cjs");
const {
  createBrowserRegistry,
} = require("../../electron/browser/browser-registry.cjs");
const {
  createBrowserSurfaceManager,
} = require("../../electron/browser/browser-surface-manager.cjs");

const FIXTURE_PATH = path.join(
  __dirname,
  "..",
  "fixtures",
  "browser",
  "human-reclaim.html",
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
        reject(new Error("Human reclaim fixture did not expose a TCP port."));
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

function waitForLoad(webContents, timeoutMs = 12_000) {
  return withTimeout(
    new Promise((resolve, reject) => {
      const finish = () => {
        cleanup();
        resolve();
      };
      const fail = (_event, code, description) => {
        cleanup();
        reject(new Error(`page load failed: ${code} ${description}`));
      };
      const cleanup = () => {
        webContents.removeListener("did-finish-load", finish);
        webContents.removeListener("did-fail-load", fail);
      };
      if (!webContents.isLoading() && webContents.getURL()) {
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
  const { origin, server } = await startServer();
  const registry = createBrowserRegistry();
  const leases = createBrowserLeaseManager();
  const grants = createBrowserGrantManager();
  const approvals = createBrowserApprovalManager({ grants });
  const partitionSelector = createBrowserPartitionSelector({
    getSession: (partitionName) => session.fromPartition(partitionName),
  });

  let dispatcher = null;
  const reclaimCalls = [];
  const humanReclaim = createBrowserHumanReclaim({
    reclaim: (input) => {
      reclaimCalls.push(input);
      return dispatcher.humanReclaim(input.windowId, input.tabId, {
        reason: input.reason,
      });
    },
  });

  const hostWindow = new BrowserWindow({
    height: 700,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    width: 900,
  });

  const surfaceManager = createBrowserSurfaceManager({
    WebContentsView,
    attachHumanReclaim: humanReclaim.attach,
  });
  const surfaces = new Map();

  async function createAiSandboxTarget({ url }) {
    const window = registry.createWindow();
    const tab = registry.createTab(window.windowId, {
      automationMode: "AiSandbox",
      title: "Reclaim",
      url,
    });
    const partition = partitionSelector.select("AiSandbox");
    const surface = surfaceManager.createSurface({
      hostWindow,
      initialUrl: url,
      partitionContext: partition,
      tabId: tab.tabId,
      windowId: window.windowId,
    });
    const ready = waitForLoad(surface.view.webContents);
    await Promise.all([surface.loadPromise, ready]);
    surfaceManager.activateSurface(window.windowId, tab.tabId);
    surfaceManager.layoutWindow(window.windowId, hostWindow.getContentBounds());
    hostWindow.showInactive();
    registry.setTabLifecycle(window.windowId, tab.tabId, "ready");
    surfaces.set(`${window.windowId}/${tab.tabId}`, surface);
    return {
      automationMode: "AiSandbox",
      partition: partition.partition,
      tabId: tab.tabId,
      webContents: surface.view.webContents,
      windowId: window.windowId,
    };
  }

  const executor = {
    execute: async ({ request, signal }) => {
      if (request.action !== "wait") return { action: request.action };
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, request.milliseconds ?? 5_000);
        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          const error = new Error("cancelled");
          error.code = "CANCELLED";
          reject(error);
        }, { once: true });
      });
      return { waited: true };
    },
  };

  dispatcher = createBrowserCommandDispatcher({
    approvals,
    createAiSandboxTarget,
    destroyTarget: async ({ tabId, windowId }) => {
      surfaceManager.destroySurface(windowId, tabId);
      surfaces.delete(`${windowId}/${tabId}`);
      return true;
    },
    executor,
    grants,
    leases,
    partitionSelector,
    registry,
  });

  try {
    for (const inputKind of ["mouse", "keyboard"]) {
      reclaimCalls.length = 0;
      const opened = await dispatcher.dispatch({
        connectionId: `connection-${inputKind}`,
        params: { request: { action: "open", url: `${origin}/${inputKind}` } },
        signal: new AbortController().signal,
      });
      const beforeEpoch = registry.getTab(
        opened.target.windowId,
        opened.target.tabId,
      ).controlEpoch;
      const surface = surfaces.get(`${opened.target.windowId}/${opened.target.tabId}`);
      const webContents = surface.view.webContents;

      const delayed = dispatcher.dispatch({
        connectionId: `connection-${inputKind}`,
        params: {
          control: opened.control,
          request: { action: "wait", milliseconds: 8_000 },
        },
        signal: new AbortController().signal,
      });
      // Attach failure handling immediately so reclaim abort cannot become unhandled.
      const delayedSettled = delayed.then(
        () => {
          throw new Error("Expected reclaim to cancel the in-flight action.");
        },
        (error) => {
          if (error?.code !== "CANCELLED") throw error;
        },
      );
      await new Promise((resolve) => setTimeout(resolve, 120));

      if (inputKind === "mouse") {
        const bounds = surface.view.getBounds();
        const x = Math.max(8, Math.floor((bounds.width || 400) / 2));
        const y = Math.max(8, Math.floor((bounds.height || 400) / 2));
        webContents.sendInputEvent({ type: "mouseDown", x, y, button: "left", clickCount: 1 });
        webContents.sendInputEvent({ type: "mouseUp", x, y, button: "left", clickCount: 1 });
      } else {
        webContents.focus();
        webContents.sendInputEvent({ type: "keyDown", keyCode: "A" });
        webContents.sendInputEvent({ type: "char", keyCode: "A" });
        webContents.sendInputEvent({ type: "keyUp", keyCode: "A" });
      }

      await new Promise((resolve) => setTimeout(resolve, 80));
      if (reclaimCalls.length === 0) {
        throw new Error(
          `${inputKind}: trusted Electron input hooks did not fire. sendInputEvent must reclaim via before-* events.`,
        );
      }
      if (reclaimCalls[0].reason !== inputKind) {
        throw new Error(`${inputKind}: unexpected reclaim reason ${reclaimCalls[0].reason}`);
      }

      await delayedSettled;
      const tab = registry.getTab(opened.target.windowId, opened.target.tabId);
      if (!tab || tab.controlEpoch <= beforeEpoch) {
        throw new Error(`${inputKind} reclaim did not rotate controlEpoch.`);
      }
      if (leases.snapshot().leases.length !== 0) {
        throw new Error(`${inputKind} reclaim left an active lease.`);
      }

      // Re-acquire for the negative page-script check on the first pass only.
      if (inputKind === "mouse") {
        const second = await dispatcher.dispatch({
          connectionId: "connection-page-script",
          params: { request: { action: "open", url: `${origin}/page-script` } },
          signal: new AbortController().signal,
        });
        const beforePageScript = reclaimCalls.length;
        await webContents.executeJavaScript(`
          document.getElementById("reclaim-target").dispatchEvent(new MouseEvent("click", { bubbles: true }));
          window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
          true
        `);
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (reclaimCalls.length !== beforePageScript) {
          throw new Error("Page-script events must not invoke Electron reclaim hooks.");
        }
        if (leases.snapshot().leases.every((lease) => lease.tabId !== second.target.tabId)) {
          throw new Error("Page-script events incorrectly cleared another tab lease.");
        }
        await dispatcher.dispatch({
          connectionId: "connection-page-script",
          params: {
            control: second.control,
            request: { action: "release_control" },
          },
          signal: new AbortController().signal,
        });
      }
    }

    process.stdout.write("browser-human-reclaim: ok\n");
  } finally {
    for (const [compound] of [...surfaces]) {
      const [windowId, tabId] = compound.split("/");
      try {
        surfaceManager.destroySurface(windowId, tabId);
      } catch {
        // Teardown is best-effort after assertion failures.
      }
    }
    hostWindow.destroy();
    await closeServer(server);
  }
}

app.whenReady().then(() => run().then(() => app.exit(0)).catch((error) => {
  console.error(error);
  app.exit(1);
}));
