import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import {
  BROWSER_AUTHORITY_OPERATIONS,
  BROWSER_TOOL_ACTIONS,
  createBrowserCommandEnvelope,
  deriveBrowserAuthorityOperation,
  parseBrowserAuthorityOperation,
  parseBrowserCommandEnvelope,
  parseBrowserToolAction,
  type BrowserActionRequest,
} from "../../../src/features/browser/contracts";
import {
  BROWSER_CONTRACT_LIMITS,
  browserActionRequestSchema,
  browserCommandEnvelopeSchema,
  browserTargetDescriptorSchema,
} from "../../../src/features/browser/schemas";

const require = createRequire(import.meta.url);
const { createBrowserPublicError, serializeBrowserError } = require(
  "../../../electron/shared/browser-contract.cjs",
);

const ACTIONS = [
  "get_state",
  "open",
  "acquire_control",
  "release_control",
  "close",
  "focus",
  "navigate",
  "wait",
  "wait_for",
  "read",
  "screenshot",
  "query",
  "console",
  "act",
  "style",
  "execute_js",
  "session_save",
  "session_load",
] as const;

const OPERATIONS = [
  "read",
  "attach",
  "click",
  "type",
  "scroll",
  "key",
  "style",
  "navigate",
  "publish",
  "upload",
  "eval",
  "session",
] as const;

const target = { kind: "ref", ref: "node-42" } as const;
const opaqueApprovalTarget = { kind: "ref", ref: `target-${"a".repeat(24)}` } as const;

const requests: readonly BrowserActionRequest[] = [
  { action: "get_state" },
  { action: "open", url: "https://example.com/notes" },
  { action: "acquire_control" },
  { action: "release_control" },
  { action: "close" },
  { action: "focus" },
  { action: "navigate", url: "https://example.com/research?q=auris" },
  { action: "wait", milliseconds: 250 },
  { action: "wait_for", target, timeoutMs: 1_000 },
  { action: "read" },
  { action: "screenshot" },
  { action: "screenshot", publication: "evidence" },
  { action: "query", target },
  { action: "console", level: "error" },
  { action: "act", variant: "click", target },
  { action: "act", variant: "type", target, text: "Auris" },
  { action: "act", variant: "scroll", deltaX: 0, deltaY: 600 },
  { action: "act", variant: "key", key: "Enter" },
  { action: "style", target, css: "outline: 2px solid #647f71" },
  { action: "execute_js", source: "document.title" },
  { action: "session_save", name: "research-session" },
  { action: "session_load", name: "research-session" },
];

describe("browser approval public metadata", () => {
  it("round-trips only the safe approval retry descriptor", () => {
    const serialized = serializeBrowserError(createBrowserPublicError("APPROVAL_REQUIRED", {
      action: "act",
      approvalId: "approval-one",
      controlEpoch: 9,
      destination: "https://docs.example/next?private=value#fragment",
      leaseToken: "lease-secret-value",
      operation: "type",
      origin: "https://example.com/path?secret=yes",
      payloadHash: "sha256:" + "a".repeat(64),
      retryAfterMs: 30_000,
      tabId: "browser-tab-1",
      target: opaqueApprovalTarget,
      text: "private typed value",
      windowId: "browser-window-1",
    }));

    expect(serialized).toEqual({
      code: "APPROVAL_REQUIRED",
      message: expect.any(String),
      metadata: {
        action: "act",
        approvalId: "approval-one",
        destination: "https://docs.example/next",
        operation: "type",
        origin: "https://example.com",
        retryAfterMs: 30_000,
        tabId: "browser-tab-1",
        target: opaqueApprovalTarget,
        windowId: "browser-window-1",
      },
    });
    expect(JSON.stringify(serialized)).not.toMatch(/private|payloadHash|lease|secret/i);
    expect(Object.isFrozen(serialized.metadata.target)).toBe(true);
  });

  it("drops hostile or secret-bearing approval target projections", () => {
    for (const targetValue of [
      { kind: "selector", selector: "[data-token='secret-value']" },
      { kind: "selector", selector: "x".repeat(513) },
      { kind: "ref", ref: "ref-ok", extra: "secret" },
      { kind: "ref", ref: "bank-transfer-confirm" },
      { kind: "ref", ref: "target-not-an-opaque-alias" },
      Object.defineProperty({}, "kind", { get() { throw new Error("secret getter"); } }),
    ]) {
      const serialized = serializeBrowserError(createBrowserPublicError("APPROVAL_REQUIRED", {
        action: "navigate",
        approvalId: "approval-two",
        operation: "navigate",
        origin: "https://example.com",
        target: targetValue,
      }));
      expect(serialized.metadata).not.toHaveProperty("target");
      expect(JSON.stringify(serialized)).not.toMatch(/secret-value|secret getter/i);
    }
  });

  it("never serializes selector targets in approval metadata", () => {
    const serialized = serializeBrowserError(createBrowserPublicError("APPROVAL_REQUIRED", {
      action: "act",
      approvalId: "approval-selector",
      operation: "click",
      origin: "https://example.com",
      target: { kind: "selector", selector: "input[value='hunter2']" },
    }));
    expect(serialized.metadata).not.toHaveProperty("target");
    expect(JSON.stringify(serialized)).not.toContain("hunter2");
  });

  it("drops every raw or malformed ref projection from approval metadata", () => {
    for (const targetValue of [
      { kind: "ref", ref: "password-field" },
      { kind: "ref", ref: "hunter2" },
      { kind: "ref", ref: `r${"x".repeat(128)}` },
      { kind: "ref", ref: `target-${"a".repeat(23)}` },
      { kind: "ref", ref: `target-${"g".repeat(24)}` },
    ]) {
      const serialized = serializeBrowserError(createBrowserPublicError("APPROVAL_REQUIRED", {
        action: "act",
        approvalId: "approval-ref",
        operation: "click",
        origin: "https://example.com",
        target: targetValue,
      }));
      expect(serialized.metadata).not.toHaveProperty("target");
    }
  });

  it("does not expose approval retry fields on unrelated public errors", () => {
    const serialized = serializeBrowserError(createBrowserPublicError("TIMEOUT", {
      approvalId: "approval-one",
      destination: "https://example.com/next",
      target: { kind: "ref", ref: "ref-one" },
    }));
    expect(serialized).toEqual({ code: "TIMEOUT", message: expect.any(String) });
  });

  it("surfaces capability-specific CAPABILITY_NOT_VERIFIED guidance", () => {
    const disabled = createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
      capability: "browser-automation-disabled",
    });
    expect(disabled.message).toMatch(/启用 MCP 浏览器自动化/u);
    expect(serializeBrowserError(disabled)).toMatchObject({
      code: "CAPABILITY_NOT_VERIFIED",
      message: expect.stringMatching(/启用 MCP 浏览器自动化/u),
      metadata: { capability: "browser-automation-disabled" },
    });

    const replay = createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
      capability: "session-replay",
    });
    expect(serializeBrowserError(replay).message).toMatch(/会话回放/u);
  });
});

describe("browser contract vocabulary", () => {
  it("freezes the exact tool action vocabulary", () => {
    expect(BROWSER_TOOL_ACTIONS).toEqual(ACTIONS);
    expect(Object.isFrozen(BROWSER_TOOL_ACTIONS)).toBe(true);
    for (const action of ACTIONS) expect(parseBrowserToolAction(action)).toBe(action);
  });

  it.each(["GET_STATE", " get_state", "get_state ", "publish", "upload", ""])(
    "rejects invalid tool action %j",
    (action) => expect(() => parseBrowserToolAction(action)).toThrow(),
  );

  it("freezes the exact authority operation vocabulary", () => {
    expect(BROWSER_AUTHORITY_OPERATIONS).toEqual(OPERATIONS);
    expect(Object.isFrozen(BROWSER_AUTHORITY_OPERATIONS)).toBe(true);
    for (const operation of OPERATIONS) {
      expect(parseBrowserAuthorityOperation(operation)).toBe(operation);
    }
  });

  it.each(["READ", " read", "read ", "execute_js", ""])(
    "rejects invalid authority operation %j",
    (operation) => expect(() => parseBrowserAuthorityOperation(operation)).toThrow(),
  );
});

describe("main-owned authority normalization", () => {
  it.each([
    [{ action: "get_state" }, "read"],
    [{ action: "wait", milliseconds: 1 }, "read"],
    [{ action: "wait_for", target }, "read"],
    [{ action: "read" }, "read"],
    [{ action: "screenshot" }, "read"],
    [{ action: "query", target }, "read"],
    [{ action: "console" }, "read"],
    [{ action: "open", url: "https://example.com" }, "navigate"],
    [{ action: "acquire_control" }, "attach"],
    [{ action: "release_control" }, "attach"],
    [{ action: "close" }, "attach"],
    [{ action: "focus" }, "attach"],
    [{ action: "navigate", url: "https://example.com" }, "navigate"],
    [{ action: "style", target, css: "color: green" }, "style"],
    [{ action: "execute_js", source: "1 + 1" }, "eval"],
    [{ action: "session_save", name: "one" }, "session"],
    [{ action: "session_load", name: "one" }, "session"],
    [{ action: "act", variant: "click", target }, "click"],
    [{ action: "act", variant: "type", target, text: "hello" }, "type"],
    [{ action: "act", variant: "scroll", deltaY: 1 }, "scroll"],
    [{ action: "act", variant: "key", key: "Escape" }, "key"],
    [{ action: "screenshot", publication: "evidence" }, "publish"],
  ] as const)("derives $1 for $0", (request, operation) => {
    expect(deriveBrowserAuthorityOperation(request)).toBe(operation);
  });

  it("has no autonomous upload action", () => {
    expect(requests.map((request) => deriveBrowserAuthorityOperation(request))).not.toContain(
      "upload",
    );
  });

  it("rejects caller-supplied authorityOperation instead of accepting a weaker guard", () => {
    expect(() =>
      browserActionRequestSchema.parse({
        action: "execute_js",
        authorityOperation: "read",
        source: "document.cookie",
      }),
    ).toThrow();
  });

  it("derives and then rechecks authority inside the command envelope", () => {
    const envelope = createBrowserCommandEnvelope(
      {
        windowId: "window-main",
        tabId: "tab-research",
        navigationGeneration: 3,
        controlEpoch: 5,
        owner: { kind: "mcp", id: "client-codex" },
        leaseToken: "lease_1234567890abcdef",
        payloadHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      { action: "execute_js", source: "document.title" },
    );

    expect(envelope.authorityOperation).toBe("eval");
    expect(parseBrowserCommandEnvelope(envelope)).toEqual(envelope);
    expect(() => parseBrowserCommandEnvelope({ ...envelope, authorityOperation: "read" })).toThrow();
  });
});

describe("strict browser schemas", () => {
  it.each(requests)("accepts the structured $action request", (request) => {
    expect(browserActionRequestSchema.parse(request)).toEqual(request);
  });

  it.each([
    {},
    { action: "navigate" },
    { action: "navigate", url: "not a url" },
    { action: "navigate", url: "https://user:pass@example.com/x" },
    { action: "open", url: "https://user@example.com/" },
    { action: "act", variant: "double_click", target },
    { action: "act", variant: "type", target },
    { action: "act", variant: "key", key: "" },
    { action: "act", variant: "key", key: "Ent\u0000er" },
    { action: "act", variant: "type", target, text: "line\u0000break" },
    { action: "act", variant: "scroll" },
    { action: "act", variant: "scroll", deltaX: 0, deltaY: 0 },
    { action: "act", variant: "scroll", deltaY: Number.NaN },
    { action: "act", variant: "scroll", deltaY: Number.POSITIVE_INFINITY },
    { action: "session_save", name: "a\u0000b" },
    { action: "style", target, css: "color:\u0000red" },
    { action: "execute_js", source: "1\u0000+1" },
    { action: "get_state", extra: true },
    { action: "wait", milliseconds: -1 },
  ])("rejects malformed requests", (request) => {
    expect(browserActionRequestSchema.safeParse(request).success).toBe(false);
  });

  it("allows multiline type/css/script while rejecting identifier controls", () => {
    expect(browserActionRequestSchema.safeParse({
      action: "act",
      variant: "type",
      target,
      text: "line one\nline two\tindented",
    }).success).toBe(true);
    expect(browserActionRequestSchema.safeParse({
      action: "style",
      target,
      css: "color: red;\noutline: 1px solid green;",
    }).success).toBe(true);
    expect(browserActionRequestSchema.safeParse({
      action: "execute_js",
      source: "const x = 1;\nreturn x;",
    }).success).toBe(true);
  });

  it("derives publish for evidence screenshots and rejects caller-supplied authority on the request", () => {
    const context = {
      windowId: "window-main",
      tabId: "tab-main",
      navigationGeneration: 1,
      controlEpoch: 1,
      owner: { kind: "mcp" as const, id: "client-codex" },
      leaseToken: "lease_1234567890abcdef",
    };
    const envelope = createBrowserCommandEnvelope(context, {
      action: "screenshot",
      publication: "evidence",
    });
    expect(envelope.authorityOperation).toBe("publish");
    expect(() => browserActionRequestSchema.parse({
      action: "screenshot",
      publication: "evidence",
      authorityOperation: "read",
    })).toThrow();
    // Envelope schema still permits screenshot+read for non-evidence captures.
    expect(browserCommandEnvelopeSchema.safeParse({
      ...envelope,
      authorityOperation: "read",
    }).success).toBe(true);
    expect(browserCommandEnvelopeSchema.safeParse({
      ...envelope,
      authorityOperation: "eval",
    }).success).toBe(false);
  });

  it("rejects ambiguous targets and extra target keys", () => {
    expect(browserTargetDescriptorSchema.safeParse({ ref: "one", selector: "#two" }).success).toBe(false);
    expect(
      browserTargetDescriptorSchema.safeParse({ kind: "ref", ref: "one", selector: "#two" }).success,
    ).toBe(false);
    expect(browserTargetDescriptorSchema.safeParse({ kind: "selector", selector: "#two" }).success).toBe(true);
  });

  it("enforces selector, text, key, URL, and script boundaries", () => {
    const limits = BROWSER_CONTRACT_LIMITS;
    const exactUrl = `https://e.co/${"x".repeat(limits.url - "https://e.co/".length)}`;
    expect(browserTargetDescriptorSchema.safeParse({ kind: "selector", selector: "x".repeat(limits.selector) }).success).toBe(true);
    expect(browserTargetDescriptorSchema.safeParse({ kind: "selector", selector: "x".repeat(limits.selector + 1) }).success).toBe(false);
    expect(browserActionRequestSchema.safeParse({ action: "act", variant: "type", target, text: "x".repeat(limits.text) }).success).toBe(true);
    expect(browserActionRequestSchema.safeParse({ action: "act", variant: "type", target, text: "x".repeat(limits.text + 1) }).success).toBe(false);
    expect(browserActionRequestSchema.safeParse({ action: "act", variant: "key", key: "x".repeat(limits.key) }).success).toBe(true);
    expect(browserActionRequestSchema.safeParse({ action: "act", variant: "key", key: "x".repeat(limits.key + 1) }).success).toBe(false);
    expect(browserActionRequestSchema.safeParse({ action: "navigate", url: exactUrl }).success).toBe(true);
    expect(browserActionRequestSchema.safeParse({ action: "navigate", url: `https://example.com/${"x".repeat(limits.url)}` }).success).toBe(false);
    expect(browserActionRequestSchema.safeParse({ action: "execute_js", source: "x".repeat(limits.script) }).success).toBe(true);
    expect(browserActionRequestSchema.safeParse({ action: "execute_js", source: "x".repeat(limits.script + 1) }).success).toBe(false);
  });

  it("rejects missing IDs, negative counters, malformed tokens, and extra envelope keys", () => {
    const valid = {
      windowId: "window-main",
      tabId: "tab-main",
      navigationGeneration: 0,
      controlEpoch: 0,
      owner: { kind: "workflow", id: "workflow-one" },
      leaseToken: "lease_1234567890abcdef",
      action: "read",
      authorityOperation: "read",
    };
    expect(browserCommandEnvelopeSchema.safeParse(valid).success).toBe(true);
    for (const invalid of [
      { ...valid, windowId: "" },
      { ...valid, tabId: undefined },
      { ...valid, navigationGeneration: -1 },
      { ...valid, controlEpoch: -1 },
      { ...valid, leaseToken: "short" },
      { ...valid, leaseToken: "lease_1234567890ab\u0000cdef" },
      { ...valid, extra: true },
      { ...valid, owner: { ...valid.owner, extra: true } },
    ]) expect(browserCommandEnvelopeSchema.safeParse(invalid).success).toBe(false);
  });
});
