import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createBrowserStateDatabase } = require(
  "../../../../electron/browser/browser-state-db.cjs",
);
const {
  createBrowserAuditLog,
  hashOpaqueId,
} = require("../../../../electron/browser/browser-audit.cjs");
const { createBrowserRegistry } = require(
  "../../../../electron/browser/browser-registry.cjs",
);
const { createBrowserLeaseManager } = require(
  "../../../../electron/browser/browser-lease.cjs",
);
const { createBrowserOperationGuard } = require(
  "../../../../electron/browser/browser-operation-guard.cjs",
);
const { createBrowserNavigationPolicy } = require(
  "../../../../electron/browser/browser-navigation-policy.cjs",
);

const SECRET_SCAN = /leaseToken|lease_token|keychain|sessionId|payloadHash|typedValue|user:pass|access_token|hunter2|Bearer |Set-Cookie|sha256:/iu;

describe("browser audit", () => {
  let tempDirectory: string | null = null;
  let database: { close?: () => void } | null = null;

  afterEach(async () => {
    database?.close?.();
    database = null;
    if (tempDirectory) await fs.rm(tempDirectory, { force: true, recursive: true });
    tempDirectory = null;
  });

  async function createAudit(maxRows = 8) {
    tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "auris-audit-"));
    const databasePath = path.join(tempDirectory, "browser-state.db");
    database = createBrowserStateDatabase(databasePath);
    return createBrowserAuditLog({
      database,
      maxRows,
      now: () => "2026-07-20T04:00:00.000Z",
    });
  }

  it("stores only allowlisted diagnostics fields", async () => {
    const audit = await createAudit();
    const record = audit.append({
      approvalKind: "allow_once",
      connectionId: "connection-secret-raw",
      decision: "allowed",
      operation: "navigate",
      origin: "https://user:pass@example.com/path?access_token=secret#frag",
      outcome: "ok",
      ownerKind: "mcp",
      runId: "run-private",
      tabId: "browser-tab-1",
      windowId: "browser-window-1",
    });

    expect(record).toEqual({
      approvalKind: "allow_once",
      connectionHash: hashOpaqueId("connection-secret-raw"),
      decision: "allowed",
      operation: "navigate",
      origin: "https://example.com",
      outcome: "ok",
      ownerKind: "mcp",
      recordedAt: "2026-07-20T04:00:00.000Z",
      runHash: hashOpaqueId("run-private"),
      tabId: "browser-tab-1",
      windowId: "browser-window-1",
    });
    expect(record.connectionHash).not.toBe("connection-secret-raw");
    expect(JSON.stringify(audit.listRecent())).not.toMatch(SECRET_SCAN);
  });

  it("rejects secret-bearing fields via strict construction and secret-scanner fixtures", async () => {
    const audit = await createAudit();
    const hostileDecision = {
      approvedPayloadHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      binding: {
        owner: { id: "connection-one", kind: "mcp" },
        payloadHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        tabId: "browser-tab-1",
        windowId: "browser-window-1",
      },
      error: { code: "CAPABILITY_NOT_VERIFIED" },
      kind: "denied",
      lease: {
        leaseToken: "wtGLrl_lease_token_secret",
        tabId: "browser-tab-1",
        windowId: "browser-window-1",
      },
      operation: "type",
      origin: "https://example.com",
      request: {
        action: "type",
        headers: { Authorization: "Bearer super-secret" },
        text: "hunter2",
      },
      tab: {
        url: "https://user:pass@example.com/?access_token=secret",
      },
    };

    audit.appendFromAuthorizeDecision(hostileDecision, {
      command: {
        approvalId: "approval-one",
        control: {
          leaseToken: "must-not-persist",
          tabId: "browser-tab-1",
          windowId: "browser-window-1",
        },
        request: {
          action: "type",
          cookies: "session=abc",
          text: "hunter2",
        },
      },
      context: {
        connectionId: "connection-one",
        keychainPlaintext: "cookie=secret",
        pageExcerpt: "Visible page text with secrets",
        runId: "run-one",
      },
    });

    const serialized = JSON.stringify(audit.listRecent());
    expect(serialized).not.toMatch(SECRET_SCAN);
    expect(serialized).not.toContain("must-not-persist");
    expect(serialized).not.toContain("cookie=secret");
    expect(serialized).not.toContain("Visible page text");
    expect(serialized).not.toContain("Set-Cookie");
    expect(audit.listRecent()[0]).toMatchObject({
      decision: "denied",
      operation: "type",
      origin: "https://example.com",
      outcome: "CAPABILITY_NOT_VERIFIED",
      ownerKind: "mcp",
    });
  });

  it("prunes to maxRows and exposes no restore APIs", async () => {
    const audit = await createAudit(3);
    for (let index = 0; index < 5; index += 1) {
      audit.append({
        connectionId: `connection-${index}`,
        decision: "allowed",
        operation: "read",
        origin: "https://example.com",
        outcome: "ok",
        ownerKind: "mcp",
      });
    }
    expect(audit.count()).toBe(3);
    expect(audit.listRecent({ limit: 10 })).toHaveLength(3);
    expect(Object.keys(audit)).not.toEqual(
      expect.arrayContaining([
        "restore",
        "restoreGrant",
        "loadLease",
        "loadSession",
        "restoreApproval",
      ]),
    );
    expect(typeof (audit as { restore?: unknown }).restore).toBe("undefined");
  });

  it("records denied, approval-required, and allowed decisions from the operation guard", async () => {
    const audit = await createAudit();
    const registry = createBrowserRegistry();
    const leases = createBrowserLeaseManager();
    const window = registry.createWindow();
    const tab = registry.createTab(window.windowId, {
      automationMode: "AiSandbox",
      url: "https://example.com/docs",
    });
    registry.setTabLifecycle(window.windowId, tab.tabId, "ready");
    const control = leases.acquire({
      connectionId: "connection-audit",
      controlEpoch: tab.controlEpoch,
      navigationGeneration: tab.navigationGeneration,
      tabId: tab.tabId,
      windowId: window.windowId,
    });
    const guard = createBrowserOperationGuard({
      audit,
      leases,
      navigationPolicy: createBrowserNavigationPolicy({
        allowLoopback: true,
        resolveDns: async () => ["93.184.216.34"],
      }),
      registry,
    });

    await guard.authorize(
      { request: { action: "get_state" } },
      { connectionId: "connection-audit" },
    );
    await guard.authorize(
      {
        control,
        request: { action: "navigate", url: "https://example.com/next" },
      },
      { connectionId: "connection-audit" },
    );
    await guard.authorize(
      {
        control: { ...control, leaseToken: "forged" },
        request: { action: "read" },
      },
      { connectionId: "connection-audit" },
    );

    const rows = audit.listRecent({ limit: 10 });
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        decision: "allowed",
        operation: "read",
        outcome: "ok",
      }),
      expect.objectContaining({
        decision: "approval-required",
        operation: "navigate",
        origin: "https://example.com",
        outcome: "approval-required",
      }),
      expect.objectContaining({
        decision: "denied",
        operation: "read",
        outcome: "LEASE_LOST",
      }),
    ]));
    expect(JSON.stringify(rows)).not.toMatch(SECRET_SCAN);
    expect(JSON.stringify(rows)).not.toContain("connection-audit");
  });
});
