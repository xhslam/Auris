"use strict";

const FAILURE_KINDS = Object.freeze(["crash", "unresponsive", "failed-load"]);

function tabKey(windowId, tabId) {
  return `${windowId}\u0000${tabId}`;
}

function createBrowserRecovery({
  now = Date.now,
  maxAutoReloads = 3,
  backoffMs = Object.freeze([0, 250, 1_000]),
  onAuthorityPurge = null,
} = {}) {
  if (!Number.isSafeInteger(maxAutoReloads) || maxAutoReloads < 1) {
    throw new TypeError("maxAutoReloads must be a positive integer.");
  }
  const delays = Array.isArray(backoffMs) && backoffMs.length > 0
    ? backoffMs.map((value) => Math.max(0, Number(value) || 0))
    : [0];

  /** @type {Map<string, { streak: number, mode: string, lastKind: string|null, lastAt: number }>} */
  const states = new Map();

  function ensure(windowId, tabId) {
    const key = tabKey(windowId, tabId);
    let state = states.get(key);
    if (!state) {
      state = {
        lastAt: 0,
        lastKind: null,
        mode: "ok",
        streak: 0,
      };
      states.set(key, state);
    }
    return state;
  }

  function snapshot(windowId, tabId) {
    const state = ensure(windowId, tabId);
    return Object.freeze({
      lastAt: state.lastAt,
      lastKind: state.lastKind,
      mode: state.mode,
      streak: state.streak,
    });
  }

  function noteSuccessfulLoad(windowId, tabId) {
    const state = ensure(windowId, tabId);
    state.streak = 0;
    state.mode = "ok";
    state.lastKind = null;
    state.lastAt = now();
    return snapshot(windowId, tabId);
  }

  function noteFailure(windowId, tabId, { kind } = {}) {
    if (!FAILURE_KINDS.includes(kind)) {
      throw new TypeError(`Unsupported recovery failure kind: ${kind}`);
    }
    if (typeof onAuthorityPurge === "function") {
      try {
        onAuthorityPurge(windowId, tabId, { kind });
      } catch {
        /* authority purge owns its failures */
      }
    }
    const state = ensure(windowId, tabId);
    state.streak += 1;
    state.lastKind = kind;
    state.lastAt = now();
    if (state.streak <= maxAutoReloads) {
      state.mode = "auto";
      const delayMs = delays[Math.min(state.streak - 1, delays.length - 1)] ?? 0;
      return Object.freeze({
        action: "auto-reload",
        delayMs,
        streak: state.streak,
      });
    }
    state.mode = "manual-only";
    return Object.freeze({
      action: "manual-only",
      streak: state.streak,
    });
  }

  function decide(windowId, tabId) {
    const state = ensure(windowId, tabId);
    if (state.mode === "manual-only") {
      return Object.freeze({ action: "manual-only", streak: state.streak });
    }
    if (state.mode === "auto" && state.streak > 0 && state.streak <= maxAutoReloads) {
      const delayMs = delays[Math.min(state.streak - 1, delays.length - 1)] ?? 0;
      return Object.freeze({
        action: "auto-reload",
        delayMs,
        streak: state.streak,
      });
    }
    return Object.freeze({ action: "none", streak: state.streak });
  }

  function reset(windowId, tabId) {
    states.delete(tabKey(windowId, tabId));
    return Object.freeze({ reset: true });
  }

  function purgeTab(windowId, tabId) {
    return reset(windowId, tabId);
  }

  return Object.freeze({
    decide,
    noteFailure,
    noteSuccessfulLoad,
    purgeTab,
    reset,
    snapshot,
  });
}

module.exports = {
  FAILURE_KINDS,
  createBrowserRecovery,
};
