"use strict";

const crypto = require("node:crypto");
const {
  BROWSER_RESOURCE_BUDGETS,
} = require("../shared/browser-resource-budgets.cjs");

const TERMINAL_STATES = new Set([
  "completed",
  "failed",
  "cancelled",
  "reconciliation_required",
]);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function createWorkflowRunRegistry({
  maxActiveRuns = BROWSER_RESOURCE_BUDGETS.maxSimultaneousWorkflowRuns,
  maxActiveRunsPerOwner = BROWSER_RESOURCE_BUDGETS.maxWorkflowRunsPerOwner,
  now = () => Date.now(),
  randomBytes = crypto.randomBytes,
} = {}) {
  if (
    !Number.isSafeInteger(maxActiveRuns) ||
    maxActiveRuns < 1 ||
    maxActiveRuns > BROWSER_RESOURCE_BUDGETS.maxSimultaneousWorkflowRuns
  ) {
    throw new TypeError(
      "maxActiveRuns is outside the release resource budget.",
    );
  }
  if (
    !Number.isSafeInteger(maxActiveRunsPerOwner) ||
    maxActiveRunsPerOwner < 1 ||
    maxActiveRunsPerOwner > BROWSER_RESOURCE_BUDGETS.maxWorkflowRunsPerOwner
  ) {
    throw new TypeError(
      "maxActiveRunsPerOwner is outside the release resource budget.",
    );
  }
  const runs = new Map();
  const listeners = new Map();
  const globalListeners = new Set();
  const targetOwners = new Map();

  const targetKey = (target) =>
    target ? `${target.windowId}\0${target.tabId}` : null;
  const publicRun = (run) =>
    deepFreeze({
      runId: run.runId,
      family: run.family,
      ownerId: run.ownerId,
      status: run.status,
      currentStep: run.currentStep,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      ...(run.target ? { target: { ...run.target } } : {}),
      ...(run.error ? { error: { ...run.error } } : {}),
      ...(run.pending ? { pending: { ...run.pending } } : {}),
      outputs: [...run.outputs],
    });

  function emit(run, event) {
    const frozen = deepFreeze({
      runId: run.runId,
      family: run.family,
      ...event,
    });
    run.events.push(frozen);
    for (const listener of listeners.get(run.ownerId) ?? []) {
      try {
        listener(frozen);
      } catch {
        /* isolate renderer/MCP listeners */
      }
    }
    for (const listener of [...globalListeners]) {
      try {
        listener();
      } catch {
        /* Status listeners own their failures. */
      }
    }
    return frozen;
  }

  function create({
    family,
    ownerId,
    target = null,
    controller = new AbortController(),
  }) {
    if (typeof ownerId !== "string" || !ownerId)
      throw new TypeError("Workflow ownerId is required.");
    const activeRuns = [...runs.values()].filter(
      (run) => !TERMINAL_STATES.has(run.status),
    );
    const ownerActiveRuns = activeRuns.filter((run) => run.ownerId === ownerId);
    if (
      activeRuns.length >= maxActiveRuns ||
      ownerActiveRuns.length >= maxActiveRunsPerOwner
    ) {
      const error = new Error("Workflow run resource limit reached.");
      error.code = "RUN_LIMIT";
      throw error;
    }
    const key = targetKey(target);
    if (key && targetOwners.has(key)) {
      const ownerRunId = targetOwners.get(key);
      const existing = runs.get(ownerRunId);
      if (existing && !TERMINAL_STATES.has(existing.status)) {
        const error = new Error("Another workflow controls this tab.");
        error.code = "TARGET_BUSY";
        throw error;
      }
    }
    const runId = `workflow-run-${randomBytes(12).toString("hex")}`;
    const timestamp = now();
    const run = {
      runId,
      family,
      ownerId,
      target,
      controller,
      status: "starting",
      currentStep: null,
      error: null,
      pending: null,
      outputs: [],
      events: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    runs.set(runId, run);
    if (key) targetOwners.set(key, runId);
    emit(run, { type: "started", status: run.status });
    return run;
  }

  function requireOwned(runId, ownerId) {
    const run = runs.get(runId);
    if (!run) {
      const error = new Error("Workflow run not found.");
      error.code = "RUN_NOT_FOUND";
      throw error;
    }
    if (run.ownerId !== ownerId) {
      const error = new Error("Workflow run belongs to another owner.");
      error.code = "OWNER_MISMATCH";
      throw error;
    }
    return run;
  }

  function update(run, patch, event = null) {
    Object.assign(run, patch, { updatedAt: now() });
    if (event) emit(run, event);
    else {
      for (const listener of [...globalListeners]) {
        try {
          listener();
        } catch {
          /* Status listeners own their failures. */
        }
      }
    }
    if (TERMINAL_STATES.has(run.status)) {
      const key = targetKey(run.target);
      if (key && targetOwners.get(key) === run.runId) targetOwners.delete(key);
    }
    return publicRun(run);
  }

  function cancel(runId, ownerId, reason = "cancelled") {
    const run = requireOwned(runId, ownerId);
    if (TERMINAL_STATES.has(run.status)) return publicRun(run);
    run.controller.abort(reason);
    return update(
      run,
      { status: "cancelled", pending: null },
      { type: "cancelled", reason },
    );
  }

  function cancelOwner(ownerId, reason = "disconnected") {
    let count = 0;
    for (const run of runs.values()) {
      if (run.ownerId === ownerId && !TERMINAL_STATES.has(run.status)) {
        cancel(run.runId, ownerId, reason);
        count += 1;
      }
    }
    listeners.delete(ownerId);
    return count;
  }

  function subscribe(ownerId, listener) {
    if (typeof listener !== "function")
      throw new TypeError("Workflow listener is required.");
    let set = listeners.get(ownerId);
    if (!set) {
      set = new Set();
      listeners.set(ownerId, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) listeners.delete(ownerId);
    };
  }

  function subscribeAll(listener) {
    if (typeof listener !== "function")
      throw new TypeError("Workflow status listener is required.");
    globalListeners.add(listener);
    return () => globalListeners.delete(listener);
  }

  return Object.freeze({
    cancel,
    cancelOwner,
    create,
    emit,
    get: (runId, ownerId) => publicRun(requireOwned(runId, ownerId)),
    requireOwned,
    snapshot: () => deepFreeze({ runs: [...runs.values()].map(publicRun) }),
    subscribe,
    subscribeAll,
    update,
  });
}

module.exports = { createWorkflowRunRegistry };
