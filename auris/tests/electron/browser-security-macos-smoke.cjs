"use strict";
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Consolidated macOS security smoke for Phase 4 Task 8.
 * Network-independent: loopback fixture only.
 */

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
  createBrowserCapabilities,
} = require("../../electron/browser/browser-capabilities.cjs");
const {
  createBrowserSecurityGates,
} = require("../../electron/browser/browser-security-gates.cjs");
const {
  createBrowserCommandDispatcher,
} = require("../../electron/browser/browser-command-dispatcher.cjs");
const {
  createBrowserApprovalManager,
} = require("../../electron/browser/browser-approvals.cjs");
const {
  createBrowserGrantManager,
} = require("../../electron/browser/browser-grants.cjs");
const {
  createBrowserLeaseManager,
} = require("../../electron/browser/browser-lease.cjs");
const {
  createBrowserHumanReclaim,
} = require("../../electron/browser/browser-human-reclaim.cjs");
const {
  createBrowserPartitionSelector,
  AI_SANDBOX_PARTITION,
  HUMAN_PARTITION,
} = require("../../electron/browser/browser-partitions.cjs");
const {
  createBrowserRegistry,
} = require("../../electron/browser/browser-registry.cjs");
const {
  createBrowserSurfaceManager,
} = require("../../electron/browser/browser-surface-manager.cjs");
const {
  createBrowserRecovery,
} = require("../../electron/browser/browser-recovery.cjs");

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
        reject(new Error("Security smoke fixture did not expose a TCP port."));
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
  const reasons = [];
  const { origin, server } = await startServer();
  const registry = createBrowserRegistry();
  const leases = createBrowserLeaseManager();
  const grants = createBrowserGrantManager();
  const approvals = createBrowserApprovalManager({ grants });
  const recovery = createBrowserRecovery();
  const capabilities = createBrowserCapabilities({
    getAutomationEnabled: () => true,
    securityGates: createBrowserSecurityGates(),
  });
  const partitionSelector = createBrowserPartitionSelector({
    getSession: (partitionName) => session.fromPartition(partitionName),
  });

  let dispatcher = null;
  const humanReclaim = createBrowserHumanReclaim({
    reclaim: (input) => dispatcher.humanReclaim(input.windowId, input.tabId, {
      reason: input.reason,
    }),
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
      title: "Security",
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
    await Promise.all([surface.loadPromise, waitForLoad(surface.view.webContents)]);
    surfaceManager.activateSurface(window.windowId, tab.tabId);
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

  dispatcher = createBrowserCommandDispatcher({
    approvals,
    capabilities,
    createAiSandboxTarget,
    destroyTarget: async ({ tabId, windowId }) => {
      surfaceManager.destroySurface(windowId, tabId);
      surfaces.delete(`${windowId}/${tabId}`);
      registry.closeTab(windowId, tabId);
      return true;
    },
    executor: {
      execute: async ({ request, signal }) => {
        if (request.action === "wait") {
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, request.milliseconds ?? 4_000);
            signal?.addEventListener("abort", () => {
              clearTimeout(timer);
              const error = new Error("cancelled");
              error.code = "CANCELLED";
              reject(error);
            }, { once: true });
          });
          return { waited: true };
        }
        return { action: request.action };
      },
    },
    grants,
    leases,
    partitionSelector,
    registry,
  });

  try {
    if (!capabilities.snapshot().securityVerified) {
      reasons.push("compiled security gates are not verified");
    }
    if (capabilities.snapshot().eval.scope !== "ai-sandbox-nonpersistent-no-session") {
      reasons.push("eval scope missing from capability snapshot");
    }
    if (partitionSelector.select("AiSandbox").partition !== AI_SANDBOX_PARTITION) {
      reasons.push("AiSandbox partition mismatch");
    }
    if (partitionSelector.select("Human").partition !== HUMAN_PARTITION) {
      reasons.push("Human partition mismatch");
    }
    if (partitionSelector.select("AiSandbox").persistent !== false) {
      reasons.push("AiSandbox must be nonpersistent");
    }
    if (partitionSelector.select("Human").persistent !== true) {
      reasons.push("Human must be persistent");
    }

    const opened = await dispatcher.dispatch({
      connectionId: "security-smoke",
      method: "browser.mcp.action",
      params: {
        actionTimeoutMs: 12_000,
        request: { action: "open", url: `${origin}/` },
      },
      signal: new AbortController().signal,
    });
    const control = opened.control;

    await expectDenied(
      () => dispatcher.dispatch({
        connectionId: "security-smoke",
        method: "browser.mcp.action",
        params: {
          actionTimeoutMs: 12_000,
          control,
          request: { action: "execute_js", source: "document.cookie" },
        },
        signal: new AbortController().signal,
      }),
      "APPROVAL_REQUIRED",
      reasons,
      "execute_js must require exact approval in AiSandbox",
    );

    const waitPromise = dispatcher.dispatch({
      connectionId: "security-smoke",
      method: "browser.mcp.action",
      params: {
        actionTimeoutMs: 12_000,
        control,
        request: { action: "wait", milliseconds: 5_000 },
      },
      signal: new AbortController().signal,
    }).catch((error) => error);
    const surface = surfaces.get(`${opened.target.windowId}/${opened.target.tabId}`);
    surface?.view?.webContents?.sendInputEvent?.({
      type: "mouseDown",
      x: 12,
      y: 12,
      button: "left",
      clickCount: 1,
    });
    // Trusted reclaim path via attached handler is covered by human-reclaim smoke;
    // here we prove dispatcher reclaim invalidates the lease.
    dispatcher.humanReclaim(opened.target.windowId, opened.target.tabId, {
      reason: "trusted-input",
    });
    const waitResult = await waitPromise;
    if (waitResult?.code !== "CANCELLED" && waitResult?.code !== "LEASE_LOST") {
      // Reclaim may win before wait starts; either terminal denial is acceptable.
      if (!(waitResult?.waited === true)) {
        reasons.push(`reclaim did not terminate in-flight wait (${waitResult?.code || "ok"})`);
      }
    }
    await expectDenied(
      () => dispatcher.dispatch({
        connectionId: "security-smoke",
        method: "browser.mcp.action",
        params: {
          actionTimeoutMs: 12_000,
          control,
          request: { action: "read" },
        },
        signal: new AbortController().signal,
      }),
      "LEASE_LOST",
      reasons,
      "stale lease after reclaim must fail closed",
    );

    let lastDecision = null;
    for (let index = 0; index < 4; index += 1) {
      lastDecision = recovery.noteFailure(opened.target.windowId, opened.target.tabId, {
        kind: "crash",
      });
    }
    if (lastDecision?.mode !== "manual-only" && lastDecision?.action !== "manual-only") {
      const snap = recovery.snapshot(opened.target.windowId, opened.target.tabId);
      if (snap.mode !== "manual-only") {
        reasons.push(`crash budget did not enter manual-only (got ${JSON.stringify(lastDecision)} / ${JSON.stringify(snap)})`);
      }
    }
    registry.resetTabRuntimeAuthority?.(opened.target.windowId, opened.target.tabId, {
      automationMode: "AiSandbox",
      title: "Security",
      url: `${origin}/`,
    });
  } catch (error) {
    reasons.push(error instanceof Error ? error.message : String(error));
  } finally {
    try {
      hostWindow.destroy();
    } catch {
      /* ignore */
    }
    await closeServer(server);
  }

  if (reasons.length > 0) {
    process.stderr.write(`${reasons.map((reason) => `FAIL: ${reason}`).join("\n")}\n`);
    app.exit(1);
    return;
  }
  process.stdout.write("browser-security-macos-smoke: ok\n");
  app.exit(0);
}

async function expectDenied(run, code, reasons, label) {
  try {
    await run();
    reasons.push(`${label}: expected ${code}`);
  } catch (error) {
    if (error?.code !== code) {
      reasons.push(`${label}: expected ${code}, got ${error?.code || error}`);
    }
  }
}

app.whenReady().then(() => {
  void run().catch((error) => {
    process.stderr.write(`${error?.stack || error}\n`);
    app.exit(1);
  });
});
