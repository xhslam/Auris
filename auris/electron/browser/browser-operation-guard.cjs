"use strict";

const {
  BrowserPublicError,
  browserActionRequestSchema,
  createBrowserPublicError,
  deriveBrowserAuthorityOperation,
} = require("../shared/browser-contract.cjs");
const {
  createBrowserApprovalManager,
  hashBrowserApprovalPayload,
} = require("./browser-approvals.cjs");
const { createBrowserLeaseManager } = require("./browser-lease.cjs");
const { getBrowserOperationPolicy } = require("./browser-operation-policy.cjs");
const { createBrowserNavigationPolicy } = require("./browser-navigation-policy.cjs");
const {
  computeAllowedApprovalDecisions,
  createBrowserGrantManager,
} = require("./browser-grants.cjs");
const { resolveOwnerKindFromConnectionId } = require("./browser-owner-kind.cjs");

function denied(code, metadata) {
  return Object.freeze({
    kind: "denied",
    error: createBrowserPublicError(code, metadata),
  });
}

function redactUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function committedOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.origin;
  } catch {
    return "";
  }
}

function requiresApproval(request, operation, policy) {
  if (policy.approvalClass === "none") return false;
  if (["click", "type", "scroll", "key", "style", "publish", "eval", "session", "upload"].includes(operation)) {
    return true;
  }
  if (operation === "navigate") return request.action === "navigate";
  if (operation === "attach") return request.action === "close";
  return policy.approvalClass !== "none";
}

function approvalDestination(request, tab) {
  if (request.action === "navigate") return redactUrl(request.url);
  if (request.action === "close" || request.action === "screenshot") return redactUrl(tab.url);
  return undefined;
}

function createBrowserOperationGuard({
  approvals = null,
  audit = null,
  grants = createBrowserGrantManager(),
  leases = createBrowserLeaseManager(),
  navigationPolicy = createBrowserNavigationPolicy(),
  registry,
  getCurrentControlEpoch = ({ tab }) => tab.controlEpoch,
} = {}) {
  if (!registry || typeof registry.getTab !== "function") {
    throw new TypeError("Browser operation guard requires a registry.");
  }
  const approvalManager = approvals || createBrowserApprovalManager({ grants });

  async function authorizeInner(command, context = {}) {
    try {
      if (!command || typeof command !== "object" || Array.isArray(command)) {
        return denied("CAPABILITY_NOT_VERIFIED", { capability: "browser-request" });
      }
      if (Object.hasOwn(command, "authorityOperation")) {
        return denied("CAPABILITY_NOT_VERIFIED", { capability: "caller-authority-operation" });
      }

      const parsed = browserActionRequestSchema.safeParse(command.request);
      if (!parsed.success) {
        return denied("CAPABILITY_NOT_VERIFIED", { capability: "browser-request" });
      }
      const request = parsed.data;
      const operation = deriveBrowserAuthorityOperation(request);
      const policy = getBrowserOperationPolicy(operation);
      const connectionId = context.connectionId;

      if (typeof connectionId !== "string" || connectionId.length === 0) {
        return denied("CAPABILITY_NOT_VERIFIED", { capability: "connection" });
      }
      if (context.signal?.aborted === true) {
        return denied("CANCELLED");
      }

      if (request.action === "get_state") {
        return Object.freeze({ kind: "allowed", operation, request, policy });
      }

      if (request.action === "open" || request.action === "acquire_control" || request.action === "release_control") {
        // Lifecycle commands keep their specialized dispatcher path; the guard
        // only validates the closed operation mapping for these actions.
        return Object.freeze({ kind: "allowed", operation, request, policy });
      }

      const control = command.control;
      if (!control || typeof control !== "object") return denied("LEASE_LOST");
      const tab = registry.getTab(control.windowId, control.tabId);
      if (!tab) return denied("TAB_NOT_FOUND", { tabId: control.tabId, windowId: control.windowId });

      const sourceControlEpoch = getCurrentControlEpoch({
        tab,
        tabId: control.tabId,
        windowId: control.windowId,
      });
      let lease;
      try {
        lease = leases.assertCurrent({ ...control, connectionId }, {
          currentControlEpoch: sourceControlEpoch,
          currentNavigationGeneration: tab.navigationGeneration,
        });
      } catch (error) {
        if (error instanceof BrowserPublicError) {
          return Object.freeze({ kind: "denied", error });
        }
        return denied("LEASE_LOST");
      }

      if (policy.humanOnly) {
        return denied("CAPABILITY_NOT_VERIFIED", { capability: "human-only-operation", operation });
      }

      const origin = committedOrigin(tab.url);
      if (!origin) return denied("NO_COMMITTED_ORIGIN");

      if (request.action === "navigate") {
        const destination = await navigationPolicy.resolveDestination(request.url);
        if (!destination.allowed) {
          return denied("CAPABILITY_NOT_VERIFIED", {
            capability: "ai-navigation",
            reason: destination.reason,
          });
        }
      }

      const humanTab = tab.automationMode === "Human";
      const needsAttachment = humanTab && (
        policy.requiresAttachment
        || policy.approvalClass !== "none"
        || request.action === "read"
        || request.action === "screenshot"
        || request.action === "query"
        || request.action === "console"
        || request.action === "wait"
        || request.action === "wait_for"
        || request.action === "focus"
      );
      const hasStanding = Boolean(
        grants
        && typeof grants.hasStandingGrant === "function"
        && policy.standingGrantable
        && grants.hasStandingGrant(origin, operation),
      );
      const operationNeedsApproval = requiresApproval(request, operation, policy);

      let approvedPayloadHash;
      if (operationNeedsApproval) {
        const payloadHash = hashBrowserApprovalPayload(request);
        const binding = {
          action: request.action,
          connectionId,
          controlEpoch: lease.controlEpoch,
          destination: approvalDestination(request, tab),
          navigationGeneration: lease.navigationGeneration,
          operation,
          origin,
          owner: {
            id: connectionId,
            kind: resolveOwnerKindFromConnectionId(connectionId),
          },
          payloadHash,
          tabId: lease.tabId,
          ...(request.target ? { target: request.target } : {}),
          windowId: lease.windowId,
        };
        if (command.approvalId !== undefined) {
          try {
            approvalManager.consume({ approvalId: command.approvalId, binding });
          } catch (error) {
            if (error instanceof BrowserPublicError) {
              return Object.freeze({ kind: "denied", error });
            }
            return denied("APPROVAL_EXPIRED");
          }
          approvedPayloadHash = payloadHash;
        } else if (hasStanding) {
          approvedPayloadHash = payloadHash;
        } else {
          const created = approvalManager.request(binding, {
            allowedDecisions: computeAllowedApprovalDecisions({
              automationMode: tab.automationMode,
              operation,
            }),
          });
          return Object.freeze({
            kind: "approval-required",
            operation,
            request,
            policy,
            approval: Object.freeze({
              approvalId: created.approvalId,
              descriptor: created.descriptor,
            }),
            binding: Object.freeze(binding),
            lease,
            sourceControlEpoch,
            tab,
            origin,
          });
        }
      } else if (command.approvalId !== undefined) {
        return denied("APPROVAL_EXPIRED");
      }

      if (needsAttachment) {
        try {
          grants.assertAttachment({
            navigationGeneration: tab.navigationGeneration,
            tabId: control.tabId,
            windowId: control.windowId,
          });
        } catch (error) {
          if (error instanceof BrowserPublicError) {
            return Object.freeze({ kind: "denied", error });
          }
          return denied("CAPABILITY_NOT_VERIFIED", { capability: "human-attachment" });
        }
      }

      // Final TOCTOU revalidation immediately before allowing execution.
      try {
        leases.assertCurrent({ ...control, connectionId }, {
          currentControlEpoch: getCurrentControlEpoch({
            tab: registry.getTab(control.windowId, control.tabId) ?? tab,
            tabId: control.tabId,
            windowId: control.windowId,
          }),
          currentNavigationGeneration:
            registry.getTab(control.windowId, control.tabId)?.navigationGeneration
            ?? tab.navigationGeneration,
        });
      } catch (error) {
        if (error instanceof BrowserPublicError) {
          return Object.freeze({ kind: "denied", error });
        }
        return denied("LEASE_LOST");
      }

      if (needsAttachment) {
        grants.consumeAttachmentOnce({
          tabId: control.tabId,
          windowId: control.windowId,
        });
      }

      return Object.freeze({
        kind: "allowed",
        operation,
        request,
        policy,
        lease,
        sourceControlEpoch,
        tab,
        origin,
        ...(approvedPayloadHash ? { approvedPayloadHash } : {}),
        ...(hasStanding ? { usedStandingGrant: true } : {}),
      });
    } catch (error) {
      if (error instanceof BrowserPublicError) {
        return Object.freeze({ kind: "denied", error });
      }
      return denied("CAPABILITY_NOT_VERIFIED");
    }
  }

  async function authorize(command, context = {}) {
    const decision = await authorizeInner(command, context);
    if (audit && typeof audit.appendFromAuthorizeDecision === "function") {
      try {
        audit.appendFromAuthorizeDecision(decision, {
          command,
          context: {
            ...context,
            hasStandingGrant: (origin, operation) =>
              Boolean(grants?.hasStandingGrant?.(origin, operation)),
            ...(decision?.usedStandingGrant === true
              ? { usedStandingGrant: true }
              : {}),
          },
        });
      } catch {
        /* Audit is diagnostics-only; never fail closed on telemetry. */
      }
    }
    return decision;
  }

  async function authorizeWorkflowApi(request, context = {}) {
    try {
      if (!request || typeof request !== "object" || !["read", "publish"].includes(request.operation)) {
        return denied("CAPABILITY_NOT_VERIFIED", { capability: "workflow-api-request" });
      }
      if (typeof context.connectionId !== "string" || !context.connectionId) return denied("CAPABILITY_NOT_VERIFIED", { capability: "connection" });
      const method = String(request.method || "").toUpperCase();
      const expectedOperation = method === "GET" || method === "HEAD" ? "read" : "publish";
      if (request.operation !== expectedOperation || !/^sha256:[a-f0-9]{64}$/u.test(request.bodyHash || "")) {
        return denied("PAYLOAD_MISMATCH");
      }
      const destination = new URL(request.destination);
      if (destination.protocol !== "https:" || destination.username || destination.password) {
        return denied("NAVIGATION_BLOCKED");
      }
      const control = request.control;
      const tab = control && registry.getTab(control.windowId, control.tabId);
      if (!tab) return denied("TAB_NOT_FOUND");
      const sourceControlEpoch = getCurrentControlEpoch({ tab, tabId: control.tabId, windowId: control.windowId });
      const lease = leases.assertCurrent({ ...control, connectionId: context.connectionId }, {
        currentControlEpoch: sourceControlEpoch,
        currentNavigationGeneration: tab.navigationGeneration,
      });
      if (request.operation === "publish") {
        const binding = {
          action: "act",
          connectionId: context.connectionId,
          controlEpoch: lease.controlEpoch,
          destination: destination.href,
          navigationGeneration: lease.navigationGeneration,
          operation: "publish",
          origin: destination.origin,
          owner: { kind: "workflow", id: context.connectionId },
          payloadHash: request.bodyHash,
          tabId: lease.tabId,
          windowId: lease.windowId,
        };
        if (!request.approvalId) {
          const created = approvalManager.request(binding, { allowedDecisions: ["deny", "allow_once"] });
          return Object.freeze({ kind: "approval-required", approval: created, binding: Object.freeze(binding) });
        }
        approvalManager.consume({ approvalId: request.approvalId, binding });
      } else if (request.approvalId) {
        return denied("APPROVAL_EXPIRED");
      }
      leases.assertCurrent({ ...control, connectionId: context.connectionId }, {
        currentControlEpoch: getCurrentControlEpoch({ tab: registry.getTab(control.windowId, control.tabId) ?? tab, tabId: control.tabId, windowId: control.windowId }),
        currentNavigationGeneration: registry.getTab(control.windowId, control.tabId)?.navigationGeneration ?? tab.navigationGeneration,
      });
      return Object.freeze({ kind: "allowed", operation: request.operation, lease });
    } catch (error) {
      if (error instanceof BrowserPublicError) return Object.freeze({ kind: "denied", error });
      return denied("CAPABILITY_NOT_VERIFIED", { capability: "workflow-api-authority" });
    }
  }

  return Object.freeze({ authorize, authorizeWorkflowApi });
}

module.exports = {
  createBrowserOperationGuard,
};
