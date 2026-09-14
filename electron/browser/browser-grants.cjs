"use strict";

const { randomBytes: systemRandomBytes } = require("node:crypto");
const {
  browserAuthorityOperationSchema,
  createBrowserPublicError,
} = require("../shared/browser-contract.cjs");
const { getBrowserOperationPolicy } = require("./browser-operation-policy.cjs");

const ATTACHMENT_MODES = Object.freeze(["once", "until-navigation"]);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function normalizeOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new TypeError();
    return url.origin;
  } catch {
    throw createBrowserPublicError("NO_COMMITTED_ORIGIN");
  }
}

function normalizeId(value, name) {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/u.test(value)) {
    throw new TypeError(`Invalid Browser grant ${name}.`);
  }
  return value;
}

function standingKey(origin, operation) {
  return `${origin}\u0000${operation}`;
}

function attachmentKey(windowId, tabId) {
  return `${windowId}\u0000${tabId}`;
}

function createBrowserGrantManager({
  randomBytes = systemRandomBytes,
} = {}) {
  const standing = new Map();
  const attachments = new Map();
  const listeners = new Set();

  function notify() {
    for (const listener of [...listeners]) {
      try { listener(); } catch { /* UI listeners own their failures. */ }
    }
  }

  function uniqueGrantId(prefix) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const bytes = randomBytes(16);
      if (!Buffer.isBuffer(bytes) || bytes.length < 16) {
        throw new TypeError("Browser grant randomness is unavailable.");
      }
      const id = `${prefix}-${bytes.toString("hex")}`;
      if (![...standing.values(), ...attachments.values()].some((entry) => entry.grantId === id)) {
        return id;
      }
    }
    throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
      capability: "browser-grant-id",
    });
  }

  function standingDescriptor(entry) {
    return deepFreeze({
      grantId: entry.grantId,
      kind: "standing",
      operation: entry.operation,
      origin: entry.origin,
    });
  }

  function attachmentDescriptor(entry) {
    return deepFreeze({
      grantId: entry.grantId,
      kind: "attachment",
      mode: entry.mode,
      navigationGeneration: entry.navigationGeneration,
      tabId: entry.tabId,
      windowId: entry.windowId,
    });
  }

  function grantStanding({ origin: originInput, operation: operationInput } = {}) {
    const origin = normalizeOrigin(originInput);
    const operation = browserAuthorityOperationSchema.parse(operationInput);
    const policy = getBrowserOperationPolicy(operation);
    if (!policy.standingGrantable || policy.approvalClass !== "exact-or-standing") {
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        capability: "standing-grant",
        operation,
      });
    }
    const key = standingKey(origin, operation);
    const existing = standing.get(key);
    if (existing) return standingDescriptor(existing);
    const entry = deepFreeze({
      grantId: uniqueGrantId("standing"),
      kind: "standing",
      operation,
      origin,
    });
    standing.set(key, entry);
    notify();
    return standingDescriptor(entry);
  }

  function hasStandingGrant(originInput, operationInput) {
    try {
      const origin = normalizeOrigin(originInput);
      const operation = browserAuthorityOperationSchema.parse(operationInput);
      return standing.has(standingKey(origin, operation));
    } catch {
      return false;
    }
  }

  function attach({
    mode,
    navigationGeneration,
    tabId: tabIdInput,
    windowId: windowIdInput,
  } = {}) {
    if (!ATTACHMENT_MODES.includes(mode)) {
      throw new TypeError("Invalid Browser attachment mode.");
    }
    if (!Number.isSafeInteger(navigationGeneration) || navigationGeneration < 0) {
      throw new TypeError("Invalid Browser attachment navigation generation.");
    }
    const windowId = normalizeId(windowIdInput, "window");
    const tabId = normalizeId(tabIdInput, "tab");
    const key = attachmentKey(windowId, tabId);
    const entry = deepFreeze({
      grantId: uniqueGrantId("attach"),
      kind: "attachment",
      mode,
      navigationGeneration,
      tabId,
      windowId,
    });
    attachments.set(key, entry);
    notify();
    return attachmentDescriptor(entry);
  }

  function getAttachment(windowId, tabId) {
    return attachments.get(attachmentKey(windowId, tabId)) ?? null;
  }

  function assertAttachment({
    navigationGeneration,
    tabId,
    windowId,
  } = {}) {
    const entry = getAttachment(windowId, tabId);
    if (!entry) {
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        capability: "human-attachment",
      });
    }
    if (
      entry.mode === "until-navigation"
      && entry.navigationGeneration !== navigationGeneration
    ) {
      attachments.delete(attachmentKey(windowId, tabId));
      notify();
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        capability: "human-attachment",
        reason: "navigation-invalidated",
      });
    }
    return attachmentDescriptor(entry);
  }

  function consumeAttachmentOnce({ tabId, windowId } = {}) {
    const key = attachmentKey(windowId, tabId);
    const entry = attachments.get(key);
    if (!entry) return false;
    if (entry.mode !== "once") return true;
    attachments.delete(key);
    notify();
    return true;
  }

  function revoke(grantIdInput) {
    const grantId = normalizeId(grantIdInput, "grant");
    for (const [key, entry] of standing) {
      if (entry.grantId === grantId) {
        standing.delete(key);
        notify();
        return deepFreeze({ revoked: true, grantId });
      }
    }
    for (const [key, entry] of attachments) {
      if (entry.grantId === grantId) {
        attachments.delete(key);
        notify();
        return deepFreeze({ revoked: true, grantId });
      }
    }
    throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
      capability: "browser-grant-revoke",
    });
  }

  function invalidateAttachments(predicate) {
    let changed = false;
    for (const [key, entry] of attachments) {
      if (predicate(entry)) {
        attachments.delete(key);
        changed = true;
      }
    }
    if (changed) notify();
    return changed;
  }

  function snapshot() {
    const standingGrants = [...standing.values()]
      .map(standingDescriptor)
      .sort((left, right) => left.grantId.localeCompare(right.grantId));
    const attachmentGrants = [...attachments.values()]
      .map(attachmentDescriptor)
      .sort((left, right) => left.grantId.localeCompare(right.grantId));
    return deepFreeze({
      attachments: attachmentGrants,
      standingGrants,
    });
  }

  function subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("Grant listener must be a function.");
    listeners.add(listener);
    let active = true;
    return () => {
      if (!active) return false;
      active = false;
      return listeners.delete(listener);
    };
  }

  return Object.freeze({
    assertAttachment,
    attach,
    consumeAttachmentOnce,
    controlChanged: (windowId, tabId) => invalidateAttachments((entry) =>
      entry.windowId === windowId && entry.tabId === tabId),
    getAttachment,
    grantStanding,
    hasStandingGrant,
    navigationChanged: (windowId, tabId) => invalidateAttachments((entry) =>
      entry.windowId === windowId && entry.tabId === tabId),
    revoke,
    snapshot,
    subscribe,
    tabClosed: (windowId, tabId) => invalidateAttachments((entry) =>
      entry.windowId === windowId && entry.tabId === tabId),
    windowClosed: (windowId) => invalidateAttachments((entry) => entry.windowId === windowId),
  });
}

function computeAllowedApprovalDecisions({
  automationMode,
  operation,
} = {}) {
  const policy = getBrowserOperationPolicy(operation);
  const decisions = ["deny", "allow_once"];
  if (policy.standingGrantable && policy.approvalClass === "exact-or-standing") {
    decisions.push("allow_standing");
  }
  if (automationMode === "Human") {
    decisions.push("attach_once", "attach_until_navigation");
  }
  return Object.freeze([...decisions]);
}

module.exports = {
  ATTACHMENT_MODES,
  computeAllowedApprovalDecisions,
  createBrowserGrantManager,
};
