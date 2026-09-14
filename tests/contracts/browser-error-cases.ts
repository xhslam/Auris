/**
 * Immutable public browser error fixtures for cross-runtime contract tests.
 */

import type { BrowserPublicErrorCode } from "../../src/features/browser/errors";

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

type BrowserErrorFixture = Readonly<{
  code: BrowserPublicErrorCode;
  metadata?: Readonly<Record<string, string | number>>;
}>;

/** Exhaustive public wire-error table — one fixture per frozen code. */
export const BROWSER_ERROR_CASES = deepFreeze<readonly BrowserErrorFixture[]>([
  { code: "BROWSER_DISABLED" },
  { code: "WINDOW_NOT_FOUND", metadata: { windowId: "window-missing" } },
  { code: "TAB_NOT_FOUND", metadata: { tabId: "tab-missing" } },
  {
    code: "AMBIGUOUS_TARGET",
    metadata: { action: "act", operation: "click", tabId: "tab-research" },
  },
  { code: "STALE_NAVIGATION", metadata: { tabId: "tab-research" } },
  { code: "CONTROL_STALE", metadata: { tabId: "tab-research" } },
  {
    code: "OWNER_MISMATCH",
    metadata: { tabId: "tab-research", action: "act" },
  },
  { code: "NO_COMMITTED_ORIGIN", metadata: { tabId: "tab-research" } },
  {
    code: "ORIGIN_NOT_GRANTED",
    metadata: { origin: "https://example.com", operation: "navigate" },
  },
  { code: "ATTACHMENT_REQUIRED", metadata: { action: "act", operation: "click" } },
  { code: "LEASE_LOST", metadata: { tabId: "tab-research" } },
  { code: "POLICY_STALE", metadata: { tabId: "tab-research" } },
  {
    code: "NAVIGATION_BLOCKED",
    metadata: { action: "navigate", operation: "navigate" },
  },
  {
    code: "OPERATION_NOT_ALLOWED",
    metadata: { operation: "eval", origin: "https://example.com" },
  },
  {
    code: "APPROVAL_REQUIRED",
    metadata: {
      action: "navigate",
      operation: "navigate",
      origin: "https://example.com",
      retryAfterMs: 2_000,
    },
  },
  {
    code: "APPROVAL_EXPIRED",
    metadata: { action: "act", operation: "click", origin: "https://example.com" },
  },
  {
    code: "PAYLOAD_MISMATCH",
    metadata: { action: "execute_js", operation: "eval" },
  },
  {
    code: "PROFILE_ORIGIN_CONFINED",
    metadata: { origin: "https://example.com" },
  },
  { code: "TIMEOUT", metadata: { action: "wait_for", retryAfterMs: 0 } },
  { code: "CANCELLED", metadata: { action: "act" } },
  { code: "CONNECTION_CLOSED" },
  { code: "PAGE_CRASHED", metadata: { tabId: "tab-research" } },
  { code: "SESSION_NOT_FOUND", metadata: { sessionId: "research-session" } },
  { code: "CAPABILITY_NOT_VERIFIED", metadata: { capability: "profile-restore" } },
  { code: "WORKFLOW_INVALID", metadata: { workflowId: "wf-demo" } },
  { code: "WORKFLOW_UNTRUSTED", metadata: { workflowId: "wf-demo" } },
  { code: "NIA_PROVIDER_UNAVAILABLE" },
  { code: "NIA_PROVIDER_RESPONSE_INVALID" },
]);

/** Values that must never appear in serialized public errors. */
export const BROWSER_ERROR_SECRET_REJECTIONS = deepFreeze([
  {
    name: "lease-token-in-metadata",
    code: "LEASE_LOST" as const,
    metadata: { leaseToken: "lease_should_not_leak" },
  },
  {
    name: "password-in-metadata",
    code: "OPERATION_NOT_ALLOWED" as const,
    metadata: { password: "hunter2" },
  },
]);

export function freezeBrowserErrorFixtures(): void {
  deepFreeze(BROWSER_ERROR_CASES);
  deepFreeze(BROWSER_ERROR_SECRET_REJECTIONS);
}
