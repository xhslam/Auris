import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createBrowserStatusService } = require("../../../../electron/browser/browser-status-service.cjs");

function source<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    set(next: T) { value = next; for (const listener of listeners) listener(); },
    snapshot: () => value,
    subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

describe("browser status service", () => {
  it("projects ordered immutable windows, activity, lifecycle, grants, and redacted URLs", () => {
    const registry = source({ windows: [
      {
        windowId: "window-old", activeTabId: "tab-old", lastActiveAt: 10, lifecycle: "ready",
        tabs: [{ tabId: "tab-old", title: "Old", url: "https://old.example/path?token=secret", lifecycle: "hibernated", loading: false, crashMode: "ok", automationMode: "Human" }],
      },
      {
        windowId: "window-new", activeTabId: "tab-active", lastActiveAt: 20, lifecycle: "ready",
        tabs: [
          { tabId: "tab-background", title: "Background", url: "https://example.com/bg#secret", lifecycle: "crashed", loading: false, crashMode: "manual-only", automationMode: "AiSandbox" },
          { tabId: "tab-active", title: "Active", url: "https://user:pass@example.com/live?q=secret", lifecycle: "ready", loading: true, crashMode: "auto", automationMode: "AiShared" },
        ],
      },
    ] });
    const leases = source({ leases: [{ windowId: "window-new", tabId: "tab-active", owner: { kind: "mcp", id: "raw-connection-secret" }, leaseToken: "never" }] });
    const approvals = source({ pendingApprovals: [{ windowId: "window-new", tabId: "tab-active", approvalId: "approval-secret", payloadHash: "hash-secret" }] });
    const grants = source({ standingGrants: [{ grantId: "grant-secret", origin: "https://example.com", operation: "click" }], attachments: [{ token: "attachment-secret" }] });
    const workflows = source({ runs: [{ runId: "run-secret", ownerId: "owner-secret", status: "running", target: { windowId: "window-new", tabId: "tab-active" }, outputs: ["page-secret"] }] });
    const service = createBrowserStatusService({
      approvals, grants, leases, registry, workflows,
      getMainWindows: () => [
        { windowId: "notes-main", focused: false, title: "Auris Notes", visible: true },
        { windowId: "auris-main", focused: true, title: "Auris", visible: true },
      ],
    });

    const snapshot = service.getSnapshot();
    expect(snapshot.windows.map((window: { windowId: string }) => window.windowId)).toEqual(["window-new", "window-old"]);
    expect(snapshot.appWindows[0]).toMatchObject({ windowId: "auris-main", focused: true });
    expect(snapshot.windows[0].tabs.map((tab: { tabId: string }) => tab.tabId)).toEqual(["tab-background", "tab-active"]);
    expect(snapshot.windows[0].tabs[1]).toMatchObject({
      active: true,
      activity: "workflow",
      crashMode: "auto",
      leaseHolderKind: "workflow",
      loading: true,
      pendingApprovalCount: 1,
      standingGrant: true,
      url: "https://example.com/live",
    });
    expect(snapshot.pendingApprovalCount).toBe(1);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.windows[0].tabs[0])).toBe(true);
    const serialized = JSON.stringify(snapshot);
    for (const secret of ["raw-connection-secret", "approval-secret", "hash-secret", "grant-secret", "attachment-secret", "run-secret", "owner-secret", "page-secret", "token=secret", "pass@"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("coalesces concurrent source events and produces deterministic snapshots", () => {
    const registry = source({ windows: [] as unknown[] });
    const scheduled: Array<() => void> = [];
    const listener = vi.fn();
    const service = createBrowserStatusService({ registry, schedule: (callback: () => void) => scheduled.push(callback) });
    const first = service.getSnapshot();
    registry.set({ windows: [] });
    registry.set({ windows: [] });
    registry.set({ windows: [] });
    expect(scheduled).toHaveLength(1);
    service.subscribe(listener);
    scheduled[0]();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toEqual({ ...first, revision: first.revision + 1 });
    expect(service.dispose()).toBe(true);
    expect(service.dispose()).toBe(false);
  });
});
