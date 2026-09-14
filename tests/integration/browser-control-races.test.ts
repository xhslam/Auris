import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createBrowserApprovalManager, hashBrowserApprovalPayload } = require("../../electron/browser/browser-approvals.cjs");
const { createBrowserLeaseManager } = require("../../electron/browser/browser-lease.cjs");
const { createBrowserRegistry } = require("../../electron/browser/browser-registry.cjs");

function binding(windowId: string, tabId: string) {
  return {
    action: "act",
    connectionId: "race-owner",
    controlEpoch: 1,
    navigationGeneration: 0,
    operation: "click",
    origin: "https://example.com",
    owner: { id: "race-owner", kind: "mcp" },
    payloadHash: hashBrowserApprovalPayload({ action: "act", variant: "click", target: { kind: "ref", ref: "button" } }),
    tabId,
    target: { kind: "ref", ref: "button" },
    windowId,
  };
}

describe("browser control races", () => {
  it.each(["close", "navigation", "hibernate", "reclaim"])("invalidates lease and approval exactly once for %s", (race) => {
    let random = 0;
    const leases = createBrowserLeaseManager({ randomBytes: () => Buffer.alloc(32, ++random) });
    const approvals = createBrowserApprovalManager({ randomBytes: () => Buffer.alloc(24, 9) });
    const registry = createBrowserRegistry();
    const windowRecord = registry.createWindow();
    const tab = registry.createTab(windowRecord.windowId);
    leases.acquire({ connectionId: "race-owner", controlEpoch: 0, navigationGeneration: 0, windowId: windowRecord.windowId, tabId: tab.tabId });
    approvals.request(binding(windowRecord.windowId, tab.tabId));
    if (race === "close") {
      approvals.tabClosed(windowRecord.windowId, tab.tabId); leases.tabClosed(windowRecord.windowId, tab.tabId); registry.closeTab(windowRecord.windowId, tab.tabId);
    } else if (race === "navigation") {
      approvals.navigationChanged(windowRecord.windowId, tab.tabId); leases.navigationChanged(windowRecord.windowId, tab.tabId, 1, 1);
    } else {
      const epoch = registry.rotateControlEpoch(windowRecord.windowId, tab.tabId);
      approvals.controlChanged(windowRecord.windowId, tab.tabId); leases.controlChanged(windowRecord.windowId, tab.tabId, epoch);
    }
    expect(leases.snapshot().leases).toHaveLength(0);
    expect(approvals.snapshot().pendingApprovals).toHaveLength(0);
  });

  it("keeps focus authority-free while approval/retry expiry is single-use", () => {
    let now = 1_000;
    const approvals = createBrowserApprovalManager({ now: () => now, randomBytes: () => Buffer.alloc(24, 3), ttlMs: 50 });
    const requested = approvals.request(binding("window-focus", "tab-focus"));
    const before = approvals.snapshot();
    // OS/UI focus has no call into approvals/leases.
    expect(approvals.snapshot()).toEqual(before);
    approvals.resolve({ approvalId: requested.approvalId, decision: "allow_once", windowId: "window-focus" });
    expect(approvals.consume({ approvalId: requested.approvalId, binding: binding("window-focus", "tab-focus") })).toBe(true);
    expect(() => approvals.consume({ approvalId: requested.approvalId, binding: binding("window-focus", "tab-focus") })).toThrowError(expect.objectContaining({ code: "APPROVAL_EXPIRED" }));
    now += 100;
    expect(approvals.snapshot().pendingApprovals).toHaveLength(0);
  });

  it("settles disconnect versus late result with one terminal owner outcome", async () => {
    const controller = new AbortController();
    const outcomes: string[] = [];
    const work = new Promise<string>((resolve) => {
      controller.signal.addEventListener("abort", () => { outcomes.push("cancelled"); resolve("cancelled"); }, { once: true });
      queueMicrotask(() => { if (!controller.signal.aborted) { outcomes.push("completed"); resolve("completed"); } });
    });
    controller.abort("disconnect");
    expect(await work).toBe("cancelled");
    expect(outcomes).toEqual(["cancelled"]);
  });
});
