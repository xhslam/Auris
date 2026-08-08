import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  computeAllowedApprovalDecisions,
  createBrowserGrantManager,
} = require("../../../../electron/browser/browser-grants.cjs");
const {
  createBrowserApprovalManager,
  hashBrowserApprovalPayload,
} = require("../../../../electron/browser/browser-approvals.cjs");
const { createBrowserLeaseManager } = require("../../../../electron/browser/browser-lease.cjs");
const { createBrowserRegistry } = require("../../../../electron/browser/browser-registry.cjs");
const {
  createBrowserOperationGuard,
} = require("../../../../electron/browser/browser-operation-guard.cjs");
const {
  createBrowserNavigationPolicy,
} = require("../../../../electron/browser/browser-navigation-policy.cjs");

function createAuthorityFixture(automationMode: "Human" | "AiSandbox" = "AiSandbox") {
  const registry = createBrowserRegistry();
  const leases = createBrowserLeaseManager();
  const grants = createBrowserGrantManager({
    randomBytes: () => Buffer.alloc(16, 3),
  });
  const approvals = createBrowserApprovalManager({ grants });
  const navigationPolicy = createBrowserNavigationPolicy({
    allowLoopback: true,
    resolveDns: async () => ["93.184.216.34"],
  });
  const guard = createBrowserOperationGuard({
    approvals,
    grants,
    leases,
    navigationPolicy,
    registry,
  });
  const window = registry.createWindow();
  const tab = registry.createTab(window.windowId, {
    automationMode,
    title: "Research",
    url: "https://example.com/start",
  });
  registry.setTabLifecycle(window.windowId, tab.tabId, "ready");
  const connectionId = "connection-grants";
  const control = leases.acquire({
    connectionId,
    controlEpoch: tab.controlEpoch,
    navigationGeneration: tab.navigationGeneration,
    tabId: tab.tabId,
    windowId: window.windowId,
  });
  return {
    approvals,
    authorize: (command: Record<string, unknown>) => guard.authorize(command, {
      connectionId,
      signal: new AbortController().signal,
    }),
    connectionId,
    control,
    grants,
    registry,
    tab,
    windowId: window.windowId,
  };
}

describe("browser grants", () => {
  it("keeps standing grants in memory only, keyed by exact origin+operation", () => {
    const grants = createBrowserGrantManager();
    const created = grants.grantStanding({
      operation: "click",
      origin: "https://example.com",
    });
    expect(created).toMatchObject({
      kind: "standing",
      operation: "click",
      origin: "https://example.com",
    });
    expect(grants.hasStandingGrant("https://example.com", "click")).toBe(true);
    expect(grants.hasStandingGrant("https://example.com", "type")).toBe(false);
    expect(grants.hasStandingGrant("https://evil.example.com", "click")).toBe(false);
    expect(grants.hasStandingGrant("http://example.com", "click")).toBe(false);
    expect(grants.hasStandingGrant("https://example.com:8443", "click")).toBe(false);

    grants.revoke(created.grantId);
    expect(grants.hasStandingGrant("https://example.com", "click")).toBe(false);
    expect(createBrowserGrantManager().snapshot()).toEqual({
      attachments: [],
      standingGrants: [],
    });
  });

  it("rejects standing grants for never-grantable operations", () => {
    const grants = createBrowserGrantManager();
    for (const operation of ["eval", "session", "style", "publish", "attach", "upload"]) {
      try {
        grants.grantStanding({ operation, origin: "https://example.com" });
        expect.unreachable();
      } catch (error) {
        expect(error).toMatchObject({ code: "CAPABILITY_NOT_VERIFIED" });
      }
    }
  });

  it("does not consume standing grants across retries and scopes them to one operation", async () => {
    const fixture = createAuthorityFixture("AiSandbox");
    const request = {
      action: "act",
      target: { kind: "selector", selector: "#go" },
      variant: "click",
    };
    const first = await fixture.authorize({ control: fixture.control, request });
    expect(first.kind).toBe("approval-required");
    fixture.approvals.resolve({
      approvalId: first.approval.approvalId,
      decision: "allow_standing",
      windowId: fixture.windowId,
    });
    expect(fixture.grants.hasStandingGrant("https://example.com", "click")).toBe(true);

    await expect(fixture.authorize({
      approvalId: first.approval.approvalId,
      control: fixture.control,
      request,
    })).resolves.toMatchObject({ kind: "allowed", operation: "click" });

    await expect(fixture.authorize({
      control: fixture.control,
      request,
    })).resolves.toMatchObject({ kind: "allowed", operation: "click" });

    await expect(fixture.authorize({
      control: fixture.control,
      request: {
        action: "act",
        target: { kind: "selector", selector: "#go" },
        text: "x",
        variant: "type",
      },
    })).resolves.toMatchObject({ kind: "approval-required", operation: "type" });

    await expect(fixture.authorize({
      control: fixture.control,
      request: { action: "navigate", url: "https://example.com/next" },
    })).resolves.toMatchObject({ kind: "approval-required", operation: "navigate" });
  });

  it("supports Human attachments once and until-navigation with lifecycle invalidation", () => {
    const grants = createBrowserGrantManager();
    const once = grants.attach({
      mode: "once",
      navigationGeneration: 1,
      tabId: "browser-tab-1",
      windowId: "browser-window-1",
    });
    expect(once).toMatchObject({ kind: "attachment", mode: "once" });
    grants.assertAttachment({
      navigationGeneration: 1,
      tabId: "browser-tab-1",
      windowId: "browser-window-1",
    });
    grants.consumeAttachmentOnce({
      tabId: "browser-tab-1",
      windowId: "browser-window-1",
    });
    try {
      grants.assertAttachment({
        navigationGeneration: 1,
        tabId: "browser-tab-1",
        windowId: "browser-window-1",
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ code: "CAPABILITY_NOT_VERIFIED" });
    }

    const until = grants.attach({
      mode: "until-navigation",
      navigationGeneration: 4,
      tabId: "browser-tab-2",
      windowId: "browser-window-1",
    });
    grants.assertAttachment({
      navigationGeneration: 4,
      tabId: "browser-tab-2",
      windowId: "browser-window-1",
    });
    grants.navigationChanged("browser-window-1", "browser-tab-2");
    try {
      grants.assertAttachment({
        navigationGeneration: 5,
        tabId: "browser-tab-2",
        windowId: "browser-window-1",
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ code: "CAPABILITY_NOT_VERIFIED" });
    }

    grants.attach({
      mode: "until-navigation",
      navigationGeneration: 1,
      tabId: "browser-tab-3",
      windowId: "browser-window-1",
    });
    grants.controlChanged("browser-window-1", "browser-tab-3");
    expect(grants.getAttachment("browser-window-1", "browser-tab-3")).toBeNull();

    grants.attach({
      mode: "once",
      navigationGeneration: 1,
      tabId: "browser-tab-4",
      windowId: "browser-window-1",
    });
    grants.tabClosed("browser-window-1", "browser-tab-4");
    expect(grants.getAttachment("browser-window-1", "browser-tab-4")).toBeNull();

    const revocable = grants.attach({
      mode: "once",
      navigationGeneration: 1,
      tabId: "browser-tab-5",
      windowId: "browser-window-1",
    });
    expect(until.grantId).toMatch(/^attach-/u);
    grants.revoke(revocable.grantId);
    expect(grants.getAttachment("browser-window-1", "browser-tab-5")).toBeNull();
    expect(createBrowserGrantManager().snapshot().attachments).toEqual([]);
  });

  it("offers Human attachment decisions, does not consume attachment on deny, and consumes once on allow", async () => {
    const fixture = createAuthorityFixture("Human");
    const request = {
      action: "act",
      target: { kind: "selector", selector: "#go" },
      variant: "click",
    };
    const required = await fixture.authorize({ control: fixture.control, request });
    expect(required).toMatchObject({
      kind: "approval-required",
      approval: {
        descriptor: {
          allowedDecisions: computeAllowedApprovalDecisions({
            automationMode: "Human",
            operation: "click",
          }),
        },
      },
    });
    fixture.approvals.resolve({
      approvalId: required.approval.approvalId,
      decision: "deny",
      windowId: fixture.windowId,
    });
    expect(fixture.grants.getAttachment(fixture.windowId, fixture.tab.tabId)).toBeNull();

    const again = await fixture.authorize({ control: fixture.control, request });
    expect(again.kind).toBe("approval-required");
    fixture.approvals.resolve({
      approvalId: again.approval.approvalId,
      decision: "attach_once",
      windowId: fixture.windowId,
    });
    expect(fixture.grants.getAttachment(fixture.windowId, fixture.tab.tabId)).toMatchObject({
      mode: "once",
    });
    await expect(fixture.authorize({
      approvalId: again.approval.approvalId,
      control: fixture.control,
      request,
    })).resolves.toMatchObject({ kind: "allowed" });
    expect(fixture.grants.getAttachment(fixture.windowId, fixture.tab.tabId)).toBeNull();
  });

  it("lists only safe grant descriptors and never persists authority tokens", () => {
    const grants = createBrowserGrantManager({
      randomBytes: () => Buffer.alloc(16, 7),
    });
    grants.grantStanding({ operation: "navigate", origin: "https://docs.example" });
    grants.attach({
      mode: "until-navigation",
      navigationGeneration: 2,
      tabId: "browser-tab-1",
      windowId: "browser-window-1",
    });
    const snap = grants.snapshot();
    expect(snap.standingGrants).toHaveLength(1);
    expect(snap.attachments).toHaveLength(1);
    expect(JSON.stringify(snap)).not.toMatch(
      /lease|token|payloadHash|sha256|controlEpoch|secret/i,
    );
  });

  it("keeps one-shot consume atomic and unused when standing grants already authorize", async () => {
    const fixture = createAuthorityFixture("AiSandbox");
    fixture.grants.grantStanding({
      operation: "click",
      origin: "https://example.com",
    });
    const request = {
      action: "act",
      target: { kind: "selector", selector: "#go" },
      variant: "click",
    };
    await expect(fixture.authorize({
      control: fixture.control,
      request,
    })).resolves.toMatchObject({
      kind: "allowed",
      approvedPayloadHash: hashBrowserApprovalPayload(request),
    });
    expect(fixture.approvals.snapshot().pendingApprovals).toEqual([]);
  });
});
