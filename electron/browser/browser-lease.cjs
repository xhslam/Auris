"use strict";

const crypto = require("node:crypto");
const { createBrowserPublicError } = require("../shared/browser-contract.cjs");
const { normalizeOwnerKind } = require("./browser-owner-kind.cjs");

const TOKEN_BYTES = 32;

function targetKey(windowId, tabId) {
  return `${windowId}\u0000${tabId}`;
}

function hashToken(createHash, token) {
  if (typeof token !== "string" || token.length < 16 || token.length > 512) return null;
  return createHash("sha256").update(token, "utf8").digest();
}

function fail(code, input = {}) {
  throw createBrowserPublicError(code, {
    tabId: input.tabId,
    windowId: input.windowId,
  });
}

function isNonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function createBrowserLeaseManager({
  createHash = crypto.createHash,
  randomBytes = crypto.randomBytes,
  timingSafeEqual = crypto.timingSafeEqual,
} = {}) {
  const leases = new Map();
  const released = new Map();
  const epochs = new Map();
  const listeners = new Set();

  function notify() {
    for (const listener of [...listeners]) {
      try { listener(); } catch { /* Status listeners own their failures. */ }
    }
  }

  function nextEpoch(input) {
    const key = targetKey(input.windowId, input.tabId);
    const previous = epochs.get(key);
    const baseline = Math.max(
      Number.isSafeInteger(input.controlEpoch) ? input.controlEpoch : 0,
      previous?.controlEpoch ?? 0,
    );
    const state = {
      controlEpoch: baseline + 1,
      navigationGeneration: input.navigationGeneration,
      sourceControlEpoch: input.controlEpoch,
    };
    epochs.set(key, state);
    return state;
  }

  function tokenMatches(record, leaseToken) {
    const candidate = hashToken(createHash, leaseToken);
    return Boolean(
      candidate
      && Buffer.isBuffer(record?.tokenHash)
      && candidate.length === record.tokenHash.length
      && timingSafeEqual(candidate, record.tokenHash),
    );
  }

  function acquire(input) {
    if (!isNonnegativeInteger(input.navigationGeneration)) {
      throw new TypeError("A nonnegative navigation generation is required.");
    }
    if (!isNonnegativeInteger(input.controlEpoch)) {
      throw new TypeError("A nonnegative source control epoch is required.");
    }
    const key = targetKey(input.windowId, input.tabId);
    const current = leases.get(key);
    if (current) {
      if (current.connectionId !== input.connectionId) fail("OWNER_MISMATCH", input);
      if (current.navigationGeneration !== input.navigationGeneration) {
        fail("STALE_NAVIGATION", input);
      }
    }

    const epoch = nextEpoch(input);
    const leaseToken = randomBytes(TOKEN_BYTES).toString("base64url");
    const record = {
      connectionId: input.connectionId,
      controlEpoch: epoch.controlEpoch,
      navigationGeneration: epoch.navigationGeneration,
      owner: Object.freeze({
        id: input.connectionId,
        kind: normalizeOwnerKind(input.ownerKind),
      }),
      sourceControlEpoch: epoch.sourceControlEpoch,
      tabId: input.tabId,
      tokenHash: hashToken(createHash, leaseToken),
      windowId: input.windowId,
    };
    leases.set(key, record);
    released.delete(key);
    notify();
    return Object.freeze({
      controlEpoch: record.controlEpoch,
      leaseToken,
      navigationGeneration: record.navigationGeneration,
      tabId: record.tabId,
      windowId: record.windowId,
    });
  }

  function assert(input) {
    const key = targetKey(input.windowId, input.tabId);
    const record = leases.get(key);
    if (!record) fail("LEASE_LOST", input);
    if (record.connectionId !== input.connectionId) fail("OWNER_MISMATCH", input);
    if (!tokenMatches(record, input.leaseToken)) fail("LEASE_LOST", input);
    if (record.navigationGeneration !== input.navigationGeneration) {
      fail("STALE_NAVIGATION", input);
    }
    if (record.controlEpoch !== input.controlEpoch) fail("CONTROL_STALE", input);
    return Object.freeze({
      controlEpoch: record.controlEpoch,
      navigationGeneration: record.navigationGeneration,
      owner: record.owner,
      tabId: record.tabId,
      windowId: record.windowId,
    });
  }

  function assertCurrent(input, {
    currentControlEpoch,
    currentNavigationGeneration,
  } = {}) {
    // Validate caller authority first. Untrusted envelope values must never be
    // able to invalidate the real owner's lease.
    const authority = assert(input);
    const key = targetKey(input.windowId, input.tabId);
    const record = leases.get(key);
    if (!isNonnegativeInteger(currentNavigationGeneration)) {
      fail("CAPABILITY_NOT_VERIFIED", input);
    }
    if (currentNavigationGeneration !== record.navigationGeneration) {
      navigationChanged(
        input.windowId,
        input.tabId,
        currentNavigationGeneration,
        currentControlEpoch,
      );
      fail("STALE_NAVIGATION", input);
    }
    if (!isNonnegativeInteger(currentControlEpoch)) {
      fail("CAPABILITY_NOT_VERIFIED", input);
    }
    if (currentControlEpoch !== record.sourceControlEpoch) {
      controlChanged(input.windowId, input.tabId, currentControlEpoch);
      fail("CONTROL_STALE", input);
    }
    return authority;
  }

  function release(input) {
    const key = targetKey(input.windowId, input.tabId);
    const record = leases.get(key);
    if (!record) {
      const tombstone = released.get(key);
      if (
        tombstone
        && tombstone.connectionId === input.connectionId
        && tombstone.navigationGeneration === input.navigationGeneration
        && tombstone.controlEpoch === input.controlEpoch
        && tokenMatches(tombstone, input.leaseToken)
      ) {
        if (
          !isNonnegativeInteger(input.currentNavigationGeneration)
          || !isNonnegativeInteger(input.currentControlEpoch)
        ) {
          fail("CAPABILITY_NOT_VERIFIED", input);
        }
        if (input.currentNavigationGeneration !== tombstone.navigationGeneration) {
          navigationChanged(input.windowId, input.tabId, input.currentNavigationGeneration);
          fail("STALE_NAVIGATION", input);
        }
        if (input.currentControlEpoch !== tombstone.sourceControlEpoch) {
          controlChanged(input.windowId, input.tabId, input.currentControlEpoch);
          fail("CONTROL_STALE", input);
        }
        return Object.freeze({ released: false });
      }
      fail("LEASE_LOST", input);
    }
    assertCurrent(input, {
      currentControlEpoch: input.currentControlEpoch,
      currentNavigationGeneration: input.currentNavigationGeneration,
    });
    leases.delete(key);
    released.set(key, record);
    const state = epochs.get(key) ?? record;
    epochs.set(key, {
      controlEpoch: Math.max(state.controlEpoch, record.controlEpoch) + 1,
      navigationGeneration: record.navigationGeneration,
      sourceControlEpoch: record.sourceControlEpoch,
    });
    notify();
    return Object.freeze({ released: true });
  }

  function invalidateKey(key) {
    leases.delete(key);
    released.delete(key);
  }

  function navigationChanged(windowId, tabId, navigationGeneration, currentControlEpoch) {
    if (!isNonnegativeInteger(navigationGeneration)) {
      throw new TypeError("A nonnegative navigation generation is required.");
    }
    if (currentControlEpoch !== undefined && !isNonnegativeInteger(currentControlEpoch)) {
      throw new TypeError("A nonnegative source control epoch is required.");
    }
    const key = targetKey(windowId, tabId);
    const current = leases.get(key) ?? epochs.get(key) ?? { controlEpoch: 0 };
    invalidateKey(key);
    epochs.set(key, {
      controlEpoch: current.controlEpoch + 1,
      navigationGeneration,
      sourceControlEpoch: isNonnegativeInteger(currentControlEpoch)
        ? currentControlEpoch
        : (current.sourceControlEpoch ?? 0) + 1,
    });
    notify();
  }

  function controlChanged(windowId, tabId, currentControlEpoch) {
    if (currentControlEpoch !== undefined && !isNonnegativeInteger(currentControlEpoch)) {
      throw new TypeError("A nonnegative source control epoch is required.");
    }
    const key = targetKey(windowId, tabId);
    const current = leases.get(key) ?? epochs.get(key) ?? released.get(key) ?? {
      controlEpoch: 0,
      navigationGeneration: 0,
      sourceControlEpoch: 0,
    };
    invalidateKey(key);
    const sourceControlEpoch = isNonnegativeInteger(currentControlEpoch)
      ? currentControlEpoch
      : current.sourceControlEpoch + 1;
    epochs.set(key, {
      controlEpoch: Math.max(current.controlEpoch + 1, sourceControlEpoch),
      navigationGeneration: current.navigationGeneration,
      sourceControlEpoch,
    });
    notify();
  }

  function tabClosed(windowId, tabId) {
    const key = targetKey(windowId, tabId);
    invalidateKey(key);
    epochs.delete(key);
    notify();
  }

  function windowClosed(windowId) {
    let changed = false;
    for (const [key, record] of [...leases, ...released, ...epochs]) {
      if (record.windowId === windowId || key.startsWith(`${windowId}\u0000`)) {
        invalidateKey(key);
        epochs.delete(key);
        changed = true;
      }
    }
    if (changed) notify();
  }

  function releaseConnection(connectionId) {
    let changed = false;
    for (const [key, record] of leases) {
      if (record.connectionId !== connectionId) continue;
      leases.delete(key);
      released.delete(key);
      const state = epochs.get(key) ?? record;
      epochs.set(key, {
        controlEpoch: state.controlEpoch + 1,
        navigationGeneration: record.navigationGeneration,
        sourceControlEpoch: record.sourceControlEpoch,
      });
      changed = true;
    }
    for (const [key, record] of released) {
      if (record.connectionId === connectionId) {
        released.delete(key);
        changed = true;
      }
    }
    if (changed) notify();
  }

  function isAvailable(windowId, tabId) {
    return !leases.has(targetKey(windowId, tabId));
  }

  function canAcquire(connectionId, windowId, tabId) {
    const record = leases.get(targetKey(windowId, tabId));
    return !record || record.connectionId === connectionId;
  }

  function snapshot() {
    return Object.freeze({
      leases: Object.freeze([...leases.values()].map((record) => Object.freeze({
        controlEpoch: record.controlEpoch,
        navigationGeneration: record.navigationGeneration,
        owner: record.owner,
        tabId: record.tabId,
        windowId: record.windowId,
      }))),
    });
  }

  function subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("Browser lease listener is required.");
    listeners.add(listener);
    let active = true;
    return () => {
      if (!active) return false;
      active = false;
      return listeners.delete(listener);
    };
  }

  return Object.freeze({
    acquire,
    assert,
    assertCurrent,
    canAcquire,
    controlChanged,
    isAvailable,
    navigationChanged,
    release,
    releaseConnection,
    snapshot,
    subscribe,
    tabClosed,
    windowClosed,
  });
}

module.exports = { TOKEN_BYTES, createBrowserLeaseManager };
