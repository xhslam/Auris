"use strict";

const {
  createHash,
  randomBytes: systemRandomBytes,
  timingSafeEqual,
} = require("node:crypto");
const {
  BROWSER_CONTRACT_LIMITS,
  browserAuthorityOperationSchema,
  browserOwnerSchema,
  browserTargetDescriptorSchema,
  browserToolActionSchema,
  createBrowserPublicError,
  sanitizeBrowserApprovalTarget,
} = require("../shared/browser-contract.cjs");
const {
  BROWSER_RESOURCE_BUDGETS,
} = require("../shared/browser-resource-budgets.cjs");

const DEFAULT_APPROVAL_TTL_MS = 30_000;
const DEFAULT_MAX_PENDING_APPROVALS =
  BROWSER_RESOURCE_BUDGETS.maxPendingApprovals;
const DEFAULT_MAX_APPROVALS_PER_CONNECTION =
  BROWSER_RESOURCE_BUDGETS.maxApprovalsPerConnection;
const PAYLOAD_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const APPROVAL_DECISIONS = Object.freeze([
  "deny",
  "allow_once",
  "allow_standing",
  "attach_once",
  "attach_until_navigation",
]);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined)
    throw new TypeError("Browser approval payload must be JSON-compatible.");
  return serialized;
}

function hashBrowserApprovalPayload(value) {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function normalizePositiveInteger(value, fallback, maximum) {
  return Number.isSafeInteger(value) && value > 0 && value <= maximum
    ? value
    : fallback;
}

function normalizeOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:")
      throw new TypeError();
    return url.origin;
  } catch {
    throw createBrowserPublicError("NO_COMMITTED_ORIGIN");
  }
}

function normalizeDestination(value) {
  if (value === undefined) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return undefined;
  }
}

function normalizeId(value, name) {
  const result = browserTargetDescriptorSchema.safeParse({
    kind: "ref",
    ref: value,
  });
  if (!result.success) throw new TypeError(`Invalid Browser approval ${name}.`);
  return result.data.ref;
}

function normalizeBinding(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("A Browser approval binding is required.");
  }
  const target =
    value.target === undefined
      ? undefined
      : browserTargetDescriptorSchema.parse(value.target);
  const payloadHash = value.payloadHash;
  if (
    typeof payloadHash !== "string" ||
    !PAYLOAD_HASH_PATTERN.test(payloadHash)
  ) {
    throw new TypeError("A Browser approval payload hash is required.");
  }
  if (
    !Number.isSafeInteger(value.navigationGeneration) ||
    value.navigationGeneration < 0
  ) {
    throw new TypeError("Invalid Browser approval navigation generation.");
  }
  if (!Number.isSafeInteger(value.controlEpoch) || value.controlEpoch < 0) {
    throw new TypeError("Invalid Browser approval control epoch.");
  }
  const connectionId = normalizeId(value.connectionId, "connection");
  const owner = browserOwnerSchema.parse(value.owner);
  const destination = normalizeDestination(value.destination);
  if (
    (owner.kind === "mcp" || owner.kind === "nia" || owner.kind === "workflow")
    && owner.id !== connectionId
  ) {
    throw createBrowserPublicError("OWNER_MISMATCH");
  }
  return deepFreeze({
    action: browserToolActionSchema.parse(value.action),
    connectionId,
    controlEpoch: value.controlEpoch,
    ...(destination ? { destination } : {}),
    navigationGeneration: value.navigationGeneration,
    operation: browserAuthorityOperationSchema.parse(value.operation),
    origin: normalizeOrigin(value.origin),
    owner,
    payloadHash,
    tabId: normalizeId(value.tabId, "tab"),
    ...(target ? { target } : {}),
    windowId: normalizeId(value.windowId, "window"),
  });
}

function opaqueTargetProjection(approvalId, target) {
  if (!target) return undefined;
  const digest = createHash("sha256")
    .update("auris-browser-approval-target\0")
    .update(approvalId)
    .update("\0")
    .update(canonicalJson(target))
    .digest("hex")
    .slice(0, 24);
  return sanitizeBrowserApprovalTarget({
    kind: "ref",
    ref: `target-${digest}`,
  });
}

function sameText(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function bindingsMatch(left, right) {
  return sameText(canonicalJson(left), canonicalJson(right));
}

function createBrowserApprovalManager({
  grants = null,
  maxApprovalsPerConnection = DEFAULT_MAX_APPROVALS_PER_CONNECTION,
  maxPendingApprovals = DEFAULT_MAX_PENDING_APPROVALS,
  now = Date.now,
  randomBytes = systemRandomBytes,
  ttlMs = DEFAULT_APPROVAL_TTL_MS,
} = {}) {
  const limit = normalizePositiveInteger(
    maxPendingApprovals,
    DEFAULT_MAX_PENDING_APPROVALS,
    DEFAULT_MAX_PENDING_APPROVALS,
  );
  const lifetimeMs = normalizePositiveInteger(
    ttlMs,
    DEFAULT_APPROVAL_TTL_MS,
    BROWSER_CONTRACT_LIMITS.timeoutMs,
  );
  const perConnectionLimit = normalizePositiveInteger(
    maxApprovalsPerConnection,
    Math.min(DEFAULT_MAX_APPROVALS_PER_CONNECTION, limit),
    limit,
  );
  const entries = new Map();
  const listeners = new Set();

  function notify() {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        /* UI listeners own their failures. */
      }
    }
  }

  function remove(approvalId, { publish = true } = {}) {
    const entry = entries.get(approvalId);
    if (!entry) return false;
    clearTimeout(entry.timeout);
    entries.delete(approvalId);
    if (publish) notify();
    return true;
  }

  function purgeExpired() {
    const current = now();
    let changed = false;
    for (const [approvalId, entry] of entries) {
      if (entry.expiresAt <= current) {
        clearTimeout(entry.timeout);
        entries.delete(approvalId);
        changed = true;
      }
    }
    if (changed) notify();
  }

  function uniqueApprovalId() {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const bytes = randomBytes(24);
      if (!Buffer.isBuffer(bytes) || bytes.length < 24) {
        throw new TypeError("Browser approval randomness is unavailable.");
      }
      const id = bytes.subarray(0, 24).toString("hex");
      if (!entries.has(id)) return id;
    }
    throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
      capability: "browser-approval-id",
    });
  }

  function descriptorFor(approvalId, entry) {
    const target = opaqueTargetProjection(approvalId, entry.binding.target);
    return deepFreeze({
      action: entry.binding.action,
      approvalId,
      allowedDecisions: entry.allowedDecisions,
      ...(entry.binding.destination
        ? { destination: entry.binding.destination }
        : {}),
      expiresAt: entry.expiresAt,
      operation: entry.binding.operation,
      origin: entry.binding.origin,
      tabId: entry.binding.tabId,
      ...(target ? { target } : {}),
      windowId: entry.binding.windowId,
    });
  }

  function normalizeAllowedDecisions(value) {
    if (value === undefined) return Object.freeze(["deny", "allow_once"]);
    if (!Array.isArray(value) || value.length === 0) {
      throw new TypeError("Invalid Browser approval decision allowlist.");
    }
    const decisions = [];
    for (const decision of value) {
      if (!APPROVAL_DECISIONS.includes(decision)) {
        throw new TypeError("Invalid Browser approval decision allowlist.");
      }
      if (!decisions.includes(decision)) decisions.push(decision);
    }
    if (!decisions.includes("deny") || !decisions.includes("allow_once")) {
      throw new TypeError("Browser approvals must allow deny and allow_once.");
    }
    return Object.freeze(decisions);
  }

  function request(bindingInput, options = {}) {
    purgeExpired();
    const binding = normalizeBinding(bindingInput);
    const allowedDecisions = normalizeAllowedDecisions(
      options.allowedDecisions,
    );
    if (entries.size >= limit) {
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        capability: "browser-approval-limit",
      });
    }
    let connectionCount = 0;
    for (const entry of entries.values()) {
      if (entry.binding.connectionId === binding.connectionId)
        connectionCount += 1;
    }
    if (connectionCount >= perConnectionLimit) {
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        capability: "browser-approval-connection-limit",
      });
    }
    const approvalId = uniqueApprovalId();
    const expiresAt = now() + lifetimeMs;
    const entry = {
      allowedDecisions,
      binding,
      expiresAt,
      state: "pending",
      timeout: null,
    };
    entry.timeout = setTimeout(() => remove(approvalId), lifetimeMs);
    entry.timeout.unref?.();
    entries.set(approvalId, entry);
    const descriptor = descriptorFor(approvalId, entry);
    notify();
    return deepFreeze({ approvalId, descriptor });
  }

  function resolve(value) {
    purgeExpired();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError("Invalid Browser approval resolution.");
    }
    const approvalId = normalizeId(value.approvalId, "id");
    const windowId = normalizeId(value.windowId, "window");
    if (!APPROVAL_DECISIONS.includes(value.decision)) {
      throw new TypeError("Invalid Browser approval decision.");
    }
    const entry = entries.get(approvalId);
    if (
      !entry ||
      entry.state !== "pending" ||
      entry.binding.windowId !== windowId
    ) {
      throw createBrowserPublicError("APPROVAL_EXPIRED");
    }
    if (!entry.allowedDecisions.includes(value.decision)) {
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        capability: "browser-approval-decision",
        decision: value.decision,
      });
    }
    if (value.decision === "deny") {
      remove(approvalId);
      return deepFreeze({ allowed: false });
    }
    if (value.decision === "allow_standing") {
      if (!grants || typeof grants.grantStanding !== "function") {
        throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
          capability: "standing-grant",
        });
      }
      grants.grantStanding({
        operation: entry.binding.operation,
        origin: entry.binding.origin,
      });
    }
    if (
      value.decision === "attach_once" ||
      value.decision === "attach_until_navigation"
    ) {
      if (!grants || typeof grants.attach !== "function") {
        throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
          capability: "human-attachment",
        });
      }
      grants.attach({
        mode: value.decision === "attach_once" ? "once" : "until-navigation",
        navigationGeneration: entry.binding.navigationGeneration,
        tabId: entry.binding.tabId,
        windowId: entry.binding.windowId,
      });
    }
    entry.state = "approved";
    notify();
    return deepFreeze({ allowed: true, decision: value.decision });
  }

  function consume({ approvalId: inputId, binding: bindingInput } = {}) {
    purgeExpired();
    const approvalId = normalizeId(inputId, "id");
    const entry = entries.get(approvalId);
    if (!entry || entry.state !== "approved") {
      throw createBrowserPublicError("APPROVAL_EXPIRED");
    }
    const candidate = normalizeBinding(bindingInput);
    if (!bindingsMatch(entry.binding, candidate)) {
      throw createBrowserPublicError("PAYLOAD_MISMATCH", {
        action: candidate.action,
        operation: candidate.operation,
        origin: candidate.origin,
        tabId: candidate.tabId,
        windowId: candidate.windowId,
      });
    }
    // Delete before returning so re-entrant/concurrent retries can never share authority.
    remove(approvalId);
    return true;
  }

  function invalidate(predicate) {
    let changed = false;
    for (const [approvalId, entry] of entries) {
      if (predicate(entry.binding)) {
        clearTimeout(entry.timeout);
        entries.delete(approvalId);
        changed = true;
      }
    }
    if (changed) notify();
    return changed;
  }

  function snapshot({ windowId } = {}) {
    purgeExpired();
    const pendingApprovals = [];
    for (const [approvalId, entry] of entries) {
      if (entry.state !== "pending") continue;
      if (windowId !== undefined && entry.binding.windowId !== windowId)
        continue;
      pendingApprovals.push(descriptorFor(approvalId, entry));
    }
    pendingApprovals.sort((left, right) => left.expiresAt - right.expiresAt);
    return deepFreeze({ pendingApprovals });
  }

  function subscribe(listener) {
    if (typeof listener !== "function")
      throw new TypeError("Approval listener must be a function.");
    listeners.add(listener);
    let active = true;
    return () => {
      if (!active) return false;
      active = false;
      return listeners.delete(listener);
    };
  }

  return Object.freeze({
    cancelConnection: (connectionId) =>
      invalidate(
        (binding) =>
          binding.connectionId === connectionId ||
          binding.owner.id === connectionId,
      ),
    consume,
    controlChanged: (windowId, tabId) =>
      invalidate(
        (binding) => binding.windowId === windowId && binding.tabId === tabId,
      ),
    navigationChanged: (windowId, tabId) =>
      invalidate(
        (binding) => binding.windowId === windowId && binding.tabId === tabId,
      ),
    request,
    resolve,
    snapshot,
    subscribe,
    tabClosed: (windowId, tabId) =>
      invalidate(
        (binding) => binding.windowId === windowId && binding.tabId === tabId,
      ),
    windowClosed: (windowId) =>
      invalidate((binding) => binding.windowId === windowId),
  });
}

module.exports = {
  APPROVAL_DECISIONS,
  DEFAULT_APPROVAL_TTL_MS,
  DEFAULT_MAX_APPROVALS_PER_CONNECTION,
  DEFAULT_MAX_PENDING_APPROVALS,
  createBrowserApprovalManager,
  hashBrowserApprovalPayload,
};
