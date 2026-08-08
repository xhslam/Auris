"use strict";

/**
 * Map a main-owned connectionId prefix to the Browser lease/approval owner kind.
 *
 * - MCP sidecar sockets use opaque UUIDs → "mcp"
 * - Workflow IPC uses notes:<id> / browser-chrome:<id> → "workflow"
 * - Nia chat tool loops use nia:<runId> → "nia"
 */

const OWNER_KINDS = Object.freeze(["mcp", "workflow", "nia"]);

function normalizeOwnerKind(value) {
  if (OWNER_KINDS.includes(value)) return value;
  return "mcp";
}

function resolveOwnerKindFromConnectionId(connectionId) {
  if (typeof connectionId !== "string" || connectionId.length === 0) {
    return "mcp";
  }
  if (connectionId.startsWith("nia:")) return "nia";
  if (
    connectionId.startsWith("notes:")
    || connectionId.startsWith("browser-chrome:")
    || connectionId.startsWith("workflow:")
  ) {
    return "workflow";
  }
  return "mcp";
}

module.exports = {
  OWNER_KINDS,
  normalizeOwnerKind,
  resolveOwnerKindFromConnectionId,
};
