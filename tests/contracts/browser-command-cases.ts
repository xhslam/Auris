/**
 * Immutable browser command / envelope fixtures for cross-runtime contract tests.
 * No runtime behavior — schemas and round-trips only.
 */

import type {
  BrowserActionRequest,
  BrowserCommandEnvelope,
} from "../../src/features/browser/contracts";

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

const targetRef = deepFreeze({ kind: "ref" as const, ref: "node-42" });
const targetSelector = deepFreeze({
  kind: "selector" as const,
  selector: "#submit",
});

const baseContext = deepFreeze({
  windowId: "window-main",
  tabId: "tab-research",
  navigationGeneration: 3,
  controlEpoch: 5,
  owner: { kind: "mcp" as const, id: "client-codex" },
  leaseToken: "lease_1234567890abcdef",
});

/** One accepted request fixture per tool action variant. */
export const BROWSER_COMMAND_REQUEST_CASES: readonly BrowserActionRequest[] =
  deepFreeze([
    { action: "get_state" },
    { action: "open", url: "https://example.com/notes" },
    { action: "acquire_control" },
    { action: "release_control" },
    { action: "close" },
    { action: "focus" },
    { action: "navigate", url: "https://example.com/research?q=auris" },
    { action: "wait", milliseconds: 250 },
    { action: "wait_for", target: targetRef, timeoutMs: 1_000 },
    { action: "read" },
    { action: "read", target: targetRef },
    { action: "screenshot" },
    { action: "screenshot", publication: "evidence" },
    { action: "query", target: targetRef },
    { action: "console", level: "error" },
    { action: "act", variant: "click", target: targetRef },
    { action: "act", variant: "type", target: targetRef, text: "Auris" },
    { action: "act", variant: "scroll", deltaX: 0, deltaY: 600 },
    { action: "act", variant: "key", key: "Enter" },
    { action: "style", target: targetSelector, css: "outline: 2px solid #647f71" },
    { action: "execute_js", source: "document.title" },
    { action: "session_save", name: "research-session" },
    { action: "session_load", name: "research-session" },
  ]);

/** Open + acquire envelopes used by later MCP attachment phases. */
export const BROWSER_OPEN_ACQUIRE_CASES = deepFreeze([
  {
    name: "open-public-url",
    context: baseContext,
    request: { action: "open" as const, url: "https://example.com/start" },
  },
  {
    name: "acquire-control",
    context: baseContext,
    request: { action: "acquire_control" as const },
  },
]);

/** Approval-retry shaped metadata (schema-level only; no runtime queue). */
export const BROWSER_APPROVAL_RETRY_CASES = deepFreeze([
  {
    name: "approval-required-with-retry",
    code: "APPROVAL_REQUIRED" as const,
    metadata: {
      action: "navigate",
      operation: "navigate",
      origin: "https://example.com",
      retryAfterMs: 1_500,
    },
  },
  {
    name: "approval-expired",
    code: "APPROVAL_EXPIRED" as const,
    metadata: {
      action: "act",
      operation: "click",
      origin: "https://example.com",
    },
  },
]);

/** Ambiguous target metadata — must remain schema-safe public fields only. */
export const BROWSER_AMBIGUOUS_TARGET_CASES = deepFreeze([
  {
    name: "ambiguous-ref",
    code: "AMBIGUOUS_TARGET" as const,
    metadata: {
      action: "act",
      operation: "click",
      windowId: "window-main",
      tabId: "tab-research",
    },
  },
]);

/** Evidence publication bundle shapes (payload hash bound; no binary bytes). */
export const BROWSER_EVIDENCE_BUNDLE_CASES = deepFreeze([
  {
    name: "screenshot-evidence",
    context: {
      ...baseContext,
      payloadHash:
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    },
    request: {
      action: "screenshot" as const,
      publication: "evidence" as const,
      target: targetRef,
    },
  },
]);

/** Expected envelope fields after createBrowserCommandEnvelope (no weaker authority). */
export const BROWSER_ENVELOPE_EXPECTATIONS = deepFreeze([
  {
    name: "eval-envelope",
    context: {
      ...baseContext,
      payloadHash:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
    request: { action: "execute_js" as const, source: "document.title" },
    authorityOperation: "eval" as const,
  },
  {
    name: "publish-envelope",
    context: {
      ...baseContext,
      payloadHash:
        "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    },
    request: {
      action: "screenshot" as const,
      publication: "evidence" as const,
    },
    authorityOperation: "publish" as const,
  },
]);

/** Requests that must be rejected by strict schemas. */
export const BROWSER_COMMAND_REJECTION_CASES = deepFreeze([
  {
    name: "unknown-field",
    value: { action: "get_state", extra: true },
  },
  {
    name: "credentialed-url",
    value: { action: "open", url: "https://user:pass@example.com/" },
  },
  {
    name: "ambiguous-target-both-kinds",
    value: {
      action: "query",
      target: { kind: "ref", ref: "node-1", selector: "#x" },
    },
  },
  {
    name: "caller-chosen-weaker-authority",
    value: {
      action: "execute_js",
      authorityOperation: "read",
      source: "document.cookie",
    },
  },
]);

export type BrowserEnvelopeCase = {
  name: string;
  envelope: BrowserCommandEnvelope;
};

export function freezeBrowserFixtures(): void {
  deepFreeze(BROWSER_COMMAND_REQUEST_CASES);
  deepFreeze(BROWSER_OPEN_ACQUIRE_CASES);
  deepFreeze(BROWSER_APPROVAL_RETRY_CASES);
  deepFreeze(BROWSER_AMBIGUOUS_TARGET_CASES);
  deepFreeze(BROWSER_EVIDENCE_BUNDLE_CASES);
  deepFreeze(BROWSER_ENVELOPE_EXPECTATIONS);
  deepFreeze(BROWSER_COMMAND_REJECTION_CASES);
}
