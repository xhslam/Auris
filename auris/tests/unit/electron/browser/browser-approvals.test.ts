import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  createBrowserApprovalManager,
  hashBrowserApprovalPayload,
} = require("../../../../electron/browser/browser-approvals.cjs");

type ApprovalLifecycle = {
  cancelConnection(connectionId: string): unknown;
  controlChanged(windowId: string, tabId: string): unknown;
  navigationChanged(windowId: string, tabId: string): unknown;
  tabClosed(windowId: string, tabId: string): unknown;
  windowClosed(windowId: string): unknown;
};

const OPAQUE_TARGET_PATTERN = /^target-[0-9a-f]{24}$/u;

const binding = (overrides: Record<string, unknown> = {}) => ({
  action: "act",
  connectionId: "connection-one",
  controlEpoch: 7,
  navigationGeneration: 3,
  operation: "type",
  origin: "https://example.com",
  owner: { id: "connection-one", kind: "mcp" },
  payloadHash: hashBrowserApprovalPayload({
    action: "act",
    target: { kind: "ref", ref: "ref-email" },
    text: "private typed value",
    variant: "type",
  }),
  tabId: "browser-tab-1",
  target: { kind: "ref", ref: "ref-email" },
  windowId: "browser-window-1",
  ...overrides,
});

describe("browser approval manager", () => {
  it("returns an opaque safe descriptor while retaining exact authority only in memory", () => {
    const manager = createBrowserApprovalManager({
      now: () => 1_000,
      randomBytes: () => Buffer.alloc(24, 9),
      ttlMs: 5_000,
    });

    const created = manager.request(binding());

    expect(created.approvalId).toMatch(/^[0-9a-f]{48}$/u);
    expect(created.descriptor).toEqual({
      action: "act",
      approvalId: created.approvalId,
      allowedDecisions: ["deny", "allow_once"],
      expiresAt: 6_000,
      operation: "type",
      origin: "https://example.com",
      tabId: "browser-tab-1",
      target: { kind: "ref", ref: expect.stringMatching(OPAQUE_TARGET_PATTERN) },
      windowId: "browser-window-1",
    });
    expect(Object.isFrozen(created.descriptor)).toBe(true);
    const serialized = JSON.stringify(manager.snapshot());
    expect(serialized).not.toMatch(
      /ref-email|private typed value|payloadHash|sha256|lease|token|secret|text/i,
    );
  });

  it("aliases exact refs and selectors without publishing caller-controlled target text", () => {
    const manager = createBrowserApprovalManager();
    const selector = manager.request(binding({
      target: { kind: "selector", selector: "input[value='hunter2']" },
    }));
    const ref = manager.request(binding({
      payloadHash: hashBrowserApprovalPayload({ n: 2 }),
      target: { kind: "ref", ref: "bank-transfer-confirm" },
    }));
    expect(selector.descriptor.target?.ref).toMatch(OPAQUE_TARGET_PATTERN);
    expect(ref.descriptor.target?.ref).toMatch(OPAQUE_TARGET_PATTERN);
    expect(selector.descriptor.target?.ref).not.toBe(ref.descriptor.target?.ref);
    expect(JSON.stringify(manager.snapshot())).not.toMatch(/hunter2|bank-transfer-confirm/u);
  });

  it("derives a stable alias from the approval id and exact target", () => {
    const manager = createBrowserApprovalManager({ randomBytes: () => Buffer.alloc(24, 7) });
    const first = manager.request(binding({
      target: { kind: "ref", ref: "bank-transfer-confirm" },
    }));
    expect(manager.snapshot().pendingApprovals[0]?.target).toEqual(first.descriptor.target);

    manager.cancelConnection("connection-one");
    const same = manager.request(binding({
      target: { kind: "ref", ref: "bank-transfer-confirm" },
    }));
    expect(same.approvalId).toBe(first.approvalId);
    expect(same.descriptor.target).toEqual(first.descriptor.target);

    manager.cancelConnection("connection-one");
    const different = manager.request(binding({
      target: { kind: "ref", ref: "hunter2" },
    }));
    expect(different.approvalId).toBe(first.approvalId);
    expect(different.descriptor.target?.ref).toMatch(OPAQUE_TARGET_PATTERN);
    expect(different.descriptor.target).not.toEqual(first.descriptor.target);
    expect(JSON.stringify([first, same, different])).not.toMatch(/bank-transfer-confirm|hunter2/u);
  });

  it("rejects an MCP owner that is not the authenticated connection", () => {
    const manager = createBrowserApprovalManager();
    expect(() => manager.request(binding({ owner: { id: "connection-two", kind: "mcp" } })))
      .toThrowError(expect.objectContaining({ code: "OWNER_MISMATCH" }));
  });

  it("approves only the exact owner-bound retry and atomically consumes allow-once", async () => {
    const manager = createBrowserApprovalManager();
    const original = binding();
    const { approvalId } = manager.request(original);
    manager.resolve({ approvalId, decision: "allow_once", windowId: "browser-window-1" });

    const results = await Promise.allSettled([
      Promise.resolve().then(() => manager.consume({ approvalId, binding: original })),
      Promise.resolve().then(() => manager.consume({ approvalId, binding: original })),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(() => manager.consume({ approvalId, binding: original })).toThrowError(
      expect.objectContaining({ code: "APPROVAL_EXPIRED" }),
    );
  });

  it.each([
    ["connection", { connectionId: "connection-two", owner: { id: "connection-two", kind: "mcp" } }],
    ["owner", { owner: { id: "workflow-one", kind: "workflow" } }],
    ["window", { windowId: "browser-window-2" }],
    ["tab", { tabId: "browser-tab-2" }],
    ["navigation", { navigationGeneration: 4 }],
    ["control", { controlEpoch: 8 }],
    ["origin", { origin: "https://other.example" }],
    ["operation", { operation: "click" }],
    ["target", { target: { kind: "ref", ref: "ref-other" } }],
    ["payload", { payloadHash: hashBrowserApprovalPayload({ action: "act", text: "substitution" }) }],
  ])("rejects %s substitution without consuming the exact approval", (_label, patch) => {
    const manager = createBrowserApprovalManager();
    const original = binding();
    const { approvalId } = manager.request(original);
    manager.resolve({ approvalId, decision: "allow_once", windowId: "browser-window-1" });

    expect(() => manager.consume({ approvalId, binding: binding(patch) })).toThrowError(
      expect.objectContaining({ code: "PAYLOAD_MISMATCH" }),
    );
    expect(manager.consume({ approvalId, binding: original })).toBe(true);
  });

  it("denies and expires approvals without granting retry authority", () => {
    let now = 10;
    const manager = createBrowserApprovalManager({ now: () => now, ttlMs: 100 });
    const denied = manager.request(binding());
    manager.resolve({
      approvalId: denied.approvalId,
      decision: "deny",
      windowId: "browser-window-1",
    });
    expect(() => manager.consume({ approvalId: denied.approvalId, binding: binding() }))
      .toThrowError(expect.objectContaining({ code: "APPROVAL_EXPIRED" }));

    const expired = manager.request(binding());
    now = 111;
    expect(manager.snapshot().pendingApprovals).toEqual([]);
    expect(() => manager.consume({ approvalId: expired.approvalId, binding: binding() }))
      .toThrowError(expect.objectContaining({ code: "APPROVAL_EXPIRED" }));
  });

  it("invalidates pending and approved entries on every authority lifecycle boundary", () => {
    const cases = [
      (manager: ApprovalLifecycle) => manager.navigationChanged("browser-window-1", "browser-tab-1"),
      (manager: ApprovalLifecycle) => manager.controlChanged("browser-window-1", "browser-tab-1"),
      (manager: ApprovalLifecycle) => manager.tabClosed("browser-window-1", "browser-tab-1"),
      (manager: ApprovalLifecycle) => manager.windowClosed("browser-window-1"),
      (manager: ApprovalLifecycle) => manager.cancelConnection("connection-one"),
    ];

    for (const invalidate of cases) {
      const manager = createBrowserApprovalManager();
      const pending = manager.request(binding());
      const approved = manager.request(binding({ payloadHash: hashBrowserApprovalPayload({ n: 2 }) }));
      manager.resolve({
        approvalId: approved.approvalId,
        decision: "allow_once",
        windowId: "browser-window-1",
      });
      invalidate(manager);
      expect(manager.snapshot().pendingApprovals).toEqual([]);
      expect(() => manager.consume({ approvalId: pending.approvalId, binding: binding() })).toThrow();
      expect(() => manager.consume({
        approvalId: approved.approvalId,
        binding: binding({ payloadHash: hashBrowserApprovalPayload({ n: 2 }) }),
      })).toThrow();
    }
  });

  it("bounds pending count and rejects unknown or cross-window resolution", () => {
    const manager = createBrowserApprovalManager({ maxPendingApprovals: 2 });
    const first = manager.request(binding({ payloadHash: hashBrowserApprovalPayload({ n: 1 }) }));
    manager.request(binding({ payloadHash: hashBrowserApprovalPayload({ n: 2 }) }));
    expect(() => manager.request(binding({ payloadHash: hashBrowserApprovalPayload({ n: 3 }) })))
      .toThrowError(expect.objectContaining({ code: "CAPABILITY_NOT_VERIFIED" }));
    expect(() => manager.resolve({
      approvalId: first.approvalId,
      decision: "allow_once",
      windowId: "browser-window-2",
    })).toThrow();
    expect(() => manager.resolve({
      approvalId: "unknown-approval",
      decision: "allow_once",
      windowId: "browser-window-1",
    })).toThrow();
  });

  it("counts approved-but-unconsumed one-shots against the active authority bound", () => {
    const manager = createBrowserApprovalManager({ maxPendingApprovals: 1 });
    const first = manager.request(binding());
    manager.resolve({
      approvalId: first.approvalId,
      decision: "allow_once",
      windowId: "browser-window-1",
    });
    expect(manager.snapshot().pendingApprovals).toEqual([]);
    expect(() => manager.request(binding({ payloadHash: hashBrowserApprovalPayload({ n: 2 }) })))
      .toThrowError(expect.objectContaining({ code: "CAPABILITY_NOT_VERIFIED" }));
  });

  it("isolates per-connection quotas while retaining a global hard cap", () => {
    const manager = createBrowserApprovalManager({
      maxApprovalsPerConnection: 2,
      maxPendingApprovals: 3,
    });
    const forConnection = (connectionId: string, n: number) => binding({
      connectionId,
      owner: { id: connectionId, kind: "mcp" },
      payloadHash: hashBrowserApprovalPayload({ connectionId, n }),
    });

    const firstA = manager.request(forConnection("connection-a", 1));
    manager.resolve({
      approvalId: firstA.approvalId,
      decision: "allow_once",
      windowId: "browser-window-1",
    });
    manager.request(forConnection("connection-a", 2));
    expect(() => manager.request(forConnection("connection-a", 3)))
      .toThrowError(expect.objectContaining({ code: "CAPABILITY_NOT_VERIFIED" }));
    expect(() => manager.request(binding({
      connectionId: "connection-a",
      owner: { id: "connection-wrong", kind: "mcp" },
    }))).toThrowError(expect.objectContaining({ code: "OWNER_MISMATCH" }));

    manager.request(forConnection("connection-b", 1));
    expect(() => manager.request(forConnection("connection-b", 2)))
      .toThrowError(expect.objectContaining({ code: "CAPABILITY_NOT_VERIFIED" }));

    manager.cancelConnection("connection-a");
    manager.request(forConnection("connection-b", 2));
    expect(() => manager.request(forConnection("connection-b", 3)))
      .toThrowError(expect.objectContaining({ code: "CAPABILITY_NOT_VERIFIED" }));

    manager.cancelConnection("connection-b");
    expect(manager.request(forConnection("connection-a", 4))).toHaveProperty("approvalId");
  });

  it("hashes canonical object key order while detecting nested payload substitution", () => {
    const first = hashBrowserApprovalPayload({
      action: "act",
      nested: { b: 2, a: 1 },
      target: { ref: "ref-one", kind: "ref" },
    });
    const reordered = hashBrowserApprovalPayload({
      target: { kind: "ref", ref: "ref-one" },
      nested: { a: 1, b: 2 },
      action: "act",
    });
    const substituted = hashBrowserApprovalPayload({
      action: "act",
      nested: { a: 1, b: 3 },
      target: { kind: "ref", ref: "ref-one" },
    });
    expect(first).toBe(reordered);
    expect(first).not.toBe(substituted);
  });

  it("actively publishes expiry so a displayed approval can disappear", async () => {
    vi.useFakeTimers();
    try {
      const manager = createBrowserApprovalManager({ ttlMs: 50 });
      const listener = vi.fn();
      manager.subscribe(listener);
      manager.request(binding());
      expect(listener).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(50);
      expect(listener).toHaveBeenCalledTimes(2);
      expect(manager.snapshot().pendingApprovals).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("publishes changes and supports exact unsubscription", () => {
    const manager = createBrowserApprovalManager();
    const listener = vi.fn();
    const unsubscribe = manager.subscribe(listener);
    const approval = manager.request(binding());
    manager.resolve({
      approvalId: approval.approvalId,
      decision: "deny",
      windowId: "browser-window-1",
    });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(unsubscribe()).toBe(true);
    expect(unsubscribe()).toBe(false);
  });
});
