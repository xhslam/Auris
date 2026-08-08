"use strict";
/* eslint-disable @typescript-eslint/no-require-imports */

const fsSync = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const {
  app,
  BrowserWindow,
  safeStorage,
  session,
  WebContentsView,
} = require("electron");
const {
  AI_SANDBOX_PARTITION,
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
  "session-probe.html",
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
        reject(new Error("Session fixture did not expose a TCP port."));
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
      const fail = (_event, errorCode, errorDescription, _validatedURL, isMainFrame) => {
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

async function runIsolatedStorageScript({ webContents, args, source }) {
  const debuggerApi = webContents.debugger;
  if (!debuggerApi.isAttached()) debuggerApi.attach("1.3");
  try {
    await debuggerApi.sendCommand("Page.enable");
    await debuggerApi.sendCommand("Runtime.enable");
    const tree = await debuggerApi.sendCommand("Page.getFrameTree");
    const frameId = tree?.frameTree?.frame?.id;
    const isolated = await debuggerApi.sendCommand("Page.createIsolatedWorld", {
      frameId,
      grantUniveralAccess: false,
      worldName: "auris-session-smoke",
    });
    const response = await debuggerApi.sendCommand("Runtime.callFunctionOn", {
      arguments: [{ value: args }],
      awaitPromise: true,
      executionContextId: isolated.executionContextId,
      functionDeclaration: `function(args) { return (${source})(args); }`,
      returnByValue: true,
      silent: true,
    });
    if (response?.exceptionDetails) {
      throw new Error("isolated storage script failed");
    }
    return response?.result?.value;
  } finally {
    if (debuggerApi.isAttached()) debuggerApi.detach();
  }
}

async function run() {
  if (safeStorage.isEncryptionAvailable() !== true) {
    throw new Error("safeStorage encryption is unavailable on this host.");
  }

  // Lazy-load SQLite-backed modules after Electron is ready so node:sqlite
  // experimental init cannot interfere with the first navigation.
  const {
    createBrowserStateDatabase,
  } = require("../../electron/browser/browser-state-db.cjs");
  const {
    createBrowserSessionCapabilities,
  } = require("../../electron/browser/browser-session-capabilities.cjs");
  const {
    createBrowserSessionService,
  } = require("../../electron/browser/browser-session-service.cjs");
  const {
    createKeychainSecretStore,
  } = require("../../electron/security/keychain-secret-store.cjs");

  const { origin, server } = await startServer();
  const reasons = [];

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
    initialUrl: `${origin}/session`,
    partitionContext: partition,
    tabId: "tab-session",
    windowId: "window-session",
  });
  const webContents = surface.view.webContents;
  const ready = waitForLoad(webContents);
  await Promise.all([surface.loadPromise, ready]);
  surfaceManager.activateSurface("window-session", "tab-session");
  surfaceManager.layoutWindow("window-session", hostWindow.getContentBounds());
  hostWindow.showInactive();

  const tempDirectory = fsSync.mkdtempSync(path.join(os.tmpdir(), "auris-session-smoke-"));
  const databasePath = path.join(tempDirectory, "browser-state.db");
  const database = createBrowserStateDatabase(databasePath);
  const capabilities = createBrowserSessionCapabilities();

  await webContents.executeJavaScript(`localStorage.setItem("probe","session-secret-value")`);
  await partition.session.cookies.set({
    url: origin,
    name: "sid",
    value: "session-secret-cookie",
    path: "/",
    httpOnly: true,
    secure: false,
    sameSite: "lax",
  });

  const secretStore = createKeychainSecretStore({ safeStorage });
  const service = createBrowserSessionService({
    capabilities,
    database,
    getCookies: async ({ partitionSession, url }) => partitionSession.cookies.get({ url }),
    removeCookie: async () => undefined,
    runIsolatedStorageScript: async ({ args, source }) => runIsolatedStorageScript({
      args,
      source,
      webContents,
    }),
    secretStore,
    setCookie: async ({ cookie, partitionSession }) => partitionSession.cookies.set(cookie),
  });

  try {
    await service.save({
      committedOrigin: origin,
      name: "probe",
      partitionSession: partition.session,
      runContext: {},
    });
    reasons.push("save unexpectedly succeeded while capabilities were false");
  } catch (error) {
    if (error?.code !== "CAPABILITY_NOT_VERIFIED") {
      reasons.push(`unexpected gated save error: ${error?.code || error}`);
    }
  }

  capabilities.markVerified({ cookieReplay: true, namedProfiles: true });
  try {
    const cookieSummary = await service.save({
      committedOrigin: origin,
      name: "cookie-probe",
      partitionSession: partition.session,
      runContext: {},
    });
    if (cookieSummary.cookieCount < 1) {
      reasons.push("cookie probe captured zero cookies");
      capabilities.markVerified({ cookieReplay: false });
    }
  } catch (error) {
    capabilities.markVerified({ cookieReplay: false });
    reasons.push(`cookie probe failed: ${error?.code || error}`);
  }

  capabilities.markVerified({ localStorageReplay: true, namedProfiles: true });
  try {
    const storageSummary = await service.save({
      committedOrigin: origin,
      name: "storage-probe",
      partitionSession: partition.session,
      runContext: {},
    });
    if (storageSummary.localStorageItemCount < 1) {
      reasons.push("localStorage probe captured zero items");
      capabilities.markVerified({ localStorageReplay: false });
    }
  } catch (error) {
    capabilities.markVerified({ localStorageReplay: false });
    reasons.push(`localStorage probe failed: ${error?.code || error}`);
  }

  await partition.session.clearStorageData();
  await webContents.executeJavaScript("localStorage.clear()");
  const reloadReady = waitForLoad(webContents);
  await Promise.all([webContents.loadURL(`${origin}/session`), reloadReady]);

  try {
    await service.load({
      committedOrigin: origin,
      name: "storage-probe",
      partitionSession: partition.session,
      runContext: {},
      tabId: "tab-session",
      windowId: "window-session",
    });
    const restoredStorage = await webContents.executeJavaScript(
      `localStorage.getItem("probe")`,
    );
    if (restoredStorage !== "session-secret-value") {
      reasons.push("localStorage replay did not restore the probe value");
      capabilities.markVerified({ localStorageReplay: false });
    }
    const restoredCookies = await partition.session.cookies.get({ url: origin });
    const sid = restoredCookies.find((cookie) => cookie.name === "sid");
    if (!sid || sid.value !== "session-secret-cookie") {
      reasons.push("cookie replay did not restore the probe cookie");
      capabilities.markVerified({ cookieReplay: false });
    } else if (sid.httpOnly !== true) {
      reasons.push("cookie replay weakened HttpOnly");
      capabilities.markVerified({ cookieReplay: false });
    }
  } catch (error) {
    reasons.push(`replay probe failed: ${error?.code || error}`);
    capabilities.markVerified({ cookieReplay: false, localStorageReplay: false });
  }

  database.close();
  const reopened = createBrowserStateDatabase(databasePath);
  const durable = createBrowserSessionService({
    capabilities,
    database: reopened,
    getCookies: async ({ partitionSession, url }) => partitionSession.cookies.get({ url }),
    removeCookie: async () => undefined,
    runIsolatedStorageScript: async ({ args, source }) => runIsolatedStorageScript({
      args,
      source,
      webContents,
    }),
    secretStore,
    setCookie: async ({ cookie, partitionSession }) => partitionSession.cookies.set(cookie),
  });
  if (!durable.exists("storage-probe")) {
    reasons.push("named profile did not survive database reopen");
    capabilities.markVerified({ namedProfiles: false });
  } else {
    capabilities.markVerified({ namedProfiles: true });
  }

  const humanPartition = session.fromPartition("persist:auris-browser-human-smoke");
  const humanCookies = await humanPartition.cookies.get({ url: origin });
  if (humanCookies.some((cookie) => cookie.name === "sid")) {
    reasons.push("AiSandbox session cookie leaked into Human partition");
    capabilities.markVerified({ cookieReplay: false });
  }

  const snapshot = capabilities.snapshot();
  const ciphertext = durable.readCiphertextOnly("storage-probe");
  if (ciphertext && ciphertext.toString("utf8").includes("session-secret")) {
    reasons.push("plaintext secret persisted beside ciphertext");
    capabilities.markVerified({ namedProfiles: false });
  }

  surfaceManager.destroySurface("window-session", "tab-session");
  hostWindow.destroy();
  reopened.close();
  await closeServer(server);
  fsSync.rmSync(tempDirectory, { force: true, recursive: true });

  if (reasons.length > 0 || !snapshot.cookieReplay || !snapshot.localStorageReplay || !snapshot.namedProfiles) {
    console.error("browser-session: capability gates remain false");
    console.error(JSON.stringify({ reasons, snapshot }, null, 2));
    app.exit(1);
    return;
  }

  console.log("browser-session: ok");
  console.log(JSON.stringify({ partition: AI_SANDBOX_PARTITION, snapshot }, null, 2));
  app.exit(0);
}

app.whenReady().then(() => run().catch((error) => {
  console.error(error);
  app.exit(1);
}));
