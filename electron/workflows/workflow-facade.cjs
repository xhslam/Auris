"use strict";

const { compileBrowserWorkflowFromSource } = require("../shared/browser-workflow-contract.cjs");
const { parseNiaWorkflowYaml } = require("../shared/nia-workflow-contract.cjs");
const { createWorkflowCapabilities } = require("./workflow-capabilities.cjs");

function createWorkflowFacade({
  browserRuntime,
  niaRuntime,
  capabilities = createWorkflowCapabilities(),
  definitions = null,
} = {}) {
  if (!browserRuntime || !niaRuntime) throw new TypeError("Both workflow runtimes are required.");
  const runs = new Map();

  function normalizeFamily(family) {
    if (!new Set(["nia_yaml", "browser_markdown"]).has(family)) throw new TypeError("Workflow family is required.");
    return family;
  }

  function validate(family, source) {
    normalizeFamily(family);
    if (family === "nia_yaml") {
      const ast = parseNiaWorkflowYaml(source);
      return Object.freeze({ family, name: ast.name, stepCount: ast.steps.length, sourceCompatibility: ast.sourceCompatibility });
    }
    const compiled = compileBrowserWorkflowFromSource(source);
    return Object.freeze({ family, site: compiled.site, stepCount: compiled.steps.length, approvalPoints: compiled.approvalPoints });
  }

  async function start(ownerId, family, request) {
    capabilities.assertStartAllowed(normalizeFamily(family));
    const result = family === "nia_yaml"
      ? await niaRuntime.startRun({ ownerId, request })
      : await browserRuntime.start({ ownerId, request });
    runs.set(result.runId, Object.freeze({ family, ownerId }));
    return Object.freeze({ ...result, family });
  }

  function requireMeta(runId, ownerId, family) {
    const meta = runs.get(runId);
    if (!meta) { const error = new Error("Workflow run not found."); error.code = "RUN_NOT_FOUND"; throw error; }
    if (meta.ownerId !== ownerId) { const error = new Error("Workflow run owner mismatch."); error.code = "OWNER_MISMATCH"; throw error; }
    if (meta.family !== family) { const error = new Error("Workflow family mismatch."); error.code = "FAMILY_MISMATCH"; throw error; }
    return meta;
  }

  function getState(ownerId, family, runId) {
    requireMeta(runId, ownerId, normalizeFamily(family));
    return family === "nia_yaml"
      ? niaRuntime.getRun({ runId, ownerId })
      : browserRuntime.getState(runId, ownerId);
  }

  function cancel(ownerId, family, runId) {
    requireMeta(runId, ownerId, normalizeFamily(family));
    return family === "nia_yaml"
      ? niaRuntime.cancelRun({ runId, ownerId })
      : browserRuntime.cancel(runId, ownerId);
  }

  function resume(ownerId, family, runId, { approved = false, approvalId } = {}) {
    const normalized = normalizeFamily(family);
    if (normalized !== "browser_markdown") {
      const error = new Error("Only browser_markdown workflows support resume.");
      error.code = "RESUME_UNSUPPORTED";
      throw error;
    }
    if (typeof browserRuntime.resume !== "function") {
      const error = new Error("Browser workflow resume is unavailable.");
      error.code = "RESUME_UNAVAILABLE";
      throw error;
    }
    requireMeta(runId, ownerId, normalized);
    return browserRuntime.resume(runId, ownerId, {
      approved: approved === true,
      ...(typeof approvalId === "string" ? { approvalId } : {}),
    });
  }

  function subscribe(ownerId, listener) {
    const offNia = niaRuntime.subscribe(ownerId, (event) => listener(Object.freeze({ family: "nia_yaml", ...event })));
    const offBrowser = browserRuntime.subscribe(ownerId, (event) => listener(Object.freeze({ family: "browser_markdown", ...event })));
    return () => { offNia(); offBrowser(); };
  }

  function disconnect(ownerId) {
    const nia = niaRuntime.cancelAllForOwner(ownerId);
    const browser = browserRuntime.disconnect(ownerId);
    for (const [runId, meta] of runs) if (meta.ownerId === ownerId) runs.delete(runId);
    return { nia, browser };
  }

  async function request({
    ownerId,
    action,
    family,
    source,
    runId,
    request: startRequest,
    definitionId,
    approved,
    approvalId,
  }) {
    if (action === "list") return Object.freeze({ capabilities: capabilities.snapshot(), definitions: await definitions?.list?.() ?? [] });
    normalizeFamily(family);
    if (action === "inspect") return definitions?.inspect?.(family, definitionId) ?? null;
    if (action === "validate") return validate(family, source);
    if (action === "start") return start(ownerId, family, startRequest);
    if (action === "get_state") return getState(ownerId, family, runId);
    if (action === "cancel") return cancel(ownerId, family, runId);
    if (action === "resume") {
      return resume(ownerId, family, runId, { approved, approvalId });
    }
    throw new TypeError("Unknown workflow action.");
  }

  return Object.freeze({ cancel, capabilities, disconnect, getState, request, resume, start, subscribe, validate });
}

module.exports = { createWorkflowFacade };
