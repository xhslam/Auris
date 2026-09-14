"use strict";
/* eslint-disable @typescript-eslint/no-require-imports */

const childProcess = require("node:child_process");
const fsSync = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const CHILD_MARKER = "--auris-browser-electron-child";

if (!process.versions.electron) {
  runOrchestrator().catch((error) => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  });
} else {
  runElectronChild().then(
    () => process.exit(0),
    (error) => {
      process.stderr.write(`${error?.stack ?? error}\n`);
      process.exit(1);
    },
  );
}

async function runOrchestrator() {
  const electronPath = require("electron");
  const tempDirectory = fsSync.mkdtempSync(path.join(os.tmpdir(), "auris-browser-smoke-"));
  try {
    const first = await runPhase(electronPath, "first", tempDirectory);
    const restarted = await runPhase(electronPath, "restart", tempDirectory);
    if (!first.mainAlive || first.historyBeforeClose < 2) {
      throw new Error(`First browser lifecycle phase failed: ${JSON.stringify(first)}`);
    }
    if (first.historyBeforeClose !== first.historyAfterReopen) {
      throw new Error(`Same-process history changed: ${JSON.stringify(first)}`);
    }
    if (
      restarted.historyAfterRestart !== 1
      || restarted.bookmarkCount !== 1
      || restarted.restoredRetained !== true
      || !restarted.restoredBounds
    ) {
      throw new Error(`Restart persistence boundary failed: ${JSON.stringify(restarted)}`);
    }
    process.stdout.write(`${JSON.stringify({ first, restarted })}\n`);
  } finally {
    fsSync.rmSync(tempDirectory, { force: true, recursive: true });
  }
}

function runPhase(electronPath, phase, tempDirectory) {
  return new Promise((resolve, reject) => {
    const childEnv = { ...process.env, ELECTRON_ENABLE_LOGGING: "0" };
    // Cursor/agent shells often set ELECTRON_RUN_AS_NODE, which makes
    // `require("electron")` return a path string instead of the Electron API.
    delete childEnv.ELECTRON_RUN_AS_NODE;
    const child = childProcess.spawn(
      electronPath,
      [__filename, CHILD_MARKER, phase, tempDirectory],
      {
        env: childEnv,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let settled = false;
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error([
        `Electron browser smoke phase ${phase} timed out.`,
        stdout,
        stderr,
      ].filter(Boolean).join("\n")));
    }, 60_000);

    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        child.kill("SIGKILL");
        reject(error);
        return;
      }
      child.once("exit", () => resolve(value));
      child.kill("SIGKILL");
    }

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      for (const line of stdout.split(/\r?\n/u)) {
        if (!line.startsWith("{")) continue;
        try {
          finish(null, JSON.parse(line));
          return;
        } catch {
          // Wait for a complete JSON line.
        }
      }
    });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => finish(error));
    child.once("exit", (code, signal) => {
      if (settled) return;
      finish(new Error([
        `Electron browser smoke phase ${phase} exited before a result (code=${code}, signal=${signal}).`,
        stdout,
        stderr,
      ].filter(Boolean).join("\n")));
    });
  });
}

async function runElectronChild() {
  const markerIndex = process.argv.indexOf(CHILD_MARKER);
  const phase = process.argv[markerIndex + 1];
  const tempDirectory = process.argv[markerIndex + 2];
  if (!phase || !tempDirectory) throw new Error("Browser smoke child arguments are missing.");

  const { app, BrowserWindow, WebContentsView, screen } = require("electron");
  const { createBrowserCapabilities } = require("../../electron/browser/browser-capabilities.cjs");
  const { createBrowserPagePolicy } = require("../../electron/browser/browser-page-policy.cjs");
  const { createBrowserRegistry } = require("../../electron/browser/browser-registry.cjs");
  const {
    createBrowserStateRepository,
  } = require("../../electron/browser/browser-state-repository.cjs");
  const {
    createBrowserSurfaceManager,
  } = require("../../electron/browser/browser-surface-manager.cjs");
  const {
    createBrowserWindowManager,
  } = require("../../electron/browser/browser-window-manager.cjs");

  app.disableHardwareAcceleration();
  const progress = (stage) => process.stderr.write(`[browser-smoke:${phase}] ${stage}\n`);
  progress("waiting-for-app");
  await app.whenReady();
  progress("app-ready");
  const portFile = path.join(tempDirectory, "fixture-port.txt");
  const requestedPort = phase === "restart"
    ? Number(fsSync.readFileSync(portFile, "utf8"))
    : 0;
  const { origin, port, server } = await startFixtureServer(requestedPort);
  if (phase === "first") fsSync.writeFileSync(portFile, String(port));
  progress("fixture-ready");
  const databasePath = path.join(tempDirectory, "browser-state.db");
  const stateRepository = createBrowserStateRepository(databasePath);
  const registry = createBrowserRegistry();
  const navigationEvents = [];
  const surfaceManager = createBrowserSurfaceManager({
    WebContentsView,
    createPagePolicy: createBrowserPagePolicy,
    onEvent(event) {
      if (event.type === "navigated") {
        navigationEvents.push(event);
        registry.commitNavigation(event.windowId, event.tabId, {
          expectedGeneration: event.expectedGeneration,
          url: event.url,
        });
      } else if (event.type === "loading-started") {
        registry.updateTab(event.windowId, event.tabId, { loading: true });
      } else if (event.type === "loading-stopped") {
        registry.updateTab(event.windowId, event.tabId, { loading: false });
        registry.setTabLifecycle(event.windowId, event.tabId, "ready");
      }
    },
  });
  const browserWindows = [];
  function HiddenBrowserWindow(options) {
    const browserWindow = new BrowserWindow(options);
    browserWindow.show = () => browserWindow.hide();
    browserWindows.push(browserWindow);
    return browserWindow;
  }
  const manager = createBrowserWindowManager({
    BrowserWindow: HiddenBrowserWindow,
    capabilities: createBrowserCapabilities({ localFixtureEnabled: true }),
    preloadPath: path.join(__dirname, "..", "..", "electron", "browser", "browser-preload.cjs"),
    registry,
    screen,
    stateRepository,
    surfaceManager,
    targetUrl: origin,
  });
  let mainWindow;

  try {
    mainWindow = new BrowserWindow({
      height: 720,
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
      width: 1080,
    });
    await mainWindow.loadURL(`${origin}/basic-navigation.html?main=1`);
    progress("main-loaded");

    if (phase === "restart") {
      const restored = await manager.restore({ localFixture: true });
      progress("restart-restored");
      const restoredWindow = restored[0];
      const history = restoredWindow?.activeTabId
        ? registry.getHistory(restoredWindow.windowId, restoredWindow.activeTabId)
        : null;
      process.stdout.write(`${JSON.stringify({
        bookmarkCount: stateRepository.listBookmarks().length,
        historyAfterRestart: history?.entries.length ?? 0,
        restoredBounds: restoredWindow?.bounds ?? null,
        restoredRetained: restoredWindow?.tabs[0]?.retained === true,
      })}\n`);
      manager.closeAll();
      stateRepository.close();
      mainWindow.destroy();
      await closeServer(server);
      progress("restart-cleanup-complete");
      app.exit(0);
    }

    const initialUrl = `${origin}/basic-navigation.html?step=initial`;
    const opened = await manager.openBrowser({ localFixture: true, url: initialUrl });
    progress("browser-opened");
    const browserWindow = browserWindows.at(-1);
    if (!browserWindow || browserWindow.isVisible()) {
      throw new Error("Browser smoke window was not created hidden.");
    }
    const reused = await manager.openBrowser({ localFixture: true });
    const secondWindow = await manager.openBrowser({
      localFixture: true,
      newWindow: true,
      url: `${origin}/basic-navigation.html?window=second`,
    });
    const secondNativeWindow = browserWindows.at(-1);
    if (reused.windowId !== opened.windowId || secondWindow.windowId === opened.windowId) {
      throw new Error("Browser reuse/new-window semantics failed.");
    }
    surfaceManager.destroyWindow(secondWindow.windowId);
    secondNativeWindow.destroy();
    if (registry.getWindow(secondWindow.windowId) !== null) {
      throw new Error("Explicit second browser window did not close independently.");
    }
    const controller = manager.getControllerForWebContents(browserWindow.webContents);
    const firstExtra = await controller.createTab({
      url: `${origin}/basic-navigation.html?tab=extra-1`,
    });
    const secondExtra = await controller.createTab({
      url: `${origin}/basic-navigation.html?tab=extra-2`,
    });
    await controller.activateTab({ tabId: firstExtra.tabId });
    await controller.activateTab({ tabId: secondExtra.tabId });
    await controller.closeTab({ tabId: firstExtra.tabId });
    await controller.closeTab({ tabId: secondExtra.tabId });
    await controller.activateTab({ tabId: opened.activeTabId });
    progress("tabs-exercised");

    const firstNavigationUrl = `${origin}/basic-navigation.html?step=one`;
    const secondNavigationUrl = `${origin}/basic-navigation.html?step=two&exact=1#anchor`;
    await controller.navigate({ tabId: opened.activeTabId, url: firstNavigationUrl });
    await controller.navigate({ tabId: opened.activeTabId, url: secondNavigationUrl });
    progress("navigation-exercised");
    const firstExpected = navigationEvents.find(
      (event) => event.url === firstNavigationUrl,
    )?.expectedGeneration;
    const secondTabState = registry.getTab(opened.windowId, opened.activeTabId);
    if (!Number.isSafeInteger(firstExpected)) {
      throw new Error(`Navigation token missing: ${JSON.stringify(navigationEvents)}`);
    }
    const acceptedLate = registry.commitNavigation(opened.windowId, opened.activeTabId, {
      expectedGeneration: firstExpected,
      url: firstNavigationUrl,
    });
    if (acceptedLate || registry.getTab(opened.windowId, opened.activeTabId).url !== secondNavigationUrl) {
      throw new Error("Late navigation event replaced the current generation.");
    }
    await controller.bookmark({ tabId: opened.activeTabId });
    progress("bookmark-persisted");
    const historyBeforeClose = registry.getHistory(
      opened.windowId,
      opened.activeTabId,
    ).entries.length;

    surfaceManager.destroyWindow(opened.windowId);
    browserWindow.destroy();
    progress("destroy-requested");
    if (!browserWindow.isDestroyed() || registry.getWindow(opened.windowId) !== null) {
      throw new Error("Destroyed browser window did not complete manager lifecycle cleanup.");
    }
    progress("browser-closed");
    const reopened = await manager.openBrowser({ localFixture: true });
    progress("browser-reopened");
    const historyAfterReopen = registry.getHistory(
      reopened.windowId,
      reopened.activeTabId,
    ).entries.length;
    const mainAlive = !mainWindow.isDestroyed();
    registry.setTabRetained(reopened.windowId, reopened.activeTabId, true);
    const retainedBounds = registry.getWindow(reopened.windowId).bounds;
    manager.closeAll();
    progress("manager-closed");
    process.stdout.write(`${JSON.stringify({
      bookmarkUrl: stateRepository.listBookmarks()[0]?.url ?? null,
      generation: secondTabState.navigationGeneration,
      historyAfterReopen,
      historyBeforeClose,
      mainAlive,
      remainingTabs: reopened.tabs.length,
      retainedBounds,
      reusedWindow: reused.windowId === opened.windowId,
      secondWindowIndependent: secondWindow.windowId !== opened.windowId,
    })}\n`);
  } finally {
    progress("cleanup-started");
    manager.closeAll();
    stateRepository.close();
    mainWindow?.destroy();
    await closeServer(server);
    progress("cleanup-complete");
  }
  app.exit(0);
}

function startFixtureServer(port = 0) {
  const fixturePath = path.join(
    __dirname,
    "..",
    "fixtures",
    "browser",
    "basic-navigation.html",
  );
  const html = fsSync.readFileSync(fixturePath, "utf8");
  const server = http.createServer((_request, response) => {
    response.writeHead(200, {
      "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline'",
      "content-type": "text/html; charset=utf-8",
    });
    response.end(html);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Browser smoke fixture did not expose a TCP port."));
        return;
      }
      resolve({ origin: `http://127.0.0.1:${address.port}`, port: address.port, server });
    });
  });
}

function closeServer(server) {
  server.close();
  server.closeAllConnections?.();
  return Promise.resolve();
}
