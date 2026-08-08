"use strict";

const crypto = require("node:crypto");
const {
  compileBrowserWorkflowFromSource,
  stepWrites,
} = require("../shared/browser-workflow-contract.cjs");
const { createWorkflowRunRegistry } = require("./workflow-run-registry.cjs");

function runtimeError(code, message, details) {
  const error = new Error(message); error.name = "BrowserWorkflowRuntimeError"; error.code = code;
  if (details) error.details = details;
  return error;
}

function sourceHash(source) {
  return crypto.createHash("sha256").update(source).digest("hex");
}

function assertStartRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) throw runtimeError("INVALID_REQUEST", "Workflow request is required.");
  const allowed = new Set(["source", "storedRef", "inputs", "target", "trusted", "timeoutMs"]);
  for (const key of Object.keys(request)) {
    if (!allowed.has(key)) throw runtimeError("FORGED_COMPILED_INPUT", `Unsupported workflow start key: ${key}`);
  }
  if (Object.hasOwn(request, "ast") || Object.hasOwn(request, "compiled") || Object.hasOwn(request, "intents")) {
    throw runtimeError("FORGED_COMPILED_INPUT", "Renderer-supplied workflow compilation is not accepted.");
  }
}

function materializeIntent(step, inputs) {
  const intent = step.intent;
  if (intent.action !== "act" || intent.variant !== "type") return { ...intent };
  const text = intent.text?.kind === "input_slot" ? inputs[intent.text.name] : intent.text?.value;
  if (typeof text !== "string") throw runtimeError("MISSING_INPUT", `Missing workflow input ${intent.text?.name || "text"}.`);
  return { action: "act", variant: "type", target: intent.target, text };
}

function createBrowserWorkflowRuntime({
  dispatcher,
  apiService = null,
  registry = createWorkflowRunRegistry(),
  definitionStore = null,
  reviewDefinition = async () => false,
  niaPropose = null,
  maxRuntimeMs = 5 * 60_000,
} = {}) {
  if (!dispatcher || typeof dispatcher.dispatch !== "function") throw new TypeError("Browser workflow runtime requires the Browser dispatcher.");
  const reviewed = new Set();

  async function resolveSource(request) {
    if (typeof request.source === "string" && request.storedRef === undefined) return { source: request.source, trusted: request.trusted === true };
    if (typeof request.storedRef === "string" && request.source === undefined && definitionStore?.readRaw) {
      const record = await definitionStore.readRaw(request.storedRef);
      if (!record || typeof record.source !== "string") throw runtimeError("DEFINITION_NOT_FOUND", "Stored workflow was not found.");
      return { source: record.source, trusted: true };
    }
    throw runtimeError("RAW_SOURCE_REQUIRED", "Use raw Markdown or a trusted stored definition reference.");
  }

  async function dispatch(connectionId, params, signal) {
    return dispatcher.dispatch({ connectionId, params, signal });
  }

  async function acquire(run, signal) {
    return dispatch(run.ownerId, {
      request: { action: "acquire_control" },
      target: run.target,
    }, signal);
  }

  async function release(run, control) {
    if (!control) return;
    try {
      await dispatch(run.ownerId, { control, request: { action: "release_control" } }, new AbortController().signal);
    } catch { /* authority is fail-closed and lifecycle cleanup remains idempotent */ }
  }

  async function executeStep(run, compiled, step, inputs, signal) {
    if (step.kind === "confirm") {
      registry.update(run, {
        status: "awaiting_confirmation",
        pending: { kind: "confirm", stepIndex: step.index, message: step.intent.message },
      }, { type: "approval_required", stepIndex: step.index, reason: "human_pause" });
      return "paused";
    }
    if (step.kind === "goal") {
      if (typeof niaPropose !== "function") throw runtimeError("NIA_UNAVAILABLE", "Nia proposal service is unavailable.");
      const proposal = await niaPropose({ prompt: step.intent.prompt, runId: run.runId, stepIndex: step.index, signal });
      registry.update(run, {
        status: "awaiting_confirmation",
        pending: { kind: "nia_review", stepIndex: step.index, proposal },
      }, { type: "approval_required", stepIndex: step.index, reason: "nia_compile_review" });
      return "paused";
    }

    const acquired = await acquire(run, signal);
    const control = acquired.control;
    try {
      const targetOrigin = acquired.target?.url ? new URL(acquired.target.url).origin : null;
      if (step.kind !== "api" && targetOrigin !== compiled.expectedOrigin) {
        throw runtimeError("ORIGIN_MISMATCH", "Workflow target no longer matches its declared site.");
      }
      if (step.kind === "api") {
        if (!apiService) throw runtimeError("API_UNAVAILABLE", "Workflow API service is unavailable.");
        const url = step.intent.url.replace(/\{([a-zA-Z_][\w-]*)\}/gu, (_match, name) => {
          if (typeof inputs[name] !== "string") throw runtimeError("MISSING_INPUT", `Missing workflow input ${name}.`);
          return encodeURIComponent(inputs[name]);
        });
        const approvalId = run.approvalId;
        run.approvalId = null;
        return await apiService.execute({
          connectionId: run.ownerId, control, method: step.intent.method, url, signal,
          ...(approvalId ? { approvalId } : {}),
        });
      }
      const request = step.kind === "extract" ? { action: "read" } : materializeIntent(step, inputs);
      const approvalId = run.approvalId;
      run.approvalId = null;
      return await dispatch(run.ownerId, {
        control,
        request,
        ...(approvalId ? { approvalId } : {}),
      }, signal);
    } finally {
      await release(run, control);
    }
  }

  async function drive(run, compiled, inputs, startIndex = 0) {
    const timer = setTimeout(() => run.controller.abort("timeout"), Math.min(run.timeoutMs, maxRuntimeMs));
    try {
      registry.update(run, { status: "running", pending: null });
      for (let offset = startIndex; offset < compiled.steps.length; offset += 1) {
        if (run.controller.signal.aborted) throw runtimeError("CANCELLED", "Workflow was cancelled.");
        const step = compiled.steps[offset];
        run.activeStepWrites = stepWrites({ kind: step.kind, text: step.sourceText });
        registry.update(run, { currentStep: step.index }, { type: "step_started", stepIndex: step.index, kind: step.kind });
        const result = await executeStep(run, compiled, step, inputs, run.controller.signal);
        if (result === "paused") return;
        run.outputs.push(Object.freeze({ stepIndex: step.index, value: result }));
        registry.emit(run, { type: "step_completed", stepIndex: step.index });
      }
      registry.update(run, { status: "completed", currentStep: null }, { type: "completed" });
    } catch (error) {
      const unknown = run.activeStepWrites && (
        run.controller.signal.aborted || error?.code === "TIMEOUT" || error?.code === "CANCELLED" || error?.code === "UNKNOWN_OUTCOME"
      );
      if (unknown) {
        registry.update(run, {
          status: "reconciliation_required",
          pending: { kind: "unknown_outcome", stepIndex: run.currentStep },
          error: { code: "UNKNOWN_OUTCOME", message: "Reconcile this write-like step before retrying." },
        }, { type: "reconciliation_required", stepIndex: run.currentStep });
      } else if (error?.code === "APPROVAL_REQUIRED") {
        registry.update(run, {
          status: "awaiting_approval",
          pending: {
            kind: "browser_approval",
            stepIndex: run.currentStep,
            approvalId: error?.metadata?.approvalId ?? error?.details?.approvalId,
          },
        }, { type: "approval_required", stepIndex: run.currentStep, reason: "browser_operation" });
      } else if (run.status !== "cancelled") {
        registry.update(run, {
          status: "failed",
          error: { code: error?.code || "FAILED", message: error instanceof Error ? error.message : String(error) },
        }, { type: "failed", code: error?.code || "FAILED" });
      }
    } finally {
      clearTimeout(timer);
      run.activeStepWrites = false;
    }
  }

  async function start({ ownerId, request }) {
    assertStartRequest(request);
    const resolved = await resolveSource(request);
    const compiled = compileBrowserWorkflowFromSource(resolved.source);
    if (!request.target || typeof request.target.windowId !== "string" || typeof request.target.tabId !== "string") {
      throw runtimeError("EXPLICIT_TARGET_REQUIRED", "Choose an explicit Browser window and tab.");
    }
    const hash = sourceHash(resolved.source);
    if (!resolved.trusted && !reviewed.has(hash)) {
      const approved = await reviewDefinition({
        family: compiled.family,
        normalizedSource: resolved.source,
        ownerId,
        requestedOrigins: [compiled.expectedOrigin, ...compiled.steps.filter((s) => s.kind === "api").map((s) => new URL(s.intent.url).origin)],
        requestedOperations: [...new Set(compiled.steps.map((s) => s.pageTarget?.operation).filter(Boolean))],
        requestedSecrets: compiled.inputs.filter((input) => input.type === "secret").map((input) => input.name),
      });
      if (!approved) throw runtimeError("REVIEW_REQUIRED", "Imported workflow requires human review.");
      reviewed.add(hash);
    }
    const run = registry.create({ family: compiled.family, ownerId, target: request.target });
    run.compiled = compiled;
    run.inputs = Object.freeze({ ...(request.inputs || {}) });
    run.timeoutMs = Number.isInteger(request.timeoutMs) ? request.timeoutMs : maxRuntimeMs;
    queueMicrotask(() => { void drive(run, compiled, run.inputs); });
    return registry.get(run.runId, ownerId);
  }

  function cancel(runId, ownerId) {
    const run = registry.requireOwned(runId, ownerId);
    if (run.activeStepWrites) {
      run.controller.abort("cancelled");
      return registry.update(run, {
        status: "reconciliation_required",
        pending: { kind: "unknown_outcome", stepIndex: run.currentStep },
      }, { type: "reconciliation_required", stepIndex: run.currentStep });
    }
    return registry.cancel(runId, ownerId);
  }

  function resume(runId, ownerId, { approved, approvalId } = {}) {
    const run = registry.requireOwned(runId, ownerId);
    if (!["awaiting_confirmation", "awaiting_approval"].includes(run.status)) {
      throw runtimeError("RUN_NOT_PAUSED", "Workflow run is not waiting for review.");
    }
    if (approved !== true) return cancel(runId, ownerId);
    const currentOffset = Math.max(0, (run.currentStep ?? 1) - 1);
    const skipReviewedStep = run.pending?.kind === "confirm" || run.pending?.kind === "nia_review";
    if (run.pending?.kind === "browser_approval") {
      if (typeof approvalId !== "string" || approvalId !== run.pending.approvalId) {
        throw runtimeError("APPROVAL_MISMATCH", "Fresh approval does not match the pending operation.");
      }
      run.approvalId = approvalId;
    }
    queueMicrotask(() => { void drive(run, run.compiled, run.inputs, currentOffset + (skipReviewedStep ? 1 : 0)); });
    return registry.update(run, { status: "starting", pending: null });
  }

  return Object.freeze({
    cancel,
    disconnect: (ownerId) => registry.cancelOwner(ownerId),
    getState: (runId, ownerId) => registry.get(runId, ownerId),
    resume,
    start,
    subscribe: (ownerId, listener) => registry.subscribe(ownerId, listener),
  });
}

module.exports = { createBrowserWorkflowRuntime, runtimeError };
