import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createBrowserRegistry } = require("../../electron/browser/browser-registry.cjs");
const { createBrowserCommandDispatcher } = require(
  "../../electron/browser/browser-command-dispatcher.cjs",
);
const { createBrowserApprovalManager, hashBrowserApprovalPayload } = require(
  "../../electron/browser/browser-approvals.cjs",
);
const { createBrowserLeaseManager } = require("../../electron/browser/browser-lease.cjs");
const { createBrowserGrantManager } = require("../../electron/browser/browser-grants.cjs");
const { createBrowserPartitionSelector } = require(
  "../../electron/browser/browser-partitions.cjs",
);
const { createBrowserNavigationPolicy } = require(
  "../../electron/browser/browser-navigation-policy.cjs",
);
const { createBrowserCapabilities } = require(
  "../../electron/browser/browser-capabilities.cjs",
);
const { createBrowserSecurityGates } = require(
  "../../electron/browser/browser-security-gates.cjs",
);
const { createBrowserSessionCapabilities } = require(
  "../../electron/browser/browser-session-capabilities.cjs",
);
const { createBrowserAuditLog } = require("../../electron/browser/browser-audit.cjs");
const { createBrowserStateDatabase } = require("../../electron/browser/browser-state-db.cjs");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SECRET_SCAN = /leaseToken|user:pass|access_token|hunter2|Bearer |keychainPlaintext/iu;

function createAdversarialFixture({
  automationMode = "AiSandbox",
  capabilities = createBrowserCapabilities(),
  sessionService = null,
  sessionCapabilities = null,
} = {}) {
  const registry = createBrowserRegistry();
  const leases = createBrowserLeaseManager();
  const grants = createBrowserGrantManager();
  const approvals = createBrowserApprovalManager({ grants });
  const executor = {
    execute: vi.fn(async ({ request }: { request: { action: string } }) => ({
      action: request.action,
      ok: true,
    })),
  };
  const aiSandboxSession = {
    setPermissionCheckHandler: vi.fn(),
    setPermissionRequestHandler: vi.fn(),
  };
  const pagePolicyAttach = vi.fn(() => vi.fn());
  const partitionSelector = createBrowserPartitionSelector({
    createPagePolicy: () => ({ attach: pagePolicyAttach }),
    getSession: () => aiSandboxSession,
  });

  async function createAiSandboxTarget({ url }: { url: string }) {
    const window = registry.createWindow();
    const tab = registry.createTab(window.windowId, {
      automationMode,
      title: "Probe",
      url,
    });
    const partition = partitionSelector.select(automationMode);
    const webContents = {
      getURL: () => "",
      session: aiSandboxSession,
    };
    partition.attachPagePolicy(webContents);
    webContents.getURL = () => url;
    registry.commitNavigation(window.windowId, tab.tabId, { url });
    registry.setTabLifecycle(window.windowId, tab.tabId, "ready");
    return {
      automationMode,
      partition: partition.partition,
      tabId: tab.tabId,
      webContents,
      windowId: window.windowId,
    };
  }

  const dispatcher = createBrowserCommandDispatcher({
    approvals,
    capabilities,
    createAiSandboxTarget,
    destroyTarget: async () => true,
    executor,
    grants,
    leases,
    navigationPolicy: createBrowserNavigationPolicy({
      allowLoopback: true,
      resolveDns: async () => ["93.184.216.34"],
    }),
    partitionSelector,
    registry,
    sessionCapabilities,
    sessionService,
  });

  async function dispatch(connectionId: string, params: Record<string, unknown>) {
    return dispatcher.dispatch({
      connectionId,
      method: "browser.mcp.action",
      params: { actionTimeoutMs: 12_000, ...params },
      signal: new AbortController().signal,
    });
  }

  async function open(connectionId = "connection-adversarial") {
    const opened = await dispatch(connectionId, {
      request: { action: "open", url: "https://example.com/start" },
    });
    return { connectionId, control: opened.control, opened, target: opened.target };
  }

  async function approveOnce(
    connectionId: string,
    control: Record<string, unknown>,
    request: Record<string, unknown>,
  ) {
    const first = await dispatch(connectionId, { control, request }).catch((error) => error);
    expect(first).toMatchObject({ code: "APPROVAL_REQUIRED" });
    const approvalId = first.metadata.approvalId as string;
    approvals.resolve({
      approvalId,
      decision: "allow_once",
      windowId: control.windowId as string,
    });
    return dispatch(connectionId, { approvalId, control, request });
  }

  return {
    approvals,
    capabilities,
    dispatch,
    executor,
    grants,
    leases,
    open,
    approveOnce,
    registry,
    dispatcher,
  };
}

describe("browser authority adversarial matrix", () => {
  it("rejects approval payload substitution and concurrent double-consume", async () => {
    const fixture = createAdversarialFixture();
    const { connectionId, control } = await fixture.open();
    const request = {
      action: "act",
      target: { kind: "selector", selector: "#go" },
      variant: "click",
    };
    const first = await fixture.dispatch(connectionId, { control, request }).catch((e) => e);
    expect(first).toMatchObject({ code: "APPROVAL_REQUIRED" });
    const approvalId = first.metadata.approvalId as string;
    fixture.approvals.resolve({
      approvalId,
      decision: "allow_once",
      windowId: control.windowId,
    });

    const [a, b] = await Promise.all([
      fixture.dispatch(connectionId, { approvalId, control, request }).catch((e) => e),
      fixture.dispatch(connectionId, { approvalId, control, request }).catch((e) => e),
    ]);
    const codes = [a, b].map((result) => result?.code ?? null);
    expect(codes.filter((code) => code == null)).toHaveLength(1);
    expect(codes.filter((code) => code === "APPROVAL_EXPIRED" || code === "APPROVAL_DENIED" || code === "CAPABILITY_NOT_VERIFIED")).toHaveLength(1);

    await expect(fixture.dispatch(connectionId, {
      approvalId,
      control,
      request: {
        ...request,
        target: { kind: "selector", selector: "#other" },
      },
    })).rejects.toMatchObject({ code: expect.stringMatching(/APPROVAL|CAPABILITY/) });
  });

  it("rejects replay after navigation, release, reclaim, and closed-tab reuse", async () => {
    const fixture = createAdversarialFixture();
    const { connectionId, control, target } = await fixture.open();

    await fixture.approveOnce(connectionId, control, {
      action: "navigate",
      url: "https://example.com/next",
    });
    fixture.dispatcher.navigationChanged(
      target.windowId,
      target.tabId,
      control.navigationGeneration + 1,
      control.controlEpoch,
    );
    await expect(fixture.dispatch(connectionId, {
      control,
      request: { action: "read" },
    })).rejects.toMatchObject({ code: "LEASE_LOST" });

    const second = await fixture.open("connection-release");
    await fixture.dispatch(second.connectionId, {
      control: second.control,
      request: { action: "release_control" },
    });
    await expect(fixture.dispatch(second.connectionId, {
      control: second.control,
      request: { action: "read" },
    })).rejects.toMatchObject({ code: "LEASE_LOST" });

    const third = await fixture.open("connection-reclaim");
    fixture.dispatcher.humanReclaim(third.target.windowId, third.target.tabId, {
      reason: "trusted-input",
    });
    await expect(fixture.dispatch(third.connectionId, {
      control: third.control,
      request: { action: "read" },
    })).rejects.toMatchObject({ code: "LEASE_LOST" });

    const fourth = await fixture.open("connection-close");
    fixture.registry.closeTab(fourth.target.windowId, fourth.target.tabId);
    fixture.dispatcher.tabClosed?.(fourth.target.windowId, fourth.target.tabId);
    await expect(fixture.dispatch(fourth.connectionId, {
      control: fourth.control,
      request: { action: "read" },
    })).rejects.toMatchObject({
      code: expect.stringMatching(/TAB_NOT_FOUND|LEASE_LOST|WINDOW_NOT_FOUND/),
    });
  });

  it("rejects wrong owner/tab/origin/op bindings and private AI navigation", async () => {
    const fixture = createAdversarialFixture();
    const { connectionId, control } = await fixture.open();
    const request = {
      action: "act",
      text: "hello",
      target: { kind: "selector", selector: "#topic" },
      variant: "type",
    };
    const first = await fixture.dispatch(connectionId, { control, request }).catch((e) => e);
    const approvalId = first.metadata.approvalId as string;
    fixture.approvals.resolve({
      approvalId,
      decision: "allow_once",
      windowId: control.windowId,
    });

    await expect(fixture.dispatch("connection-other", {
      approvalId,
      control,
      request,
    })).rejects.toMatchObject({
      code: expect.stringMatching(/LEASE_LOST|APPROVAL|OWNER_MISMATCH/),
    });

    await expect(fixture.dispatch(connectionId, {
      approvalId,
      control: { ...control, tabId: "browser-tab-999" },
      request,
    })).rejects.toMatchObject({
      code: expect.stringMatching(/TAB_NOT_FOUND|LEASE_LOST|APPROVAL|OWNER_MISMATCH/),
    });

    await expect(fixture.dispatch(connectionId, {
      control,
      request: { action: "navigate", url: "http://169.254.169.254/latest/meta-data/" },
    })).rejects.toMatchObject({ code: "CAPABILITY_NOT_VERIFIED" });
  });

  it("hard-denies execute_js exfiltration on Human/AiShared/session-injected and allows exact AiSandbox eval", async () => {
    for (const mode of ["Human", "AiShared"] as const) {
      const fixture = createAdversarialFixture({ automationMode: mode });
      // open always forces AiSandbox in dispatcher; create a mode tab manually.
      const window = fixture.registry.createWindow();
      const tab = fixture.registry.createTab(window.windowId, {
        automationMode: mode,
        title: mode,
        url: "https://example.com",
      });
      fixture.registry.setTabLifecycle(window.windowId, tab.tabId, "ready");
      const control = fixture.leases.acquire({
        connectionId: `connection-${mode}`,
        controlEpoch: tab.controlEpoch,
        navigationGeneration: tab.navigationGeneration,
        tabId: tab.tabId,
        windowId: window.windowId,
      });
      await expect(fixture.dispatch(`connection-${mode}`, {
        control,
        request: {
          action: "execute_js",
          source: "document.cookie || localStorage.getItem('x') || ({}).constructor.constructor('return this')()",
        },
      })).rejects.toMatchObject({
        code: "CAPABILITY_NOT_VERIFIED",
        metadata: expect.objectContaining({ capability: "execute_js-mode" }),
      });
    }

    const sessionCapabilities = createBrowserSessionCapabilities({
      cookieReplay: true,
      localStorageReplay: true,
      namedProfiles: true,
    });
    let injected = false;
    const sessionService = {
      isSessionInjected: () => injected,
      load: async () => {
        injected = true;
        return { loaded: true, name: "research" };
      },
      save: async () => ({
        cookieCount: 1,
        localStorageItemCount: 1,
        name: "research",
        originCount: 1,
      }),
      clearTabSessionInjected: () => {
        injected = false;
      },
    };
    const injectedFixture = createAdversarialFixture({
      sessionCapabilities,
      sessionService,
    });
    const opened = await injectedFixture.open("connection-session");
    injected = true;
    await expect(injectedFixture.dispatch(opened.connectionId, {
      control: opened.control,
      request: { action: "execute_js", source: "document.cookie" },
    })).rejects.toMatchObject({
      metadata: expect.objectContaining({ capability: "execute_js-session-injected" }),
    });

    const sandbox = createAdversarialFixture();
    const { connectionId, control } = await sandbox.open("connection-eval");
    expect(sandbox.capabilities.snapshot().eval).toEqual(expect.objectContaining({
      enabled: true,
      scope: "ai-sandbox-nonpersistent-no-session",
    }));
    await sandbox.approveOnce(connectionId, control, {
      action: "execute_js",
      source: "1+1",
    });
    expect(sandbox.executor.execute).toHaveBeenCalled();
  });

  it("keeps incomplete security gates from enabling production open/automation and never audits secrets", async () => {
    const gates = createBrowserSecurityGates({
      adversarial: false,
      audit: true,
      crash: true,
      dialog: true,
      mode: true,
      reclaim: true,
      session: true,
      ux: true,
    });
    const capabilities = createBrowserCapabilities({
      getAutomationEnabled: () => true,
      securityGates: gates,
    });
    expect(capabilities.snapshot()).toMatchObject({
      automationToggleAvailable: false,
      production: false,
      securityVerified: false,
    });
    expect(() => capabilities.assertOpenAllowed()).toThrow(
      expect.objectContaining({ code: "CAPABILITY_NOT_VERIFIED" }),
    );
    expect(() => capabilities.assertAutomationAllowed()).toThrow(
      expect.objectContaining({ code: "CAPABILITY_NOT_VERIFIED" }),
    );

    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "auris-adv-audit-"));
    const database = createBrowserStateDatabase(path.join(tempDirectory, "state.db"));
    const audit = createBrowserAuditLog({ database, maxRows: 8 });
    audit.appendFromAuthorizeDecision({
      kind: "denied",
      error: { code: "LEASE_LOST" },
      operation: "type",
      origin: "https://example.com",
      lease: {
        leaseToken: "secret-lease-token",
        tabId: "browser-tab-1",
        windowId: "browser-window-1",
      },
      request: { action: "type", text: "hunter2" },
    }, {
      command: {
        control: {
          leaseToken: "secret-lease-token",
          tabId: "browser-tab-1",
          windowId: "browser-window-1",
        },
        request: { action: "type", text: "hunter2" },
      },
      context: {
        connectionId: "connection-secret",
        keychainPlaintext: "cookie=secret",
      },
    });
    expect(JSON.stringify(audit.listRecent())).not.toMatch(SECRET_SCAN);
    database.close();
    fs.rmSync(tempDirectory, { force: true, recursive: true });

    // Keep the payload-hash helper honest for binding probes.
    expect(hashBrowserApprovalPayload({
      action: "act",
      variant: "click",
      target: { kind: "selector", selector: "#a" },
    })).not.toEqual(hashBrowserApprovalPayload({
      action: "act",
      variant: "click",
      target: { kind: "selector", selector: "#b" },
    }));
  });

  it("rejects ambiguous multi-tab identity without an explicit target", async () => {
    const fixture = createAdversarialFixture();
    const first = await fixture.open("connection-a");
    await fixture.open("connection-b");
    const state = await fixture.dispatch("connection-a", {
      request: { action: "get_state" },
    });
    expect(state.targets.length).toBeGreaterThanOrEqual(2);
    expect(state.targets.every((target: { tabId: string; windowId: string }) => (
      typeof target.tabId === "string" && typeof target.windowId === "string"
    ))).toBe(true);
    await expect(fixture.dispatch("connection-a", {
      control: {
        ...first.control,
        tabId: "",
      },
      request: { action: "read" },
    })).rejects.toMatchObject({ code: expect.stringMatching(/LEASE_LOST|CAPABILITY|TAB/) });
  });
});
