import { describe, expect, it } from "vitest";
import { z } from "zod";

import canonical from "../../../../electron/shared/browser-contract.cjs";
import {
  BROWSER_ACTION_TIMEOUT_MS,
  BROWSER_DEFAULT_ACTION_TIMEOUT_MS,
  BROWSER_TRANSPORT_MARGIN_MS,
  BROWSER_TOOL_ACTIONS,
  browserActionRequestSchema,
  browserCommandEnvelopeSchema,
  browserToolInputSchema,
  createBrowserToolErrorResult,
  createBrowserToolSuccessResult,
  getBrowserActionTimeoutMs,
  getBrowserTransportTimeoutMs,
  parseBrowserToolInput,
} from "../../../../electron/mcp/browser-tool-contract.mjs";

const ref = { kind: "ref", ref: "node-42" } as const;
const selector = { kind: "selector", selector: "#submit" } as const;
const control = {
  windowId: "window-main",
  tabId: "tab-research",
  navigationGeneration: 3,
  controlEpoch: 5,
  leaseToken: "lease_1234567890abcdef",
};

const requestCases = [
  { action: "get_state" },
  { action: "open", url: "https://example.com/notes" },
  { action: "acquire_control" },
  { action: "acquire_control", windowId: "window-main", tabId: "tab-research" },
  { action: "release_control", ...control },
  { action: "close", ...control },
  { action: "focus", ...control },
  { action: "navigate", url: "https://example.com/research", ...control },
  { action: "wait", milliseconds: 250, ...control },
  { action: "wait_for", target: ref, timeoutMs: 1_000, ...control },
  { action: "read", ...control },
  { action: "read", target: ref, ...control },
  { action: "screenshot", publication: "evidence", ...control },
  { action: "query", target: selector, ...control },
  { action: "console", level: "error", ...control },
  { action: "act", variant: "click", target: ref, ...control },
  { action: "act", variant: "type", target: ref, text: "Auris", ...control },
  { action: "act", variant: "scroll", deltaX: 0, deltaY: 600, ...control },
  { action: "act", variant: "key", key: "Enter", ...control },
  { action: "style", target: selector, css: "outline: 2px solid green", ...control },
  { action: "execute_js", source: "document.title", ...control },
  { action: "session_save", name: "research-session", ...control },
  { action: "session_load", name: "research-session", approvalId: "approval-one", ...control },
] as const;

describe("Browser MCP ESM contract adapter", () => {
  it("reuses canonical Phase 1 vocabulary and validators by identity", () => {
    expect(BROWSER_TOOL_ACTIONS).toBe(canonical.BROWSER_TOOL_ACTIONS);
    expect(browserActionRequestSchema).toBe(canonical.browserActionRequestSchema);
    expect(browserCommandEnvelopeSchema).toBe(canonical.browserCommandEnvelopeSchema);
  });

  it.each(requestCases)("accepts and normalizes the strict flat $action input", (input) => {
    const normalized = parseBrowserToolInput(input);

    expect(normalized.request).toEqual(
      canonical.browserActionRequestSchema.parse(
        Object.fromEntries(
          Object.entries(input).filter(([key]) => ![
            "windowId",
            "tabId",
            "navigationGeneration",
            "controlEpoch",
            "leaseToken",
            "approvalId",
          ].includes(key)),
        ),
      ),
    );
  });

  it("publishes a derived discriminated JSON schema with typed canonical fields", () => {
    const schema = z.toJSONSchema(browserToolInputSchema) as {
      anyOf: Array<{
        additionalProperties: boolean;
        properties: Record<string, { const?: string; maxLength?: number; type?: string }>;
        required: string[];
      }>;
    };

    expect(schema.anyOf).toHaveLength(canonical.browserActionRequestSchema.options.length + 1);
    expect(schema.anyOf.every((option) => option.additionalProperties === false)).toBe(true);
    const getState = schema.anyOf.find((option) => option.properties.action.const === "get_state");
    expect(getState?.properties).not.toHaveProperty("windowId");
    const open = schema.anyOf.find((option) => option.properties.action.const === "open");
    expect(open?.properties.url).toMatchObject({ maxLength: canonical.BROWSER_CONTRACT_LIMITS.url, type: "string" });
    expect(open?.properties.url).toMatchObject({
      description: expect.stringContaining("Credential-free HTTP(S)"),
    });
    expect(schema.anyOf.filter((option) => option.properties.action.const === "acquire_control")
      .map(({ required }) => required)).toEqual([
      ["action"],
      ["action", "windowId", "tabId"],
    ]);
    const executeJs = schema.anyOf.find((option) => option.properties.action.const === "execute_js");
    expect(executeJs?.properties.source).toMatchObject({
      maxLength: canonical.BROWSER_CONTRACT_LIMITS.script,
      type: "string",
    });
    expect(executeJs?.required).toEqual(expect.arrayContaining([
      "action",
      "source",
      "windowId",
      "tabId",
      "navigationGeneration",
      "controlEpoch",
      "leaseToken",
    ]));
  });

  it("rejects unknown keys and never accepts caller-owned authority", () => {
    for (const invalid of [
      { action: "get_state", extra: true },
      { action: "open", url: "https://example.com", owner: { kind: "mcp", id: "forged" } },
      { action: "execute_js", source: "document.title", authorityOperation: "read", ...control },
      { action: "read", ...control, control: { owner: "caller" } },
    ]) expect(() => parseBrowserToolInput(invalid)).toThrow();
  });

  it("enforces no-control, target-pair, and complete controlled-action families", () => {
    for (const invalid of [
      { action: "get_state", windowId: "window-main" },
      { action: "open", url: "https://example.com", leaseToken: control.leaseToken },
      { action: "acquire_control", windowId: "window-main" },
      { action: "acquire_control", ...control },
      { action: "read" },
      { action: "wait_for", ...control },
      { action: "query", ...control },
      { action: "act", variant: "click", ...control },
      { action: "act", variant: "type", target: ref, ...control },
      { action: "style", css: "color: green", ...control },
      { action: "focus", ...control, leaseToken: undefined },
      { action: "navigate", url: "https://example.com", ...control, controlEpoch: undefined },
      { action: "release_control", ...control, navigationGeneration: undefined },
    ]) expect(() => parseBrowserToolInput(invalid)).toThrow();
  });

  it("validates target and control envelopes with the canonical bounds", () => {
    const limits = canonical.BROWSER_CONTRACT_LIMITS;
    expect(() => parseBrowserToolInput({
      action: "query",
      target: { kind: "selector", selector: "x".repeat(limits.selector) },
      ...control,
    })).not.toThrow();

    for (const invalid of [
      { action: "query", target: { kind: "selector", selector: "x".repeat(limits.selector + 1) }, ...control },
      { action: "act", variant: "type", target: ref, text: "x".repeat(limits.text + 1), ...control },
      { action: "style", target: ref, css: "x".repeat(limits.css + 1), ...control },
      { action: "execute_js", source: "x".repeat(limits.script + 1), ...control },
      { action: "navigate", url: `https://e.co/${"x".repeat(limits.url)}`, ...control },
      { action: "read", ...control, windowId: "x".repeat(limits.id + 1) },
      { action: "read", ...control, leaseToken: "short" },
      { action: "read", ...control, navigationGeneration: -1 },
    ]) expect(() => parseBrowserToolInput(invalid)).toThrow();
  });

  it("keeps approvalId retry metadata outside the canonical action and command envelope", () => {
    const normalized = parseBrowserToolInput({
      action: "act",
      variant: "click",
      target: ref,
      approvalId: "approval-one",
      ...control,
    });

    expect(normalized.approvalId).toBe("approval-one");
    expect(normalized.request).not.toHaveProperty("approvalId");
    expect(normalized.control).not.toHaveProperty("approvalId");
    expect(normalized).not.toHaveProperty("envelope");
  });

  it("defines an explicit timeout for every canonical Browser action", () => {
    expect(Object.isFrozen(BROWSER_ACTION_TIMEOUT_MS)).toBe(true);
    expect(Object.keys(BROWSER_ACTION_TIMEOUT_MS).sort()).toEqual([...BROWSER_TOOL_ACTIONS].sort());
    expect(Object.values(BROWSER_ACTION_TIMEOUT_MS)).toEqual(
      BROWSER_TOOL_ACTIONS.map(() => BROWSER_DEFAULT_ACTION_TIMEOUT_MS),
    );
    expect(BROWSER_DEFAULT_ACTION_TIMEOUT_MS).toBe(12_000);
    expect(BROWSER_TRANSPORT_MARGIN_MS).toBe(1_000);
  });

  it.each([
    [{ action: "get_state" }, 12_000],
    [{ action: "wait", milliseconds: 0 }, 0],
    [{ action: "wait", milliseconds: 120_000 }, 120_000],
    [{ action: "wait_for", target: ref }, 12_000],
    [{ action: "wait_for", target: ref, timeoutMs: 45_000 }, 45_000],
  ] as const)("derives action and transport timeout for %j", (request, expected) => {
    expect(getBrowserActionTimeoutMs(request)).toBe(expected);
    expect(getBrowserTransportTimeoutMs(request)).toBe(expected + BROWSER_TRANSPORT_MARGIN_MS);
    expect(getBrowserActionTimeoutMs(request)).toBeLessThan(getBrowserTransportTimeoutMs(request));
  });

  it("returns JSON-safe public Browser error shapes without leaking internal details", () => {
    const success = createBrowserToolSuccessResult({ ok: true, result: { title: "Untrusted page" } });
    expect(success).toEqual({
      content: [{
        text: JSON.stringify({ ok: true, result: { title: "Untrusted page" } }, null, 2),
        type: "text",
      }],
      structuredContent: {
        result: { ok: true, result: { title: "Untrusted page" } },
      },
    });
    expect(() => createBrowserToolSuccessResult(undefined)).toThrow("JSON-compatible");
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => createBrowserToolSuccessResult(circular)).toThrow();

    const internal = createBrowserToolErrorResult(new Error("secret token=do-not-leak"));
    const parsed = JSON.parse(internal.content[0].text);

    expect(internal.isError).toBe(true);
    expect(parsed).toEqual({
      ok: false,
      error: {
        code: "CAPABILITY_NOT_VERIFIED",
        message: canonical.BROWSER_ERROR_MESSAGES_ZH.CAPABILITY_NOT_VERIFIED,
      },
    });
    expect(internal.content[0].text).not.toContain("do-not-leak");

    const publicError = canonical.createBrowserPublicError("TIMEOUT", {
      action: "wait_for",
      retryAfterMs: 500,
      leaseToken: "lease_must_not_leak",
    });
    expect(JSON.parse(createBrowserToolErrorResult(publicError).content[0].text)).toEqual({
      ok: false,
      error: {
        code: "TIMEOUT",
        message: canonical.BROWSER_ERROR_MESSAGES_ZH.TIMEOUT,
        metadata: { action: "wait_for", retryAfterMs: 500 },
      },
    });
  });

  it("serializes bounded, deeply frozen ambiguity targets with four safe fields only", () => {
    const targets = Array.from({ length: 40 }, (_, index) => ({
      windowId: `window-${index}`,
      tabId: `tab-${index}`,
      title: `Research ${index}`,
      url: `https://user:pass@example.com/path/${index}?token=secret#fragment`,
      leaseToken: "must-not-leak",
      profileIdentity: "profile-secret",
      sessionIdentity: "session-secret",
      extra: "drop-me",
    }));
    const error = canonical.createBrowserPublicError("AMBIGUOUS_TARGET", { targets });
    const serialized = canonical.serializeBrowserError(error);

    expect(serialized.metadata.targets).toHaveLength(32);
    expect(serialized.metadata.targets[0]).toEqual({
      tabId: "tab-0",
      title: "Research 0",
      url: "https://example.com/path/0",
      windowId: "window-0",
    });
    expect(Object.isFrozen(error.metadata)).toBe(true);
    expect(Object.isFrozen(error.metadata.targets)).toBe(true);
    expect(Object.isFrozen(error.metadata.targets[0])).toBe(true);
    expect(Object.isFrozen(serialized.metadata)).toBe(true);
    expect(Object.isFrozen(serialized.metadata.targets)).toBe(true);
    expect(Object.isFrozen(serialized.metadata.targets[0])).toBe(true);
    expect(JSON.stringify(serialized)).not.toMatch(/must-not-leak|profile-secret|session-secret|drop-me|token=|user:pass/);

    expect(canonical.serializeBrowserError(
      canonical.createBrowserPublicError("TIMEOUT", { targets }),
    )).not.toHaveProperty("metadata.targets");
  });

  it("drops hostile ambiguity targets without weakening scalar metadata or throwing", () => {
    const hostileTargets = [
      { windowId: "bad id", tabId: "tab-1", title: "ok", url: "https://example.com" },
      { windowId: "window-1", tabId: "tab-1", title: `bad\u0000title`, url: "https://example.com" },
      { windowId: "window-1", tabId: "tab-1", title: "x".repeat(513), url: "https://example.com" },
      { windowId: "window-1", tabId: "tab-1", title: "ok", url: "file:///tmp/private" },
      { windowId: "window-1", tabId: "tab-1", title: "ok", url: "https://example.com", get leaseToken() { throw new Error("getter secret"); } },
      null,
    ];
    const error = canonical.createBrowserPublicError("AMBIGUOUS_TARGET", {
      retryAfterMs: 20,
      targets: hostileTargets,
    });
    expect(() => canonical.serializeBrowserError(error)).not.toThrow();
    expect(canonical.serializeBrowserError(error)).toEqual({
      code: "AMBIGUOUS_TARGET",
      message: canonical.BROWSER_ERROR_MESSAGES_ZH.AMBIGUOUS_TARGET,
      metadata: {
        retryAfterMs: 20,
        targets: [{
          tabId: "tab-1",
          title: "ok",
          url: "https://example.com/",
          windowId: "window-1",
        }],
      },
    });

    const throwingMetadata = Object.defineProperty({ action: "read" }, "targets", {
      enumerable: true,
      get() { throw new Error("targets getter secret"); },
    });
    expect(canonical.serializeBrowserError(
      canonical.createBrowserPublicError("AMBIGUOUS_TARGET", throwingMetadata),
    )).toEqual({
      code: "AMBIGUOUS_TARGET",
      message: canonical.BROWSER_ERROR_MESSAGES_ZH.AMBIGUOUS_TARGET,
      metadata: { action: "read" },
    });
  });
});
