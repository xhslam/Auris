"use strict";

const ACTIVE_RUN_STATES = new Set([
  "starting",
  "running",
  "awaiting_confirmation",
  "awaiting_approval",
]);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function safeText(value, limit = 256) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f-\u009f]/gu, "").slice(0, limit)
    : "";
}

function redactStatusUrl(value) {
  try {
    const url = new URL(value);
    if (!new Set(["http:", "https:"]).has(url.protocol)) return "";
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.href.slice(0, 2_048);
  } catch {
    return "";
  }
}

function originOf(value) {
  try {
    const url = new URL(value);
    return new Set(["http:", "https:"]).has(url.protocol) ? url.origin : "";
  } catch { return ""; }
}

function targetKey(windowId, tabId) {
  return `${windowId}\u0000${tabId}`;
}

function readSnapshot(source, fallback) {
  try {
    return source && typeof source.snapshot === "function" ? source.snapshot() : fallback;
  } catch {
    return fallback;
  }
}

function createBrowserStatusService({
  approvals = null,
  getMainWindows = () => [],
  grants = null,
  leases = null,
  maxUpdatesPerSecond = 10,
  registry,
  schedule = (callback, delay) => setTimeout(callback, delay),
  workflows = null,
} = {}) {
  if (!registry || typeof registry.snapshot !== "function") {
    throw new TypeError("Browser status requires the main Browser registry.");
  }
  const listeners = new Set();
  const unsubscribeSources = [];
  const intervalMs = Math.max(16, Math.ceil(1_000 / Math.max(1, Math.min(60, maxUpdatesPerSecond))));
  let revision = 0;
  let scheduled = false;
  let disposed = false;
  let current = null;

  function project() {
    const registrySnapshot = readSnapshot(registry, { windows: [] });
    const leaseSnapshot = readSnapshot(leases, { leases: [] });
    const approvalSnapshot = readSnapshot(approvals, { pendingApprovals: [] });
    const grantSnapshot = readSnapshot(grants, { standingGrants: [], attachments: [] });
    const workflowSnapshot = readSnapshot(workflows, { runs: [] });

    const activeWorkflowTargets = new Set(
      (workflowSnapshot.runs || [])
        .filter((run) => ACTIVE_RUN_STATES.has(run.status) && run.target)
        .map((run) => targetKey(run.target.windowId, run.target.tabId)),
    );
    const leaseByTarget = new Map(
      (leaseSnapshot.leases || []).map((lease) => [targetKey(lease.windowId, lease.tabId), lease]),
    );
    const approvalCountByTarget = new Map();
    for (const approval of approvalSnapshot.pendingApprovals || []) {
      const key = targetKey(approval.windowId, approval.tabId);
      approvalCountByTarget.set(key, (approvalCountByTarget.get(key) || 0) + 1);
    }
    const standingOrigins = new Set((grantSnapshot.standingGrants || []).map((grant) => grant.origin));
    const sortedWindows = [...(registrySnapshot.windows || [])].sort((left, right) =>
      (right.lastActiveAt - left.lastActiveAt) || String(left.windowId).localeCompare(String(right.windowId)));

    const windows = sortedWindows.map((windowRecord, windowIndex) => deepFreeze({
      active: windowIndex === 0,
      lastActiveAt: Number.isFinite(windowRecord.lastActiveAt) ? windowRecord.lastActiveAt : 0,
      lifecycle: safeText(windowRecord.lifecycle, 32) || "ready",
      windowId: safeText(windowRecord.windowId, 128),
      tabs: (windowRecord.tabs || []).map((tab) => {
        const key = targetKey(windowRecord.windowId, tab.tabId);
        const workflowActive = activeWorkflowTargets.has(key);
        const lease = leaseByTarget.get(key);
        const url = redactStatusUrl(tab.url);
        return deepFreeze({
          active: tab.tabId === windowRecord.activeTabId || tab.active === true,
          activity: workflowActive ? "workflow" : lease ? "mcp" : "idle",
          automationMode: ["Human", "AiSandbox", "AiShared"].includes(tab.automationMode)
            ? tab.automationMode
            : "Human",
          crashMode: ["ok", "auto", "manual-only"].includes(tab.crashMode) ? tab.crashMode : "ok",
          leaseHolderKind: workflowActive ? "workflow" : lease ? "mcp" : null,
          lifecycle: safeText(tab.lifecycle, 32) || "ready",
          loading: tab.loading === true,
          pendingApprovalCount: approvalCountByTarget.get(key) || 0,
          standingGrant: standingOrigins.has(originOf(url)),
          tabId: safeText(tab.tabId, 128),
          title: safeText(tab.title, 256),
          url,
        });
      }),
    }));

    const mainWindows = getMainWindows();
    const appWindows = (Array.isArray(mainWindows) ? mainWindows : [])
      .map((windowRecord) => deepFreeze({
        focused: windowRecord.focused === true,
        lifecycle: safeText(windowRecord.lifecycle, 32) || "ready",
        title: safeText(windowRecord.title, 128) || "Auris",
        visible: windowRecord.visible !== false,
        windowId: safeText(windowRecord.windowId, 128),
      }))
      .sort((left, right) => Number(right.focused) - Number(left.focused)
        || left.windowId.localeCompare(right.windowId));

    revision += 1;
    return deepFreeze({
      appWindows,
      pendingApprovalCount: [...approvalCountByTarget.values()].reduce((sum, count) => sum + count, 0),
      revision,
      windows,
    });
  }

  function getSnapshot() {
    // Pull callers receive current main-owned state even while a coalesced push
    // is pending; the rate bound applies to renderer notifications, not reads.
    if (!current || scheduled) current = project();
    return current;
  }

  function flush() {
    scheduled = false;
    if (disposed) return;
    current = project();
    for (const listener of [...listeners]) {
      try { listener(current); } catch { /* Renderer listeners own their failures. */ }
    }
  }

  function sourceChanged() {
    if (disposed || scheduled) return;
    scheduled = true;
    schedule(flush, intervalMs);
  }

  for (const source of [registry, leases, approvals, grants]) {
    if (source && typeof source.subscribe === "function") {
      unsubscribeSources.push(source.subscribe(sourceChanged));
    }
  }
  if (workflows && typeof workflows.subscribeAll === "function") {
    unsubscribeSources.push(workflows.subscribeAll(sourceChanged));
  } else if (workflows && typeof workflows.subscribe === "function") {
    unsubscribeSources.push(workflows.subscribe(sourceChanged));
  }

  function subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("Browser status listener is required.");
    listeners.add(listener);
    let active = true;
    return () => {
      if (!active) return false;
      active = false;
      return listeners.delete(listener);
    };
  }

  function dispose() {
    if (disposed) return false;
    disposed = true;
    for (const unsubscribe of unsubscribeSources.splice(0)) unsubscribe?.();
    listeners.clear();
    return true;
  }

  return Object.freeze({ dispose, getSnapshot, subscribe });
}

module.exports = { createBrowserStatusService, redactStatusUrl };
