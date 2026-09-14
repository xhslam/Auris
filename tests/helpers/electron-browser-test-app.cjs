"use strict";
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Explicit Electron composition for Phase 3 MCP browser research-loop tests.
 * Never import this module from production bootstrap (`electron/main.cjs`).
 */

const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fsSync = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const CHILD_MARKER = "--auris-mcp-browser-test-app";
const FIXTURE_PATH = path.join(__dirname, "..", "fixtures", "browser", "research-form.html");
const PRELOAD_PATH = path.join(__dirname, "electron-browser-test-app-preload.cjs");
const INITIAL_NOTE_SOURCE = "# Original";
// Must match createNotesMcpRevision("# Original") from notes-mcp-contract.ts.
const INITIAL_NOTE_REVISION =
  "sha256-1223fcefccd1ce246319f7fe60ab6b0f4361c1153848813948bb83da30d32c0f";

function writeLine(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

function startFixtureServer(html, allowedOriginHolder) {
  const server = http.createServer((request, response) => {
    const host = request.headers.host || "127.0.0.1";
    const url = new URL(request.url || "/", `http://${host}`);
    if (url.pathname !== "/" && url.pathname !== "/research-form.html") {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
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
        reject(new Error("Fixture server did not expose a TCP port."));
        return;
      }
      const origin = `http://127.0.0.1:${address.port}`;
      allowedOriginHolder.origin = origin;
      resolve({ origin, server });
    });
  });
}

function startControlServer(handlers) {
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/health") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true }));
        return;
      }
      if (request.method === "GET" && url.pathname === "/approvals") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(handlers.snapshotApprovals()));
        return;
      }
      if (request.method === "POST" && url.pathname === "/approvals/resolve") {
        const body = await readJsonBody(request);
        const result = handlers.resolveApproval(body);
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(result));
        return;
      }
      if (request.method === "GET" && url.pathname === "/pending-notes") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(handlers.listPendingNotes()));
        return;
      }
      if (request.method === "POST" && url.pathname === "/shutdown") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true }));
        setImmediate(() => handlers.shutdown());
        return;
      }
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not_found" }));
    } catch (error) {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Control server did not expose a TCP port."));
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        server,
      });
    });
  });
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}

async function runElectronChild() {
  const {
    app,
    BrowserWindow,
    WebContentsView,
    ipcMain,
    session,
  } = require("electron");
  const { createBrowserRegistry } = require("../../electron/browser/browser-registry.cjs");
  const { createBrowserLeaseManager } = require("../../electron/browser/browser-lease.cjs");
  const { createBrowserApprovalManager } = require("../../electron/browser/browser-approvals.cjs");
  const { createBrowserPartitionSelector } = require("../../electron/browser/browser-partitions.cjs");
  const { createBrowserPagePolicy } = require("../../electron/browser/browser-page-policy.cjs");
  const { createBrowserPageExecutor } = require("../../electron/browser/browser-page-executor.cjs");
  const { createBrowserCommandDispatcher } = require("../../electron/browser/browser-command-dispatcher.cjs");
  const { createBrowserCapabilities } = require("../../electron/browser/browser-capabilities.cjs");
  const { createNotesMcpBridge } = require("../../electron/notes-mcp-bridge.cjs");
  const { normalizeBrowserEvidence } = require("../../electron/browser/browser-evidence.cjs");

  const discoveryPath = process.env.AURIS_TEST_DISCOVERY_FILE
    || path.join(os.tmpdir(), `auris-mcp-browser-discovery-${crypto.randomUUID()}.json`);
  const evidenceDirectory = fsSync.mkdtempSync(path.join(os.tmpdir(), "auris-mcp-browser-evidence-"));
  const fixtureHtml = fsSync.readFileSync(FIXTURE_PATH, "utf8");
  const allowedOriginHolder = { origin: "" };
  const surfaces = new Map();
  const pendingNotes = [];
  let noteSource = INITIAL_NOTE_SOURCE;
  let fixtureServer = null;
  let controlServer = null;
  let notesHost = null;
  let bridge = null;
  let executor = null;
  let shuttingDown = false;

  function surfaceKey(windowId, tabId) {
    return `${windowId}\u0000${tabId}`;
  }

  function throwNotesError(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }

  function handleNotesRequest(request) {
    const method = request?.method;
    const params = request?.params && typeof request.params === "object"
      ? request.params
      : {};

    if (method === "notes.mcp.session") {
      return {
        active_tab_id: "Inbox/Daily.md",
        tabs: [{ dirty: false, path: "Inbox/Daily.md" }],
        vault: { configured: true },
      };
    }

    if (method === "notes.mcp.document") {
      if (params.action === "read") {
        return {
          content: noteSource,
          path: "Inbox/Daily.md",
          revision: INITIAL_NOTE_REVISION,
        };
      }
      if (params.action === "write") {
        if (typeof params.content !== "string") {
          throwNotesError("INVALID_PARAMS", "content is required for document write");
        }
        if (!params.expected_revision || params.expected_revision !== INITIAL_NOTE_REVISION) {
          throwNotesError("STALE_REVISION", "Document revision is stale.");
        }
        const evidence = params.evidence
          ? normalizeBrowserEvidence(params.evidence)
          : undefined;
        const pending = Object.freeze({
          afterSource: params.content,
          beforeSource: noteSource,
          createdAt: new Date().toISOString(),
          ...(evidence ? { evidence } : {}),
          expectedRevision: params.expected_revision,
          id: `review-${pendingNotes.length + 1}`,
          kind: "document",
          path: "Inbox/Daily.md",
        });
        pendingNotes.push(pending);
        return {
          pending_review: {
            id: pending.id,
            kind: pending.kind,
            path: pending.path,
          },
        };
      }
    }

    throwNotesError("METHOD_NOT_FOUND", `Unsupported notes method: ${method}`);
  }

  async function createAiSandboxTarget({ partition, signal, url }) {
    if (signal?.aborted) {
      const error = new Error("Cancelled");
      error.code = "CANCELLED";
      throw error;
    }
    if (!allowedOriginHolder.origin || !String(url).startsWith(allowedOriginHolder.origin)) {
      const error = new Error("Fixture origin policy rejected the open URL.");
      error.code = "CAPABILITY_NOT_VERIFIED";
      throw error;
    }

    const windowRecord = registry.createWindow();
    const tab = registry.createTab(windowRecord.windowId, {
      automationMode: "AiSandbox",
      title: "Research",
      url,
    });

    if (!notesHost || notesHost.isDestroyed()) {
      throw new Error("Notes host window is required before creating AiSandbox targets.");
    }

    const view = new WebContentsView({
      webPreferences: { ...partition.webPreferences },
    });
    partition.attachPagePolicy(view.webContents);
    notesHost.contentView.addChildView(view);
    view.setVisible(true);
    view.setBounds({ x: 0, y: 0, width: 1000, height: 700 });

    const loaded = withTimeout(new Promise((resolve, reject) => {
      const onFail = (_event, errorCode, errorDescription) => {
        cleanup();
        reject(new Error(`loadURL failed: ${errorCode} ${errorDescription}`));
      };
      const onFinish = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        view.webContents.removeListener("did-fail-load", onFail);
        view.webContents.removeListener("did-finish-load", onFinish);
      };
      view.webContents.once("did-fail-load", onFail);
      view.webContents.once("did-finish-load", onFinish);
      void view.webContents.loadURL(url);
    }), 20_000, "AiSandbox fixture load");

    await loaded;
    if (signal?.aborted) {
      notesHost.contentView.removeChildView(view);
      view.webContents.close?.();
      registry.closeTab(windowRecord.windowId, tab.tabId);
      const error = new Error("Cancelled");
      error.code = "CANCELLED";
      throw error;
    }

    registry.commitNavigation(windowRecord.windowId, tab.tabId, { url });
    registry.setTabLifecycle(windowRecord.windowId, tab.tabId, "ready");
    surfaces.set(surfaceKey(windowRecord.windowId, tab.tabId), { view, windowId: windowRecord.windowId, tabId: tab.tabId });

    return {
      automationMode: "AiSandbox",
      partition: partition.partition,
      tabId: tab.tabId,
      webContents: view.webContents,
      windowId: windowRecord.windowId,
    };
  }

  async function destroyTarget({ windowId, tabId }) {
    const record = surfaces.get(surfaceKey(windowId, tabId));
    if (!record) return true;
    surfaces.delete(surfaceKey(windowId, tabId));
    try {
      if (notesHost && !notesHost.isDestroyed()) {
        notesHost.contentView.removeChildView(record.view);
      }
      if (!record.view.webContents.isDestroyed()) {
        record.view.webContents.close?.();
      }
    } catch {
      // Native teardown is best-effort after registry close.
    }
    return true;
  }

  const registry = createBrowserRegistry();
  const leases = createBrowserLeaseManager();
  const approvals = createBrowserApprovalManager();

  app.disableHardwareAcceleration();
  await app.whenReady();

  const fixture = await startFixtureServer(fixtureHtml, allowedOriginHolder);
  fixtureServer = fixture.server;

  const partitionSelector = createBrowserPartitionSelector({
    createPagePolicy: () => createBrowserPagePolicy({
      decideNavigation: (candidate) => {
        try {
          const next = new URL(candidate);
          if (next.origin !== allowedOriginHolder.origin) {
            return { allowed: false, reason: "ORIGIN_NOT_ALLOWLISTED" };
          }
          return { allowed: true, url: next.href };
        } catch {
          return { allowed: false, reason: "INVALID_URL" };
        }
      },
    }),
    getSession: (partitionName) => session.fromPartition(partitionName),
  });

  notesHost = new BrowserWindow({
    height: 720,
    paintWhenInitiallyHidden: true,
    show: false,
    title: "Auris MCP Browser Test Notes Host",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: false,
      preload: PRELOAD_PATH,
      sandbox: true,
    },
    width: 1100,
    x: -20_000,
    y: -20_000,
  });
  await notesHost.loadURL("data:text/html,<!doctype html><title>notes-host</title><body>notes-host</body>");
  // capturePage requires a painted surface; keep the host off-screen but visible.
  notesHost.showInactive();

  ipcMain.handle("auris-test-app:notes-mcp:handle", (_event, request) => handleNotesRequest(request));
  ipcMain.handle("shadowing:notes-mcp:resolve-request", (_event, bridgeRequestId, result) => {
    bridge?.resolveRequest(bridgeRequestId, result);
  });
  ipcMain.handle("shadowing:notes-mcp:reject-request", (_event, bridgeRequestId, errorMessage) => {
    bridge?.rejectRequest(bridgeRequestId, errorMessage);
  });

  executor = createBrowserPageExecutor({
    closeTarget: async ({ windowId, tabId }) => {
      registry.closeTab(windowId, tabId);
      await destroyTarget({ windowId, tabId });
      return true;
    },
    evidenceDirectory,
    focusTarget: async ({ windowId, tabId }) => {
      registry.activateTab(windowId, tabId);
      return true;
    },
    getWebContents: ({ windowId, tabId }) => {
      const record = surfaces.get(surfaceKey(windowId, tabId));
      return record?.view?.webContents ?? null;
    },
  });

  const dispatcher = createBrowserCommandDispatcher({
    approvals,
    capabilities: createBrowserCapabilities({
      getAutomationEnabled: () => true,
    }),
    createAiSandboxTarget,
    destroyTarget,
    executor,
    leases,
    partitionSelector,
    registry,
  });

  bridge = createNotesMcpBridge({
    cancelBrowserApprovals: (connectionId) => dispatcher.cancelPendingApprovals(connectionId),
    dispatchBrowserRequest: (request) => dispatcher.dispatch(request),
    getWindow: () => notesHost,
    logger: () => undefined,
    releaseBrowserOwnership: (connectionId) => dispatcher.releaseOwnership(connectionId),
    removeDiscovery: () => {
      try {
        fsSync.rmSync(discoveryPath, { force: true });
      } catch {
        // ignore
      }
    },
    writeDiscovery: (content) => {
      fsSync.writeFileSync(discoveryPath, content, "utf8");
    },
  });
  await bridge.start();

  async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      bridge?.close();
    } catch {
      // ignore
    }
    try {
      await executor?.dispose?.();
    } catch {
      // ignore
    }
    for (const [key, record] of surfaces) {
      surfaces.delete(key);
      try {
        if (notesHost && !notesHost.isDestroyed()) {
          notesHost.contentView.removeChildView(record.view);
        }
        record.view.webContents.close?.();
      } catch {
        // ignore
      }
    }
    try {
      notesHost?.destroy();
    } catch {
      // ignore
    }
    await closeServer(controlServer);
    await closeServer(fixtureServer);
    try {
      fsSync.rmSync(evidenceDirectory, { force: true, recursive: true });
    } catch {
      // ignore
    }
    app.exit(0);
  }

  const control = await startControlServer({
    listPendingNotes: () => pendingNotes,
    resolveApproval: (body) => dispatcher.resolveApproval({
      approvalId: body?.approvalId,
      decision: body?.decision === "deny" ? "deny" : "allow_once",
      windowId: body?.windowId,
    }),
    shutdown,
    snapshotApprovals: () => dispatcher.snapshotApprovals(),
  });
  controlServer = control.server;

  writeLine({
    controlOrigin: control.origin,
    discoveryPath,
    fixtureOrigin: fixture.origin,
    type: "ready",
  });
}

function spawnElectronTestApp({ discoveryPath, env = {}, timeoutMs = 90_000 } = {}) {
  const electronPath = require("electron");
  const nextDiscoveryPath = discoveryPath
    || path.join(os.tmpdir(), `auris-mcp-browser-discovery-${crypto.randomUUID()}.json`);
  const childEnv = {
    ...process.env,
    ...env,
    AURIS_TEST_DISCOVERY_FILE: nextDiscoveryPath,
    ELECTRON_ENABLE_LOGGING: "0",
  };
  // Cursor/agent shells often set this, which makes Electron behave like Node
  // and causes require("electron") to return the binary path string.
  delete childEnv.ELECTRON_RUN_AS_NODE;

  const child = childProcess.spawn(
    electronPath,
    [__filename, CHILD_MARKER],
    {
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let stdout = "";
  let stderr = "";
  let settled = false;
  let ready = null;

  const readyPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error([
        "Electron browser test app timed out before ready.",
        stdout,
        stderr,
      ].filter(Boolean).join("\n")));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      for (const line of stdout.split(/\r?\n/u)) {
        if (!line.startsWith("{")) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed?.type === "ready" && !ready) {
            ready = parsed;
            clearTimeout(timer);
            resolve(parsed);
          }
        } catch {
          // wait for complete JSON line
        }
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      if (ready || settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error([
        `Electron browser test app exited before ready (code=${code}, signal=${signal}).`,
        stdout,
        stderr,
      ].filter(Boolean).join("\n")));
    });
  });

  return {
    child,
    discoveryPath: nextDiscoveryPath,
    ready: readyPromise,
    stderr: () => stderr,
    stdout: () => stdout,
    async stop() {
      try {
        if (ready?.controlOrigin) {
          await fetch(`${ready.controlOrigin}/shutdown`, { method: "POST" }).catch(() => undefined);
        }
      } catch {
        // ignore
      }
      if (!child.killed) {
        child.kill("SIGKILL");
      }
      await new Promise((resolve) => child.once("exit", () => resolve()));
      try {
        fsSync.rmSync(nextDiscoveryPath, { force: true });
      } catch {
        // ignore
      }
    },
  };
}

if (require.main === module || process.argv.includes(CHILD_MARKER)) {
  if (!process.versions.electron) {
    spawnElectronTestApp()
      .ready
      .then((ready) => {
        writeLine(ready);
        return fetch(`${ready.controlOrigin}/shutdown`, { method: "POST" });
      })
      .then(() => undefined)
      .catch((error) => {
        process.stderr.write(`${error?.stack ?? error}\n`);
        process.exitCode = 1;
      });
  } else {
    runElectronChild().catch((error) => {
      process.stderr.write(`${error?.stack ?? error}\n`);
      const { app } = require("electron");
      app.exit(1);
    });
  }
}

module.exports = {
  CHILD_MARKER,
  INITIAL_NOTE_REVISION,
  INITIAL_NOTE_SOURCE,
  spawnElectronTestApp,
};
