"use strict";

/**
 * Compiled Phase 4 security gates. Production flips these only after the
 * corresponding live evidence exists (unit/integration/macOS smoke). Named
 * profiles / cookie replay remain independent session-capability flags.
 */

const PHASE_FOUR_SECURITY_GATE_IDS = Object.freeze([
  "dialog",
  "ux",
  "session",
  "mode",
  "reclaim",
  "crash",
  "audit",
  "adversarial",
]);

const DEFAULT_PHASE_FOUR_SECURITY_GATES = Object.freeze({
  adversarial: true,
  audit: true,
  crash: true,
  dialog: true,
  mode: true,
  reclaim: true,
  session: true,
  ux: true,
});

function normalizeGateMap(input = {}) {
  const next = {};
  for (const id of PHASE_FOUR_SECURITY_GATE_IDS) {
    next[id] = input[id] === true;
  }
  return Object.freeze(next);
}

function createBrowserSecurityGates(initial = DEFAULT_PHASE_FOUR_SECURITY_GATES) {
  let gates = normalizeGateMap(initial);

  function snapshot() {
    const missing = PHASE_FOUR_SECURITY_GATE_IDS.filter((id) => gates[id] !== true);
    return Object.freeze({
      gates,
      missing,
      reason: missing.length === 0
        ? null
        : `phase4-security-incomplete:${missing.join(",")}`,
      verified: missing.length === 0,
    });
  }

  function mark(next = {}) {
    gates = normalizeGateMap({ ...gates, ...next });
    return snapshot();
  }

  return Object.freeze({
    mark,
    snapshot,
  });
}

module.exports = {
  DEFAULT_PHASE_FOUR_SECURITY_GATES,
  PHASE_FOUR_SECURITY_GATE_IDS,
  createBrowserSecurityGates,
};
