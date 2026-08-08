import { z } from "zod";

import canonicalBrowserContract from "../shared/browser-contract.cjs";

export const {
  BROWSER_CONTRACT_LIMITS,
  BROWSER_TOOL_ACTIONS,
  browserActionRequestSchema,
  browserCommandEnvelopeSchema,
  browserToolActionSchema,
  createBrowserPublicError,
  createBrowserCommandEnvelope,
  serializeBrowserError,
} = canonicalBrowserContract;

// MCP `open` intentionally defaults to AiSandbox in the main dispatcher. Mode
// selection for Human/AiShared happens through trusted chrome createTab, not
// by caller-supplied relabel of an existing live tab.
export const BROWSER_DEFAULT_ACTION_TIMEOUT_MS = 12_000;
export const BROWSER_TRANSPORT_MARGIN_MS = 1_000;
export const BROWSER_ACTION_TIMEOUT_MS = Object.freeze(Object.fromEntries(
  BROWSER_TOOL_ACTIONS.map((action) => [action, BROWSER_DEFAULT_ACTION_TIMEOUT_MS]),
));

const CONTROL_KEYS = Object.freeze([
  "windowId",
  "tabId",
  "navigationGeneration",
  "controlEpoch",
  "leaseToken",
  "approvalId",
]);
const CONTROLLED_ACTIONS = new Set(
  BROWSER_TOOL_ACTIONS.filter((action) => !["get_state", "open", "acquire_control"].includes(action)),
);
const VALIDATION_CONTEXT = Object.freeze({
  windowId: "validation-window",
  tabId: "validation-tab",
  navigationGeneration: 0,
  controlEpoch: 0,
  owner: Object.freeze({ kind: "mcp", id: "mcp-sidecar-contract" }),
  leaseToken: "validation_lease_token_123456",
});
const BROWSER_HTTP_URL_JSON_SCHEMA_PATTERN = "^[Hh][Tt][Tt][Pp][Ss]?://(?![^/?#]*@)";

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function actionInputFromFlatInput(input) {
  return Object.fromEntries(
    Object.entries(input).filter(([key]) => !CONTROL_KEYS.includes(key)),
  );
}

function rejectPresentKeys(input, keys, action) {
  const present = keys.filter((key) => hasOwn(input, key));
  if (present.length > 0) {
    throw new TypeError(`${action} does not accept ${present.join(", ")}.`);
  }
}

export function parseBrowserToolInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Browser tool input must be an object.");
  }

  const flatInput = browserToolInputSchema.parse(input);
  const request = browserActionRequestSchema.parse(actionInputFromFlatInput(flatInput));

  if (request.action === "get_state" || request.action === "open") {
    rejectPresentKeys(input, CONTROL_KEYS, request.action);
    return Object.freeze({ request });
  }

  if (request.action === "acquire_control") {
    rejectPresentKeys(
      input,
      ["navigationGeneration", "controlEpoch", "leaseToken", "approvalId"],
      request.action,
    );
    const hasWindowId = hasOwn(input, "windowId");
    const hasTabId = hasOwn(input, "tabId");
    if (hasWindowId !== hasTabId) {
      throw new TypeError("acquire_control requires both windowId and tabId when targeting explicitly.");
    }
    if (!hasWindowId) return Object.freeze({ request });

    const target = Object.freeze({
      windowId: flatInput.windowId,
      tabId: flatInput.tabId,
    });
    return Object.freeze({ request, target });
  }

  if (!CONTROLLED_ACTIONS.has(request.action)) {
    throw new TypeError("Unsupported Browser tool action.");
  }

  const requiredControlKeys = CONTROL_KEYS.filter((key) => key !== "approvalId");
  const missing = requiredControlKeys.filter((key) => !hasOwn(input, key) || input[key] === undefined);
  if (missing.length > 0) {
    throw new TypeError(`${request.action} requires ${missing.join(", ")}.`);
  }

  const envelope = createBrowserCommandEnvelope({
    windowId: input.windowId,
    tabId: input.tabId,
    navigationGeneration: input.navigationGeneration,
    controlEpoch: input.controlEpoch,
    owner: VALIDATION_CONTEXT.owner,
    leaseToken: input.leaseToken,
  }, request);
  const control = Object.freeze({
    windowId: envelope.windowId,
    tabId: envelope.tabId,
    navigationGeneration: envelope.navigationGeneration,
    controlEpoch: envelope.controlEpoch,
    leaseToken: envelope.leaseToken,
  });

  if (!hasOwn(input, "approvalId")) return Object.freeze({ control, request });
  return Object.freeze({ approvalId: flatInput.approvalId, control, request });
}

const envelopeShape = browserCommandEnvelopeSchema.shape;
const controlledShape = Object.freeze({
  windowId: envelopeShape.windowId,
  tabId: envelopeShape.tabId,
  navigationGeneration: envelopeShape.navigationGeneration,
  controlEpoch: envelopeShape.controlEpoch,
  leaseToken: envelopeShape.leaseToken,
  approvalId: envelopeShape.windowId.optional(),
});
const acquireTargetShape = Object.freeze({
  windowId: envelopeShape.windowId,
  tabId: envelopeShape.tabId,
});

// Derive each public flat option from the canonical action option itself. This
// retains the exact Phase 1 field validators and refinements while adding only
// sidecar-owned targeting/control metadata from the canonical envelope schema.
const browserToolOptions = browserActionRequestSchema.options.flatMap((canonicalOption) => {
  const option = canonicalOption.shape.url
    ? canonicalOption.extend({
        url: canonicalOption.shape.url.describe(
          "Credential-free HTTP(S) URL; embedded usernames and passwords are prohibited.",
        ).meta({ pattern: BROWSER_HTTP_URL_JSON_SCHEMA_PATTERN }),
      })
    : canonicalOption;
  const action = option.shape.action.value;
  if (action === "get_state" || action === "open") return [option];
  if (action === "acquire_control") {
    return [option, option.extend(acquireTargetShape)];
  }
  return [option.extend(controlledShape)];
});

export const browserToolInputSchema = z.union(browserToolOptions);

// session_save / session_load are opaque-handle operations: MCP may observe the
// named reference plus count/capability flags, never cookie or storage values.

function optionalUnion(schemas) {
  const unique = [...new Set(schemas)];
  return (unique.length === 1 ? unique[0] : z.union(unique)).optional();
}

const actionFieldSchemas = new Map();
for (const option of browserActionRequestSchema.options) {
  for (const [field, schema] of Object.entries(option.shape)) {
    if (field === "action") continue;
    const schemas = actionFieldSchemas.get(field) ?? [];
    schemas.push(schema);
    actionFieldSchemas.set(field, schemas);
  }
}
const mcpDescriptionShape = {
  action: browserToolActionSchema,
  ...Object.fromEntries(
    [...actionFieldSchemas].map(([field, schemas]) => [field, optionalUnion(schemas)]),
  ),
  ...Object.fromEntries(
    Object.entries({ ...controlledShape, ...acquireTargetShape })
      .map(([field, schema]) => [field, schema.optional()]),
  ),
};
const browserToolAlternatives = z.toJSONSchema(browserToolInputSchema).anyOf;

// McpServer currently lists only object-shaped Zod schemas. Keep a typed
// object description for discovery, then enforce the derived discriminated
// union above as a refinement and again in the handler normalization step.
export const browserToolMcpInputSchema = z.object(mcpDescriptionShape).strict().superRefine(
  (value, context) => {
    const result = browserToolInputSchema.safeParse(value);
    if (result.success) return;
    for (const issue of result.error.issues) context.addIssue(issue);
  },
).meta({ anyOf: browserToolAlternatives });

export const BROWSER_TOOL_DESCRIPTION = [
  "Observe and control an Auris browser tab through the authenticated local bridge.",
  `Actions: ${BROWSER_TOOL_ACTIONS.join(", ")}.`,
  "Read current state before acting. Controlled actions require the current windowId, tabId, navigationGeneration, controlEpoch, and leaseToken.",
  "APPROVAL_REQUIRED is a completed response: ask the user to approve, then retry the same command with approvalId.",
].join("\n\n");

export function getBrowserActionTimeoutMs(requestInput) {
  const request = browserActionRequestSchema.parse(requestInput);
  if (request.action === "wait") return request.milliseconds;
  if (request.action === "wait_for" && request.timeoutMs !== undefined) return request.timeoutMs;
  return BROWSER_ACTION_TIMEOUT_MS[request.action];
}

export function getBrowserTransportTimeoutMs(requestInput) {
  return getBrowserActionTimeoutMs(requestInput) + BROWSER_TRANSPORT_MARGIN_MS;
}

export function createBrowserToolSuccessResult(result) {
  const text = JSON.stringify(result, null, 2);
  if (typeof text !== "string") {
    throw new TypeError("Browser result must be JSON-compatible.");
  }
  return {
    content: [{ text, type: "text" }],
  };
}

export function createBrowserToolErrorResult(error) {
  const payload = { ok: false, error: serializeBrowserError(error) };
  return {
    content: [{ text: JSON.stringify(payload, null, 2), type: "text" }],
    isError: true,
  };
}
