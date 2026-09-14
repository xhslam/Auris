"use strict";
/* eslint-disable @typescript-eslint/no-require-imports */

const fsSync = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const {
  app,
  BrowserWindow,
  session,
  WebContentsView,
} = require("electron");
const {
  AI_SANDBOX_PARTITION,
  HUMAN_PARTITION,
  createBrowserPartitionSelector,
} = require("../../electron/browser/browser-partitions.cjs");
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
const MARKER_PATH = path.join(os.tmpdir(), "auris-partition-isolation-marker.json");

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
        reject(new Error("Partition isolation fixture did not expose a TCP port."));
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
  let hostWindow;
  try {
    const selector = createBrowserPartitionSelector({
      getSession: (partitionName) => session.fromPartition(partitionName),
    });
    const human = selector.select("Human");
    const sandbox = selector.select("AiSandbox");
    const shared = selector.select("AiShared");

    if (human.partition !== HUMAN_PARTITION || !human.persistent) {
      throw new Error("Human partition must be persistent human profile.");
    }
    if (sandbox.partition !== AI_SANDBOX_PARTITION || sandbox.persistent) {
      throw new Error("AiSandbox partition must stay shared and non-persistent.");
    }
    if (shared.partition !== human.partition || shared.session !== human.session) {
      throw new Error("AiShared must reuse the Human persistent session.");
    }

    hostWindow = new BrowserWindow({
      height: 700,
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
      width: 1000,
    });

    const manager = createBrowserSurfaceManager({ WebContentsView });
    const humanSurface = manager.createSurface({
      hostWindow,
      initialUrl: `${origin}/human`,
      partitionContext: human,
      tabId: "browser-tab-human",
      windowId: "browser-window-partition",
    });
    const humanReady = waitForLoad(humanSurface.view.webContents);
    const sandboxSurface = manager.createSurface({
      hostWindow,
      initialUrl: `${origin}/sandbox`,
      partitionContext: sandbox,
      tabId: "browser-tab-sandbox",
      windowId: "browser-window-partition",
    });
    const sandboxReady = waitForLoad(sandboxSurface.view.webContents);
    const sharedSurface = manager.createSurface({
      hostWindow,
      initialUrl: `${origin}/shared`,
      partitionContext: shared,
      tabId: "browser-tab-shared",
      windowId: "browser-window-partition",
    });
    const sharedReady = waitForLoad(sharedSurface.view.webContents);

    await Promise.all([
      humanSurface.loadPromise,
      sandboxSurface.loadPromise,
      sharedSurface.loadPromise,
      humanReady,
      sandboxReady,
      sharedReady,
    ]);

    const cookie = {
      url: origin,
      name: "auris_human_secret",
      value: "human-only-value",
    };
    await human.session.cookies.set(cookie);
    await humanSurface.view.webContents.executeJavaScript(
      "localStorage.setItem('auris-human-store', 'human-local'); 'ok'",
    );

    const sandboxCookies = await sandbox.session.cookies.get({ url: origin });
    if (sandboxCookies.some((entry) => entry.name === "auris_human_secret")) {
      throw new Error("AiSandbox must not see Human cookies.");
    }
    const sandboxStorage = await sandboxSurface.view.webContents.executeJavaScript(
      "localStorage.getItem('auris-human-store')",
    );
    if (sandboxStorage !== null) {
      throw new Error("AiSandbox must not see Human localStorage.");
    }

    const sharedCookies = await shared.session.cookies.get({ url: origin });
    if (!sharedCookies.some((entry) => entry.name === "auris_human_secret")) {
      throw new Error("AiShared must see Human cookies after explicit shared mode use.");
    }
    const sharedStorage = await sharedSurface.view.webContents.executeJavaScript(
      "localStorage.getItem('auris-human-store')",
    );
    if (sharedStorage !== "human-local") {
      throw new Error("AiShared must share Human localStorage.");
    }

    const marker = {
      humanPartition: human.partition,
      sandboxPartition: sandbox.partition,
      sandboxPersistent: sandbox.persistent,
      checkedAt: Date.now(),
    };
    fsSync.writeFileSync(MARKER_PATH, `${JSON.stringify(marker, null, 2)}\n`, "utf8");

    if (process.env.AURIS_PARTITION_ISOLATION_EXPECT_RESTART === "1") {
      if (!fsSync.existsSync(MARKER_PATH)) {
        throw new Error("Expected prior-run marker before restart verification.");
      }
      // Sandbox partition has no persist: prefix, so Electron must not retain it
      // as a durable profile name across process lifetimes.
      if (sandbox.partition.startsWith("persist:")) {
        throw new Error("AiSandbox accidentally became a persistent partition.");
      }
    }

    process.stdout.write("browser-partition-isolation: ok\n");
  } finally {
    hostWindow?.destroy();
    await closeServer(server);
  }
}

app.whenReady().then(() => run().then(() => app.exit(0)).catch((error) => {
  console.error(error);
  app.exit(1);
}));
