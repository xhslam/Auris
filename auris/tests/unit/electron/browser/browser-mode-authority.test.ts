import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  createBrowserApprovalManager,
  hashBrowserApprovalPayload,
} = require("../../../../electron/browser/browser-approvals.cjs");
const { createBrowserGrantManager } = require("../../../../electron/browser/browser-grants.cjs");
const { createBrowserLeaseManager } = require("../../../../electron/browser/browser-lease.cjs");
const {
  createBrowserNavigationPolicy,
} = require("../../../../electron/browser/browser-navigation-policy.cjs");
const {
  createBrowserOperationGuard,
} = require("../../../../electron/browser/browser-operation-guard.cjs");
const { createBrowserRegistry } = require("../../../../electron/browser/browser-registry.cjs");
const {
  HUMAN_PARTITION,
  AI_SANDBOX_PARTITION,
  createBrowserPartitionSelector,
} = require("../../../../electron/browser/browser-partitions.cjs");

function createModeFixture(automationMode: "Human" | "AiSandbox" | "AiShared") {
  const registry = createBrowserRegistry();
  const leases = createBrowserLeaseManager();
  const grants = createBrowserGrantManager({
    randomBytes: () => Buffer.alloc(16, 5),
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
    title: "Mode",
    url: "https://example.com/start",
  });
  registry.setTabLifecycle(window.windowId, tab.tabId, "ready");
  const connectionId = "connection-mode";
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
    control,
    grants,
    registry,
    tab,
    windowId: window.windowId,
  };
}

describe("browser mode authority matrix", () => {
  it("keeps partition mapping immutable across Human / AiSandbox / AiShared", () => {
    const sessions = new Map<string, object>();
    const selector = createBrowserPartitionSelector({
      getSession: (partition: string) => {
        if (!sessions.has(partition)) {
          sessions.set(partition, {
            setPermissionCheckHandler() {},
            setPermissionRequestHandler() {},
          });
        }
        return sessions.get(partition);
      },
    });
    expect(selector.select("Human").partition).toBe(HUMAN_PARTITION);
    expect(selector.select("AiSandbox").partition).toBe(AI_SANDBOX_PARTITION);
    expect(selector.select("AiShared").partition).toBe(HUMAN_PARTITION);
  });

  it("requires Human attachment for AI reads and actions in addition to operation authority", async () => {
    const fixture = createModeFixture("Human");
    await expect(fixture.authorize({
      control: fixture.control,
      request: { action: "read" },
    })).resolves.toMatchObject({
      kind: "denied",
      error: { code: "CAPABILITY_NOT_VERIFIED" },
    });

    const clickRequired = await fixture.authorize({
      control: fixture.control,
      request: {
        action: "act",
        target: { kind: "selector", selector: "#go" },
        variant: "click",
      },
    });
    expect(clickRequired.kind).toBe("approval-required");
    fixture.approvals.resolve({
      approvalId: clickRequired.approval.approvalId,
      decision: "attach_once",
      windowId: fixture.windowId,
    });
    await expect(fixture.authorize({
      approvalId: clickRequired.approval.approvalId,
      control: fixture.control,
      request: {
        action: "act",
        target: { kind: "selector", selector: "#go" },
        variant: "click",
      },
    })).resolves.toMatchObject({ kind: "allowed", operation: "click" });
  });

  it("lets AiSandbox read without attachment while still requiring action grants", async () => {
    const fixture = createModeFixture("AiSandbox");
    await expect(fixture.authorize({
      control: fixture.control,
      request: { action: "read" },
    })).resolves.toMatchObject({ kind: "allowed", operation: "read" });

    await expect(fixture.authorize({
      control: fixture.control,
      request: {
        action: "act",
        target: { kind: "selector", selector: "#go" },
        variant: "click",
      },
    })).resolves.toMatchObject({ kind: "approval-required", operation: "click" });
  });

  it("requires AiShared destination approval unless origin+navigate standing grant applies", async () => {
    const fixture = createModeFixture("AiShared");
    const navigate = { action: "navigate", url: "https://example.com/next" };
    const required = await fixture.authorize({
      control: fixture.control,
      request: navigate,
    });
    expect(required).toMatchObject({ kind: "approval-required", operation: "navigate" });

    fixture.approvals.resolve({
      approvalId: required.approval.approvalId,
      decision: "allow_standing",
      windowId: fixture.windowId,
    });
    await expect(fixture.authorize({
      approvalId: required.approval.approvalId,
      control: fixture.control,
      request: navigate,
    })).resolves.toMatchObject({ kind: "allowed", operation: "navigate" });

    await expect(fixture.authorize({
      control: fixture.control,
      request: { action: "navigate", url: "https://example.com/another" },
    })).resolves.toMatchObject({
      kind: "allowed",
      approvedPayloadHash: hashBrowserApprovalPayload({
        action: "navigate",
        url: "https://example.com/another",
      }),
    });

    await expect(fixture.authorize({
      control: fixture.control,
      request: {
        action: "act",
        target: { kind: "selector", selector: "#go" },
        variant: "click",
      },
    })).resolves.toMatchObject({ kind: "approval-required", operation: "click" });
  });

  it("rejects in-place automationMode relabel on a live tab", () => {
    const registry = createBrowserRegistry();
    const window = registry.createWindow();
    const tab = registry.createTab(window.windowId, {
      automationMode: "Human",
      url: "https://example.com",
    });
    registry.updateTab(window.windowId, tab.tabId, {
      automationMode: "AiSandbox",
      title: "nope",
    } as never);
    expect(registry.getTab(window.windowId, tab.tabId)?.automationMode).toBe("Human");
    expect(registry.getTab(window.windowId, tab.tabId)?.title).toBe("nope");
  });
});
