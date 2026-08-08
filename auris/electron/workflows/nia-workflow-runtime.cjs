"use strict";

/**
 * Main-owned runtime for Nia YAML workflows.
 *
 * Only raw YAML or an injected trusted stored reference enters the runtime.
 * The packaged contract reparses in main; renderer ASTs/actions/tokens are
 * rejected. Browser/Notes action effects remain injectable and fail closed
 * behind an approval service.
 */

const crypto = require("node:crypto");
const {
  NiaWorkflowError,
  createNiaWorkflowError,
  parseNiaWorkflowYaml,
  runNiaWorkflow,
} = require("../shared/nia-workflow-contract.cjs");

const NIA_WORKFLOW_RUNTIME_ERROR_CODES = Object.freeze([
  "INVALID_REQUEST",
  "STORED_SOURCE_UNAVAILABLE",
  "RUN_NOT_FOUND",
  "OWNER_MISMATCH",
  "ACTION_ADAPTER_UNAVAILABLE",
  "APPROVAL_SERVICE_UNAVAILABLE",
]);

const START_KEYS = Object.freeze(["source", "storedRef", "inputs"]);
const STORED_REF_PATTERN = /^[a-zA-Z0-9][\w.-]{0,127}$/u;

class NiaWorkflowRuntimeError extends Error {
  constructor(code, message, details) {
    if (!NIA_WORKFLOW_RUNTIME_ERROR_CODES.includes(code)) {
      throw new TypeError(`Unknown Nia workflow runtime error code: ${code}`);
    }
    super(message);
    this.name = "NiaWorkflowRuntimeError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function runtimeError(code, message, details) {
  return new NiaWorkflowRuntimeError(code, message, details);
}

function createWorkflowRunId() {
  return `nia-wf-${crypto.randomBytes(12).toString("hex")}`;
}

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

function assertStrictObject(value, allowedKeys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw runtimeError("INVALID_REQUEST", `${label} must be an object.`);
  }
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      throw runtimeError("INVALID_REQUEST", `${label} contains forbidden key "${key}".`);
    }
  }
  return value;
}

function publicEvent(event) {
  const allowed = [
    "type",
    "runId",
    "family",
    "name",
    "stepId",
    "uses",
    "status",
    "reason",
    "output",
    "outputs",
    "code",
    "message",
    "stepCount",
    "sourceCompatibility",
    "diagnostics",
    "originalUses",
  ];
  const out = {};
  for (const key of allowed) {
    if (event[key] !== undefined) out[key] = event[key];
  }
  return freeze(out);
}

function createNiaWorkflowRuntime({
  definitionRepository = null,
  executePrompt = null,
  actionAdapters = {},
  approvalService = null,
  resolveStoredSource = null,
  createRunId = createWorkflowRunId,
} = {}) {
  const runs = new Map();
  const runIdsByOwner = new Map();
  const subscribersByOwner = new Map();

  function requireOwner(ownerId) {
    if (typeof ownerId !== "string" && typeof ownerId !== "number") {
      throw runtimeError("INVALID_REQUEST", "A main-owned workflow owner is required.");
    }
  }

  function emit(run, event) {
    if (run.terminal && event.type !== "cancelled") return null;
    if (
      event.type === "cancelled" &&
      run.events.length > 0 &&
      run.events[run.events.length - 1].type === "cancelled"
    ) {
      return null;
    }
    const safe = publicEvent({ ...event, runId: run.runId });
    run.events.push(safe);
    if (run.events.length > 512) run.events.shift();
    const subscribers = subscribersByOwner.get(run.ownerId);
    if (subscribers) {
      for (const listener of [...subscribers]) {
        try {
          listener(safe);
        } catch {
          // Isolate renderer/MCP listener failures.
        }
      }
    }
    return safe;
  }

  function bindOwner(ownerId, runId) {
    const ids = runIdsByOwner.get(ownerId) || new Set();
    ids.add(runId);
    runIdsByOwner.set(ownerId, ids);
  }

  function unbindOwner(ownerId, runId) {
    const ids = runIdsByOwner.get(ownerId);
    if (!ids) return;
    ids.delete(runId);
    if (ids.size === 0) runIdsByOwner.delete(ownerId);
  }

  function subscribe(ownerId, listener) {
    requireOwner(ownerId);
    if (typeof listener !== "function") {
      throw runtimeError("INVALID_REQUEST", "Workflow subscriber must be a function.");
    }
    const listeners = subscribersByOwner.get(ownerId) || new Set();
    listeners.add(listener);
    subscribersByOwner.set(ownerId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) subscribersByOwner.delete(ownerId);
    };
  }

  async function readSource(request) {
    if (typeof request.source === "string" && request.storedRef === undefined) {
      return request.source;
    }
    if (typeof request.storedRef === "string" && request.source === undefined) {
      if (!STORED_REF_PATTERN.test(request.storedRef) || typeof resolveStoredSource !== "function") {
        throw runtimeError(
          "STORED_SOURCE_UNAVAILABLE",
          "Trusted stored workflow source is unavailable.",
        );
      }
      const source = await resolveStoredSource(request.storedRef);
      if (typeof source !== "string") {
        throw runtimeError("STORED_SOURCE_UNAVAILABLE", "Stored workflow did not return raw YAML.");
      }
      return source;
    }
    throw runtimeError(
      "INVALID_REQUEST",
      "Provide exactly one raw source or trusted storedRef.",
    );
  }

  function adaptersFor(run) {
    const approvedStepIds = new Set();
    return Object.freeze({
      async resolveDefinition(args) {
        if (!definitionRepository || typeof definitionRepository.resolveUsesRef !== "function") {
          throw createNiaWorkflowError("STEP_FAILED", "Nia definition repository is unavailable.");
        }
        return definitionRepository.resolveUsesRef(args.uses);
      },
      async executePrompt(args) {
        if (typeof executePrompt !== "function") {
          throw createNiaWorkflowError("STEP_FAILED", "Nia prompt executor is unavailable.");
        }
        return executePrompt({
          ...args,
          runId: run.runId,
          ownerId: run.ownerId,
          signal: run.controller.signal,
          grantsBrowserAuthority: false,
        });
      },
      async requestApproval(args) {
        if (!approvalService || typeof approvalService.request !== "function") return false;
        const approved = await approvalService.request({
          ...args,
          ownerId: run.ownerId,
          family: "nia_yaml",
        });
        if (approved) approvedStepIds.add(args.step.id);
        return approved;
      },
      async executeAction(args) {
        const adapter = actionAdapters[args.action];
        if (typeof adapter !== "function") {
          throw runtimeError(
            "ACTION_ADAPTER_UNAVAILABLE",
            `Action adapter "${args.action}" is unavailable.`,
          );
        }
        if (!approvalService || typeof approvalService.request !== "function") {
          throw runtimeError(
            "APPROVAL_SERVICE_UNAVAILABLE",
            "Action execution requires an approval/review service.",
          );
        }
        const approved = approvedStepIds.has(args.step.id)
          ? true
          : await approvalService.request({
              ownerId: run.ownerId,
              runId: run.runId,
              family: "nia_yaml",
              action: args.action,
              step: args.step,
              params: args.params,
            });
        if (!approved) {
          throw createNiaWorkflowError(
            "APPROVAL_DENIED",
            `Action "${args.action}" approval was denied.`,
          );
        }
        return adapter({
          ...args,
          ownerId: run.ownerId,
          runId: run.runId,
          signal: run.controller.signal,
        });
      },
    });
  }

  async function startRun({ ownerId, request }) {
    requireOwner(ownerId);
    const strict = assertStrictObject(request, START_KEYS, "Workflow start request");
    const source = await readSource(strict);
    const ast = parseNiaWorkflowYaml(source);
    const runId = createRunId();
    if (typeof runId !== "string" || runId.length === 0 || runs.has(runId)) {
      throw runtimeError("INVALID_REQUEST", "Main failed to create a unique workflow run ID.");
    }
    const run = {
      runId,
      ownerId,
      family: "nia_yaml",
      name: ast.name,
      status: "running",
      currentStepId: null,
      controller: new AbortController(),
      events: [],
      outputs: Object.freeze({}),
      error: null,
      terminal: false,
    };
    runs.set(runId, run);
    bindOwner(ownerId, runId);

    queueMicrotask(() => {
      void (async () => {
        try {
          const result = await runNiaWorkflow({
            ast,
            inputs: strict.inputs || {},
            adapters: adaptersFor(run),
            signal: run.controller.signal,
            runId,
            onEvent(event) {
              if (event.type === "step" && event.status === "started") {
                run.currentStepId = event.stepId || null;
              }
              if (event.type === "step" && ["completed", "failed", "skipped"].includes(event.status)) {
                run.currentStepId = null;
              }
              emit(run, event);
            },
          });
          if (run.status === "cancelled") return;
          run.outputs = result.outputs;
          if (result.ok) {
            run.status = "completed";
          } else if (result.cancelled) {
            run.status = "cancelled";
          } else {
            run.status = "failed";
            run.error = result.error || null;
          }
          run.terminal = true;
        } catch (error) {
          if (run.status === "cancelled") return;
          run.status = "failed";
          run.error = error;
          run.terminal = true;
          emit(run, {
            type: "failed",
            family: "nia_yaml",
            name: run.name,
            code: error instanceof NiaWorkflowError ? error.code : "STEP_FAILED",
            message: error instanceof Error ? error.message : String(error),
          });
        } finally {
          unbindOwner(ownerId, runId);
        }
      })();
    });

    return freeze({ runId, family: "nia_yaml", name: ast.name, status: "running" });
  }

  function requireOwnedRun(runId, ownerId) {
    requireOwner(ownerId);
    const run = runs.get(runId);
    if (!run) throw runtimeError("RUN_NOT_FOUND", `Workflow run "${runId}" was not found.`);
    if (run.ownerId !== ownerId) {
      throw runtimeError("OWNER_MISMATCH", "Workflow run belongs to another owner.");
    }
    return run;
  }

  function getRun({ runId, ownerId }) {
    const run = requireOwnedRun(runId, ownerId);
    return freeze({
      runId: run.runId,
      family: run.family,
      name: run.name,
      status: run.status,
      currentStepId: run.currentStepId,
      outputs: run.outputs,
      events: [...run.events],
      ...(run.error
        ? {
            error: {
              code: run.error.code || "STEP_FAILED",
              message: run.error.message || String(run.error),
            },
          }
        : {}),
    });
  }

  function cancelRun({ runId, ownerId }) {
    const run = requireOwnedRun(runId, ownerId);
    if (run.terminal) return freeze({ runId, cancelled: false, status: run.status });
    run.status = "cancelled";
    run.terminal = true;
    run.controller.abort();
    emit(run, { type: "cancelled", family: "nia_yaml", name: run.name, code: "CANCELLED" });
    unbindOwner(ownerId, runId);
    return freeze({ runId, cancelled: true, status: "cancelled" });
  }

  function cancelAllForOwner(ownerId) {
    const runIds = runIdsByOwner.get(ownerId);
    if (!runIds) {
      subscribersByOwner.delete(ownerId);
      return 0;
    }
    let count = 0;
    for (const runId of [...runIds]) {
      const result = cancelRun({ runId, ownerId });
      if (result.cancelled) count += 1;
    }
    subscribersByOwner.delete(ownerId);
    return count;
  }

  return Object.freeze({
    cancelAllForOwner,
    cancelRun,
    getRun,
    startRun,
    subscribe,
  });
}

module.exports = {
  NIA_WORKFLOW_RUNTIME_ERROR_CODES,
  NiaWorkflowRuntimeError,
  createNiaWorkflowRuntime,
  createWorkflowRunId,
};
