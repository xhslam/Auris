"use strict";

const FAMILIES = Object.freeze(["nia_yaml", "browser_markdown"]);
const STATUSES = Object.freeze(["experimental", "runtime_verified"]);
// Updated only after `npm run nia:workflow-smoke` proves each family in
// isolation. The factory itself remains fail-closed for tests/embedders.
const MAIN_WORKFLOW_RUNTIME_CAPABILITIES = Object.freeze({
  nia_yaml: "runtime_verified",
  browser_markdown: "runtime_verified",
});

function createWorkflowCapabilities(initial = {}) {
  const state = new Map(FAMILIES.map((family) => [family, initial[family] === "runtime_verified" ? "runtime_verified" : "experimental"]));
  const requireFamily = (family) => {
    if (!FAMILIES.includes(family)) throw new TypeError("Unknown workflow family.");
    return family;
  };
  function snapshot() {
    return Object.freeze(Object.fromEntries(FAMILIES.map((family) => [family, Object.freeze({
      family,
      pureOperations: Object.freeze(["list", "inspect", "validate"]),
      start: state.get(family) === "runtime_verified",
      status: state.get(family),
    })])));
  }
  function assertStartAllowed(family) {
    requireFamily(family);
    if (state.get(family) !== "runtime_verified") {
      const error = new Error(`${family} runtime has not passed its smoke gate.`);
      error.code = "CAPABILITY_NOT_VERIFIED";
      throw error;
    }
    return true;
  }
  function markRuntimeVerified(family) {
    requireFamily(family); state.set(family, "runtime_verified"); return snapshot()[family];
  }
  return Object.freeze({ assertStartAllowed, markRuntimeVerified, snapshot });
}

module.exports = {
  MAIN_WORKFLOW_RUNTIME_CAPABILITIES,
  WORKFLOW_FAMILIES: FAMILIES,
  WORKFLOW_CAPABILITY_STATUSES: STATUSES,
  createWorkflowCapabilities,
};
