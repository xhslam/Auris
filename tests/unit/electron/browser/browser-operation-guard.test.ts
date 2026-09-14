import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
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

function createGuardFixture() {
  const registry = createBrowserRegistry();
  const realLeases = createBrowserLeaseManager();
  let assertCurrentCalls = 0;
  const leases = {
    ...realLeases,
    assertCurrent(...args: unknown[]) {
      assertCurrentCalls += 1;
      return realLeases.assertCurrent(...args);
    },
    get assertCurrentCallCount() {
      return assertCurrentCalls;
    },
  };
  const approvals = createBrowserApprovalManager();
  const navigationPolicy = createBrowserNavigationPolicy({
    allowLoopback: true,
    resolveDns: async () => ["93.184.216.34"],
  });
  const guard = createBrowserOperationGuard({
    approvals,
    leases,
    navigationPolicy,
    registry,
  });
  const window = registry.createWindow();
  const tab = registry.createTab(window.windowId, {
    automationMode: "AiSandbox",
    title: "Research",
    url: "https://example.com/start",
  });
  registry.setTabLifecycle(window.windowId, tab.tabId, "ready");
  const connectionId = "connection-guard";
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
      now: Date.now(),
      signal: new AbortController().signal,
    }),
    control,
    guard,
    leases,
    navigationPolicy,
    registry,
    tab,
    windowId: window.windowId,
  };
}

describe("browser operation guard", () => {
  it("validates structure before lease lookup and returns a closed authorize union", async () => {
    const fixture = createGuardFixture();

    await expect(fixture.authorize({
      request: { action: "not-a-real-action" },
    })).resolves.toMatchObject({
      kind: "denied",
      error: { code: "CAPABILITY_NOT_VERIFIED" },
    });
    expect(fixture.leases.assertCurrentCallCount).toBe(0);

    await expect(fixture.authorize({
      control: fixture.control,
      request: { action: "read" },
    })).resolves.toMatchObject({
      kind: "allowed",
      operation: "read",
    });
    // Initial lease check + final TOCTOU revalidation.
    expect(fixture.leases.assertCurrentCallCount).toBe(2);
  });

  it("rejects caller-supplied authorityOperation mismatches", async () => {
    const fixture = createGuardFixture();
    await expect(fixture.authorize({
      authorityOperation: "click",
      control: fixture.control,
      request: { action: "read" },
    })).resolves.toMatchObject({
      kind: "denied",
      error: { code: "CAPABILITY_NOT_VERIFIED" },
    });
  });

  it("requires exact one-shot approval for mutate operations and consumes the exact binding", async () => {
    const fixture = createGuardFixture();
    const request = {
      action: "act",
      target: { kind: "selector", selector: "#go" },
      variant: "click",
    };
    const first = await fixture.authorize({
      control: fixture.control,
      request,
    });
    expect(first).toMatchObject({
      kind: "approval-required",
      operation: "click",
      approval: { approvalId: expect.any(String) },
    });

    const approvalId = first.approval.approvalId as string;
    fixture.approvals.resolve({
      approvalId,
      decision: "allow_once",
      windowId: fixture.windowId,
    });
    const second = await fixture.authorize({
      approvalId,
      control: fixture.control,
      request,
    });
    expect(second).toMatchObject({
      kind: "allowed",
      operation: "click",
      approvedPayloadHash: hashBrowserApprovalPayload(request),
    });
  });

  it("fails closed on owner, target, and payload substitution", async () => {
    const fixture = createGuardFixture();
    const request = {
      action: "act",
      target: { kind: "selector", selector: "#go" },
      text: "secret",
      variant: "type",
    };
    const first = await fixture.authorize({ control: fixture.control, request });
    expect(first.kind).toBe("approval-required");
    const approvalId = first.approval.approvalId as string;
    fixture.approvals.resolve({
      approvalId,
      decision: "allow_once",
      windowId: fixture.windowId,
    });

    await expect(fixture.authorize({
      approvalId,
      control: fixture.control,
      request: { ...request, text: "mutated" },
    })).resolves.toMatchObject({
      kind: "denied",
      error: { code: expect.stringMatching(/APPROVAL|LEASE|CAPABILITY|PAYLOAD/) },
    });

    await expect(fixture.authorize({
      control: {
        ...fixture.control,
        leaseToken: "wtGLrlrnd42ZI0h2LCcFioNjsWBmSPuLvfm-bn6ebqQ",
      },
      request: { action: "read" },
    })).resolves.toMatchObject({
      kind: "denied",
      error: { code: "LEASE_LOST" },
    });
  });

  it("revalidates generation/control immediately before allowing execution after waits", async () => {
    const fixture = createGuardFixture();
    const allowed = await fixture.authorize({
      control: fixture.control,
      request: { action: "read" },
    });
    expect(allowed.kind).toBe("allowed");

    fixture.registry.commitNavigation(fixture.windowId, fixture.tab.tabId, {
      url: "https://example.com/next",
    });
    fixture.leases.navigationChanged(
      fixture.windowId,
      fixture.tab.tabId,
      fixture.tab.navigationGeneration + 1,
    );

    await expect(fixture.authorize({
      control: fixture.control,
      request: { action: "read" },
    })).resolves.toMatchObject({
      kind: "denied",
      error: { code: expect.stringMatching(/STALE|LEASE|CONTROL/) },
    });
  });

  it("binds workflow API approval to destination, method body, and fresh control", async () => {
    const fixture = createGuardFixture();
    const request = {
      bodyHash: `sha256:${"a".repeat(64)}`,
      control: fixture.control,
      destination: "https://api.example.com/publish",
      method: "POST",
      operation: "publish",
    };
    const first = await fixture.guard.authorizeWorkflowApi(request, {
      connectionId: "connection-guard",
      signal: new AbortController().signal,
    });
    expect(first).toMatchObject({ kind: "approval-required", approval: { approvalId: expect.any(String) } });
    const approvalId = first.approval.approvalId as string;
    fixture.approvals.resolve({ approvalId, decision: "allow_once", windowId: fixture.windowId });
    await expect(fixture.guard.authorizeWorkflowApi({ ...request, approvalId }, {
      connectionId: "connection-guard",
    })).resolves.toMatchObject({ kind: "allowed", operation: "publish" });
    await expect(fixture.guard.authorizeWorkflowApi({ ...request, approvalId }, {
      connectionId: "connection-guard",
    })).resolves.toMatchObject({ kind: "denied", error: { code: "APPROVAL_EXPIRED" } });

    const changed = await fixture.guard.authorizeWorkflowApi({
      ...request,
      bodyHash: `sha256:${"b".repeat(64)}`,
    }, { connectionId: "connection-guard" });
    expect(changed).toMatchObject({ kind: "approval-required" });
  });
});
