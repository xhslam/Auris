"use strict";

const {
  createBrowserPublicError,
} = require("../shared/browser-contract.cjs");
const {
  createBrowserSecurityGates,
} = require("./browser-security-gates.cjs");
const {
  createBrowserSessionCapabilities,
} = require("./browser-session-capabilities.cjs");

const EVAL_SCOPE = "ai-sandbox-nonpersistent-no-session";
const EVAL_SCOPE_DESCRIPTION =
  "Exact-approved eval only in nonpersistent AiSandbox without Human/Keychain session material.";

function createBrowserCapabilities({
  getAutomationEnabled = () => false,
  localFixtureEnabled = false,
  securityGates = createBrowserSecurityGates(),
  sessionCapabilities = createBrowserSessionCapabilities(),
} = {}) {
  if (!securityGates || typeof securityGates.snapshot !== "function") {
    throw new TypeError("Browser capabilities require security gates.");
  }
  if (!sessionCapabilities || typeof sessionCapabilities.snapshot !== "function") {
    throw new TypeError("Browser capabilities require session capabilities.");
  }

  function securitySnapshot() {
    return securityGates.snapshot();
  }

  function isSecurityVerified() {
    return securitySnapshot().verified === true;
  }

  function isAutomationEnabled() {
    return getAutomationEnabled() === true;
  }

  function snapshot() {
    const security = securitySnapshot();
    const session = sessionCapabilities.snapshot();
    const automationEnabled = isAutomationEnabled();
    return Object.freeze({
      automationEnabled,
      automationToggleAvailable: security.verified === true,
      cookieReplay: session.cookieReplay === true,
      eval: Object.freeze({
        enabled: security.verified === true,
        scope: EVAL_SCOPE,
        description: EVAL_SCOPE_DESCRIPTION,
      }),
      localFixture: localFixtureEnabled === true,
      localStorageReplay: session.localStorageReplay === true,
      namedProfiles: session.namedProfiles === true,
      production: security.verified === true,
      securityReason: security.reason,
      securityVerified: security.verified === true,
    });
  }

  function assertOpenAllowed({ localFixture = false } = {}) {
    if (localFixtureEnabled && localFixture === true) return true;
    if (isSecurityVerified()) return true;
    throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
      capability: "browser-window",
      reason: securitySnapshot().reason || "phase4-security-incomplete",
    });
  }

  function assertAutomationAllowed() {
    if (!isSecurityVerified()) {
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        capability: "browser-automation",
        reason: securitySnapshot().reason || "phase4-security-incomplete",
      });
    }
    if (!isAutomationEnabled()) {
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        capability: "browser-automation-disabled",
      });
    }
    return true;
  }

  function assertExecuteJsAllowed({
    automationMode,
    partitionPersistent = false,
    sessionInjected = false,
  } = {}) {
    if (!isSecurityVerified()) {
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        action: "execute_js",
        capability: "execute_js-security",
        reason: securitySnapshot().reason || "phase4-security-incomplete",
      });
    }
    if (sessionInjected === true) {
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        action: "execute_js",
        capability: "execute_js-session-injected",
      });
    }
    if (automationMode !== "AiSandbox") {
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        action: "execute_js",
        automationMode,
        capability: "execute_js-mode",
      });
    }
    if (partitionPersistent === true) {
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        action: "execute_js",
        capability: "execute_js-persistent-partition",
      });
    }
    return Object.freeze({
      allowed: true,
      scope: EVAL_SCOPE,
      description: EVAL_SCOPE_DESCRIPTION,
    });
  }

  return Object.freeze({
    assertAutomationAllowed,
    assertExecuteJsAllowed,
    assertOpenAllowed,
    snapshot,
  });
}

module.exports = {
  EVAL_SCOPE,
  EVAL_SCOPE_DESCRIPTION,
  createBrowserCapabilities,
};
