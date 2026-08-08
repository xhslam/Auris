import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createBrowserLeaseManager } = require(
  "../../../../electron/browser/browser-lease.cjs",
);

const target = {
  connectionId: "connection-one",
  windowId: "window-one",
  tabId: "tab-one",
  navigationGeneration: 4,
  controlEpoch: 7,
};

type LeaseLifecycle = {
  navigationChanged: (windowId: string, tabId: string, generation: number) => void;
  releaseConnection: (connectionId: string) => void;
  tabClosed: (windowId: string, tabId: string) => void;
  windowClosed: (windowId: string) => void;
};

describe("browser lease manager", () => {
  it("issues an opaque token, stores only a hash projection, and validates timing-safely", () => {
    const randomBytes = vi.fn(() => Buffer.alloc(32, 7));
    const timingSafeEqual = vi.fn((left: Buffer, right: Buffer) => left.equals(right));
    const leases = createBrowserLeaseManager({ randomBytes, timingSafeEqual });

    const control = leases.acquire(target);
    expect(control.leaseToken).toHaveLength(43);
    expect(control.controlEpoch).toBe(8);
    expect(randomBytes).toHaveBeenCalledWith(32);
    expect(leases.assert({ ...target, ...control })).toMatchObject({
      owner: { id: target.connectionId, kind: "mcp" },
    });
    expect(timingSafeEqual).toHaveBeenCalled();

    const serialized = JSON.stringify(leases.snapshot());
    expect(serialized).not.toContain(control.leaseToken);
    expect(serialized).not.toMatch(/hash|digest/i);
  });

  it("rejects connection, target, generation, epoch, and token replay", () => {
    const leases = createBrowserLeaseManager();
    const control = leases.acquire(target);
    const valid = { ...target, ...control };

    expect(() => leases.assert({ ...valid, connectionId: "connection-two" }))
      .toThrowError(expect.objectContaining({ code: "OWNER_MISMATCH" }));
    expect(() => leases.assert({ ...valid, tabId: "tab-two" }))
      .toThrowError(expect.objectContaining({ code: "LEASE_LOST" }));
    expect(() => leases.assert({ ...valid, navigationGeneration: 5 }))
      .toThrowError(expect.objectContaining({ code: "STALE_NAVIGATION" }));
    expect(() => leases.assert({ ...valid, controlEpoch: 9 }))
      .toThrowError(expect.objectContaining({ code: "CONTROL_STALE" }));
    expect(() => leases.assert({ ...valid, leaseToken: "x".repeat(43) }))
      .toThrowError(expect.objectContaining({ code: "LEASE_LOST" }));
  });

  it("requires the token for release and is idempotent for the released owner", () => {
    const leases = createBrowserLeaseManager();
    const control = leases.acquire(target);
    const valid = { ...target, ...control };
    const releaseInput = {
      ...valid,
      currentControlEpoch: target.controlEpoch,
      currentNavigationGeneration: target.navigationGeneration,
    };

    expect(() => leases.release({ ...releaseInput, leaseToken: undefined }))
      .toThrowError(expect.objectContaining({ code: "LEASE_LOST" }));
    expect(leases.release(releaseInput)).toEqual({ released: true });
    expect(leases.release(releaseInput)).toEqual({ released: false });
    expect(() => leases.assert(valid))
      .toThrowError(expect.objectContaining({ code: "LEASE_LOST" }));
    expect(() => leases.release({ ...releaseInput, leaseToken: "y".repeat(43) }))
      .toThrowError(expect.objectContaining({ code: "LEASE_LOST" }));
  });

  it("invalidates leases on navigation, tab/window close, and disconnect", () => {
    const invalidators = [
      (leases: LeaseLifecycle) => leases.navigationChanged("window-one", "tab-one", 5),
      (leases: LeaseLifecycle) => leases.tabClosed("window-one", "tab-one"),
      (leases: LeaseLifecycle) => leases.windowClosed("window-one"),
      (leases: LeaseLifecycle) => leases.releaseConnection("connection-one"),
    ];

    for (const invalidate of invalidators) {
      const leases = createBrowserLeaseManager();
      const control = leases.acquire(target);
      const valid = { ...target, ...control };
      invalidate(leases);
      expect(() => leases.assert(valid))
        .toThrowError(expect.objectContaining({ code: "LEASE_LOST" }));
    }
  });

  it("rotates control independently and both dimensions on document identity change", () => {
    const leases = createBrowserLeaseManager();
    const first = leases.acquire(target);
    leases.release({
      ...target,
      ...first,
      currentControlEpoch: target.controlEpoch,
      currentNavigationGeneration: target.navigationGeneration,
    });
    const second = leases.acquire(target);
    expect(second.navigationGeneration).toBe(target.navigationGeneration);
    expect(second.controlEpoch).toBeGreaterThan(first.controlEpoch);

    leases.navigationChanged("window-one", "tab-one", 5, target.controlEpoch + 1);
    const third = leases.acquire({
      ...target,
      navigationGeneration: 5,
      controlEpoch: target.controlEpoch + 1,
    });
    expect(third.navigationGeneration).toBe(5);
    expect(third.controlEpoch).toBeGreaterThan(second.controlEpoch);
  });

  it("lets the same owner reacquire with rotated authority but rejects another owner", () => {
    const leases = createBrowserLeaseManager();
    const first = leases.acquire(target);
    const second = leases.acquire(target);

    expect(second.controlEpoch).toBeGreaterThan(first.controlEpoch);
    expect(second.leaseToken).not.toBe(first.leaseToken);
    expect(() => leases.assert({ ...target, ...first }))
      .toThrowError(expect.objectContaining({ code: expect.stringMatching(/CONTROL_STALE|LEASE_LOST/) }));
    expect(leases.assert({ ...target, ...second })).toMatchObject({
      owner: { id: "connection-one", kind: "mcp" },
    });
    expect(() => leases.acquire({
      ...target,
      connectionId: "connection-two",
      controlEpoch: target.controlEpoch,
    })).toThrowError(expect.objectContaining({ code: "OWNER_MISMATCH" }));
  });

  it("binds the trusted source control epoch without letting caller epochs invalidate the lease", () => {
    const leases = createBrowserLeaseManager();
    const control = leases.acquire(target);
    const valid = { ...target, ...control };

    expect(leases.assertCurrent(valid, {
      currentControlEpoch: target.controlEpoch,
      currentNavigationGeneration: target.navigationGeneration,
    })).toMatchObject({ owner: { id: "connection-one", kind: "mcp" } });
    expect(() => leases.assertCurrent({
      ...valid,
      controlEpoch: control.controlEpoch + 1,
    }, {
      currentControlEpoch: target.controlEpoch,
      currentNavigationGeneration: target.navigationGeneration,
    })).toThrowError(expect.objectContaining({ code: "CONTROL_STALE" }));
    expect(leases.assertCurrent(valid, {
      currentControlEpoch: target.controlEpoch,
      currentNavigationGeneration: target.navigationGeneration,
    })).toBeTruthy();
  });

  it("invalidates only control when the trusted source authority changes", () => {
    for (const operation of ["assert", "release"] as const) {
      const leases = createBrowserLeaseManager();
      const control = leases.acquire(target);
      const valid = { ...target, ...control };
      const input = {
        ...valid,
        currentControlEpoch: target.controlEpoch + 1,
        currentNavigationGeneration: target.navigationGeneration,
      };
      expect(() => operation === "assert"
        ? leases.assertCurrent(valid, input)
        : leases.release(input))
        .toThrowError(expect.objectContaining({ code: "CONTROL_STALE" }));
    }

    const leases = createBrowserLeaseManager();
    const first = leases.acquire(target);
    leases.controlChanged(target.windowId, target.tabId, target.controlEpoch + 1);
    const second = leases.acquire({
      ...target,
      controlEpoch: target.controlEpoch + 1,
    });
    expect(second.navigationGeneration).toBe(first.navigationGeneration);
    expect(second.controlEpoch).toBeGreaterThan(first.controlEpoch);
  });

  it("rejects negative trusted lifecycle epochs without polluting lease state", () => {
    const leases = createBrowserLeaseManager();
    const control = leases.acquire(target);
    const valid = { ...target, ...control };
    const before = leases.snapshot();

    expect(() => leases.assertCurrent(valid, {
      currentControlEpoch: -1,
      currentNavigationGeneration: target.navigationGeneration,
    })).toThrowError(expect.objectContaining({ code: "CAPABILITY_NOT_VERIFIED" }));
    expect(() => leases.controlChanged(target.windowId, target.tabId, -1)).toThrow(/control epoch/i);
    expect(() => leases.navigationChanged(target.windowId, target.tabId, -1, target.controlEpoch))
      .toThrow(/navigation generation/i);
    expect(() => leases.navigationChanged(
      target.windowId,
      target.tabId,
      target.navigationGeneration + 1,
      -1,
    )).toThrow(/control epoch/i);
    expect(leases.snapshot()).toEqual(before);
    expect(leases.assertCurrent(valid, {
      currentControlEpoch: target.controlEpoch,
      currentNavigationGeneration: target.navigationGeneration,
    })).toBeTruthy();
  });
});
