import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

import canonical from "../../../electron/shared/browser-contract.cjs";
import * as contracts from "../../../src/features/browser/contracts";
import * as errors from "../../../src/features/browser/errors";
import * as schemas from "../../../src/features/browser/schemas";

const require = createRequire(import.meta.url);
const canonicalPath = path.resolve("electron/shared/browser-contract.cjs");

describe("packaged browser contract cross-runtime parity", () => {
  it("loads the same canonical objects through CJS, ESM interop, and TypeScript adapters", async () => {
    const cjs = require(canonicalPath);
    const esm = await import(canonicalPath);
    const esmRoot = esm.default ?? esm;

    // Thin TS adapters must re-export the exact objects from the Vitest-resolved
    // canonical module (same evaluation graph as `import …/browser-contract.cjs`).
    expect(contracts.BROWSER_TOOL_ACTIONS).toBe(canonical.BROWSER_TOOL_ACTIONS);
    expect(contracts.BROWSER_AUTHORITY_OPERATIONS).toBe(canonical.BROWSER_AUTHORITY_OPERATIONS);
    expect(contracts.createBrowserCommandEnvelope).toBe(canonical.createBrowserCommandEnvelope);
    expect(contracts.parseBrowserCommandEnvelope).toBe(canonical.parseBrowserCommandEnvelope);
    expect(contracts.deriveBrowserAuthorityOperation).toBe(canonical.deriveBrowserAuthorityOperation);
    expect(schemas.browserCommandEnvelopeSchema).toBe(canonical.browserCommandEnvelopeSchema);
    expect(schemas.browserActionRequestSchema).toBe(canonical.browserActionRequestSchema);
    expect(errors.BROWSER_PUBLIC_ERROR_CODES).toBe(canonical.BROWSER_PUBLIC_ERROR_CODES);
    expect(errors.BROWSER_ERROR_MESSAGES_ZH).toBe(canonical.BROWSER_ERROR_MESSAGES_ZH);
    expect(errors.serializeBrowserError).toBe(canonical.serializeBrowserError);
    expect(errors.createBrowserPublicError).toBe(canonical.createBrowserPublicError);

    // Absolute-path require/import may be a second evaluation under Vitest's
    // transform pipeline; still require value equality and matching accept/reject.
    expect(esmRoot.BROWSER_TOOL_ACTIONS).toEqual(cjs.BROWSER_TOOL_ACTIONS);
    expect(esmRoot.BROWSER_AUTHORITY_OPERATIONS).toEqual(cjs.BROWSER_AUTHORITY_OPERATIONS);
    expect(esmRoot.BROWSER_PUBLIC_ERROR_CODES).toEqual(cjs.BROWSER_PUBLIC_ERROR_CODES);
    expect(esmRoot.BROWSER_ERROR_MESSAGES_ZH).toEqual(cjs.BROWSER_ERROR_MESSAGES_ZH);
    expect(canonical.BROWSER_TOOL_ACTIONS).toEqual(cjs.BROWSER_TOOL_ACTIONS);
    expect(canonical.BROWSER_AUTHORITY_OPERATIONS).toEqual(cjs.BROWSER_AUTHORITY_OPERATIONS);
    expect(canonical.BROWSER_PUBLIC_ERROR_CODES).toEqual(cjs.BROWSER_PUBLIC_ERROR_CODES);
    expect(canonical.BROWSER_ERROR_MESSAGES_ZH).toEqual(cjs.BROWSER_ERROR_MESSAGES_ZH);

    const sample = {
      windowId: "window-one",
      tabId: "tab-one",
      navigationGeneration: 1,
      controlEpoch: 1,
      owner: { kind: "mcp" as const, id: "client-one" },
      leaseToken: "lease_1234567890abcdef",
    };
    const request = { action: "read" as const };
    expect(cjs.createBrowserCommandEnvelope(sample, request)).toEqual(
      canonical.createBrowserCommandEnvelope(sample, request),
    );
    expect(esmRoot.createBrowserCommandEnvelope(sample, request)).toEqual(
      canonical.createBrowserCommandEnvelope(sample, request),
    );
    expect(() => cjs.parseBrowserToolAction("Read")).toThrow();
    expect(() => esmRoot.parseBrowserToolAction("Read")).toThrow();
    expect(() => canonical.parseBrowserToolAction("Read")).toThrow();
  });

  it("round-trips every action, operation, envelope, and error fixture identically", async () => {
    const cjs = require(canonicalPath);
    const esm = (await import(canonicalPath)).default;

    for (const action of cjs.BROWSER_TOOL_ACTIONS) {
      expect(contracts.parseBrowserToolAction(action)).toBe(cjs.parseBrowserToolAction(action));
      expect(esm.parseBrowserToolAction(action)).toBe(action);
    }
    for (const operation of cjs.BROWSER_AUTHORITY_OPERATIONS) {
      expect(contracts.parseBrowserAuthorityOperation(operation)).toBe(cjs.parseBrowserAuthorityOperation(operation));
      expect(esm.parseBrowserAuthorityOperation(operation)).toBe(operation);
    }

    const actionFixtures = [
      { action: "get_state" },
      { action: "open", url: "https://example.com" },
      { action: "acquire_control" },
      { action: "release_control" },
      { action: "close" },
      { action: "focus" },
      { action: "navigate", url: "https://example.com/next" },
      { action: "wait", milliseconds: 1 },
      { action: "wait_for", target: { kind: "ref", ref: "node-one" } },
      { action: "read" },
      { action: "screenshot" },
      { action: "query", target: { kind: "selector", selector: "main" } },
      { action: "console" },
      { action: "act", variant: "click", target: { kind: "selector", selector: "button" } },
      { action: "style", target: { kind: "ref", ref: "node-one" }, css: "color: green" },
      { action: "execute_js", source: "document.title" },
      { action: "session_save", name: "one" },
      { action: "session_load", name: "one" },
    ];
    const context = {
      windowId: "window-one",
      tabId: "tab-one",
      navigationGeneration: 2,
      controlEpoch: 4,
      owner: { kind: "nia" as const, id: "nia-local" },
      leaseToken: "lease_1234567890abcdef",
    };
    for (const fixture of actionFixtures) {
      const fromCjs = cjs.createBrowserCommandEnvelope(context, fixture);
      expect(esm.createBrowserCommandEnvelope(context, fixture)).toEqual(fromCjs);
      expect(contracts.createBrowserCommandEnvelope(context, fixture as never)).toEqual(fromCjs);
    }

    const envelope = cjs.createBrowserCommandEnvelope(
      context,
      { action: "act", variant: "click", target: { kind: "selector", selector: "button" } },
    );
    expect(contracts.parseBrowserCommandEnvelope(envelope)).toEqual(envelope);
    expect(esm.parseBrowserCommandEnvelope(envelope)).toEqual(envelope);
    expect(JSON.stringify(contracts.parseBrowserCommandEnvelope(envelope))).toBe(JSON.stringify(cjs.parseBrowserCommandEnvelope(envelope)));

    for (const code of cjs.BROWSER_PUBLIC_ERROR_CODES) {
      const fixture = cjs.createBrowserPublicError(code, { tabId: "tab-one" });
      expect(errors.serializeBrowserError(fixture)).toEqual(cjs.serializeBrowserError(fixture));
      expect(esm.serializeBrowserError(fixture)).toEqual(cjs.serializeBrowserError(fixture));
    }
  });

  it("rejects altered vocabulary and unknown envelope keys in every runtime", async () => {
    const cjs = require(canonicalPath);
    const esm = (await import(canonicalPath)).default;
    for (const runtime of [cjs, esm, contracts]) {
      expect(() => runtime.parseBrowserToolAction("Read")).toThrow();
      expect(() => runtime.parseBrowserAuthorityOperation("eval ")).toThrow();
      expect(() => runtime.parseBrowserCommandEnvelope({ unexpected: true })).toThrow();
    }
  });

  it("keeps adapters thin and guards against duplicate arrays, maps, and Zod validators", () => {
    for (const relative of [
      "src/features/browser/contracts.ts",
      "src/features/browser/schemas.ts",
      "src/features/browser/errors.ts",
    ]) {
      const source = readFileSync(path.resolve(relative), "utf8");
      expect(source).not.toMatch(/\bz\.(?:object|enum|literal|union|discriminatedUnion)\s*\(/);
      expect(source).not.toMatch(/(?:BROWSER_TOOL_ACTIONS|BROWSER_PUBLIC_ERROR_CODES)\s*=\s*\[/);
      expect(source).not.toMatch(/BROWSER_ERROR_MESSAGES_ZH\s*=\s*\{/);
      expect(source).toContain("browser-contract.cjs");
    }
  });
});
