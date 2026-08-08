"use strict";

const { createHash } = require("node:crypto");

const MAX_BROWSER_AUDIT_ROWS = 256;
const OWNER_KINDS = Object.freeze(["mcp", "workflow", "nia", "unknown"]);
const DECISIONS = Object.freeze(["denied", "approval-required", "allowed"]);
const APPROVAL_KINDS = Object.freeze([
  "none",
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

function hashOpaqueId(value) {
  if (typeof value !== "string" || value.length === 0) return "";
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function redactedOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.origin;
  } catch {
    return "";
  }
}

function normalizeOwnerKind(value) {
  return OWNER_KINDS.includes(value) ? value : "unknown";
}

function normalizeApprovalKind(value) {
  return APPROVAL_KINDS.includes(value) ? value : "none";
}

function normalizeDecision(value) {
  return DECISIONS.includes(value) ? value : "denied";
}

function normalizeId(value) {
  if (typeof value !== "string") return "";
  if (!/^[A-Za-z0-9._:-]{1,128}$/u.test(value)) return "";
  return value;
}

function normalizeOperation(value) {
  if (typeof value !== "string") return "unknown";
  if (!/^[a-z_]{1,64}$/u.test(value)) return "unknown";
  return value;
}

function normalizeOutcome(value) {
  if (typeof value !== "string" || value.length === 0) return "ok";
  // Public browser error codes / short statuses only.
  if (!/^[A-Z0-9_]{1,64}$/u.test(value) && value !== "ok" && value !== "approval-required") {
    return "unknown";
  }
  return value.slice(0, 64);
}

function operationFromCommand(command) {
  const action = command?.request?.action;
  if (typeof action !== "string") return "unknown";
  switch (action) {
    case "get_state":
    case "wait":
    case "wait_for":
    case "read":
    case "query":
    case "console":
      return "read";
    case "screenshot":
      return command.request.publication === "evidence" ? "publish" : "read";
    case "open":
    case "navigate":
      return "navigate";
    case "acquire_control":
    case "release_control":
    case "close":
    case "focus":
      return "attach";
    case "act":
      return typeof command.request.variant === "string"
        ? command.request.variant
        : "unknown";
    case "style":
      return "style";
    case "execute_js":
      return "eval";
    case "session_save":
    case "session_load":
      return "session";
    default:
      return "unknown";
  }
}

function createBrowserAuditLog({
  database,
  now = () => new Date().toISOString(),
  maxRows = MAX_BROWSER_AUDIT_ROWS,
} = {}) {
  if (!database || typeof database.prepare !== "function") {
    throw new TypeError("Browser audit log requires a state database.");
  }
  if (!Number.isSafeInteger(maxRows) || maxRows < 1) {
    throw new TypeError("maxRows must be a positive integer.");
  }

  const insertStatement = database.prepare(`
    INSERT INTO browser_audit_records (
      recorded_at, owner_kind, connection_hash, run_hash,
      window_id, tab_id, origin, operation, decision, approval_kind, outcome
    ) VALUES (
      :recorded_at, :owner_kind, :connection_hash, :run_hash,
      :window_id, :tab_id, :origin, :operation, :decision, :approval_kind, :outcome
    );
  `);
  const pruneStatement = database.prepare(`
    DELETE FROM browser_audit_records
    WHERE rowid NOT IN (
      SELECT rowid FROM browser_audit_records ORDER BY rowid DESC LIMIT ?
    );
  `);
  const countStatement = database.prepare(
    "SELECT COUNT(*) AS total FROM browser_audit_records;",
  );
  const listStatement = database.prepare(`
    SELECT
      recorded_at AS recordedAt,
      owner_kind AS ownerKind,
      connection_hash AS connectionHash,
      run_hash AS runHash,
      window_id AS windowId,
      tab_id AS tabId,
      origin,
      operation,
      decision,
      approval_kind AS approvalKind,
      outcome
    FROM browser_audit_records
    ORDER BY rowid DESC
    LIMIT ?;
  `);

  function buildRecord(input = {}) {
    const runHash = hashOpaqueId(input.runId);
    return deepFreeze({
      approvalKind: normalizeApprovalKind(input.approvalKind),
      connectionHash: hashOpaqueId(input.connectionId),
      decision: normalizeDecision(input.decision),
      operation: normalizeOperation(input.operation),
      origin: redactedOrigin(input.origin),
      outcome: normalizeOutcome(input.outcome),
      ownerKind: normalizeOwnerKind(input.ownerKind),
      recordedAt: typeof input.recordedAt === "string" ? input.recordedAt : now(),
      ...(runHash ? { runHash } : {}),
      tabId: normalizeId(input.tabId) || undefined,
      windowId: normalizeId(input.windowId) || undefined,
    });
  }

  function append(input = {}) {
    const record = buildRecord(input);
    database.exec("BEGIN IMMEDIATE;");
    try {
      insertStatement.run({
        approval_kind: record.approvalKind,
        connection_hash: record.connectionHash,
        decision: record.decision,
        operation: record.operation,
        origin: record.origin,
        outcome: record.outcome,
        owner_kind: record.ownerKind,
        recorded_at: record.recordedAt,
        run_hash: record.runHash || "",
        tab_id: record.tabId || "",
        window_id: record.windowId || "",
      });
      pruneStatement.run(maxRows);
      database.exec("COMMIT;");
    } catch (error) {
      try {
        database.exec("ROLLBACK;");
      } catch {
        /* ignore */
      }
      throw error;
    }
    return record;
  }

  function appendFromAuthorizeDecision(decision, { command = {}, context = {} } = {}) {
    const connectionId = typeof context.connectionId === "string" ? context.connectionId : "";
    const runId = typeof context.runId === "string" ? context.runId : "";
    const ownerKind = decision?.binding?.owner?.kind
      || context.ownerKind
      || "mcp";

    let approvalKind = "none";
    let outcome = "ok";
    let operation = decision?.operation || operationFromCommand(command);
    let origin = decision?.origin || "";
    let windowId = decision?.lease?.windowId
      || decision?.binding?.windowId
      || command?.control?.windowId
      || "";
    let tabId = decision?.lease?.tabId
      || decision?.binding?.tabId
      || command?.control?.tabId
      || "";

    if (decision?.kind === "denied") {
      outcome = decision.error?.code || "CAPABILITY_NOT_VERIFIED";
    } else if (decision?.kind === "approval-required") {
      outcome = "approval-required";
    } else if (decision?.kind === "allowed") {
      if (decision.usedStandingGrant === true) {
        approvalKind = "allow_standing";
      } else if (command?.approvalId !== undefined) {
        approvalKind = "allow_once";
      }
      outcome = "ok";
    }

    // Prefer origin-only from decision; fall back to committed tab URL origin.
    if (!origin && decision?.tab?.url) {
      origin = redactedOrigin(decision.tab.url);
    }

    return append({
      approvalKind,
      connectionId,
      decision: decision?.kind || "denied",
      operation,
      origin,
      outcome,
      ownerKind,
      runId,
      tabId,
      windowId,
    });
  }

  function listRecent({ limit = 50 } = {}) {
    const capped = Number.isSafeInteger(limit)
      ? Math.min(Math.max(limit, 1), maxRows)
      : 50;
    return Object.freeze(
      listStatement.all(capped).map((row) => deepFreeze({
        approvalKind: row.approvalKind,
        connectionHash: row.connectionHash,
        decision: row.decision,
        operation: row.operation,
        origin: row.origin,
        outcome: row.outcome,
        ownerKind: row.ownerKind,
        recordedAt: row.recordedAt,
        ...(row.runHash ? { runHash: row.runHash } : {}),
        ...(row.tabId ? { tabId: row.tabId } : {}),
        ...(row.windowId ? { windowId: row.windowId } : {}),
      })),
    );
  }

  function count() {
    return Number(countStatement.get()?.total || 0);
  }

  return Object.freeze({
    append,
    appendFromAuthorizeDecision,
    buildRecord,
    count,
    listRecent,
    maxRows,
  });
}

module.exports = {
  APPROVAL_KINDS,
  DECISIONS,
  MAX_BROWSER_AUDIT_ROWS,
  OWNER_KINDS,
  createBrowserAuditLog,
  hashOpaqueId,
  redactedOrigin,
};
