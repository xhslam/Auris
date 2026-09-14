import { describe, expect, it } from "vitest";

import {
  BROWSER_ERROR_MESSAGES_ZH,
  BROWSER_PUBLIC_ERROR_CODES,
  createBrowserPublicError,
  serializeBrowserError,
} from "../../../src/features/browser/errors";

const ERROR_CODES = [
  "BROWSER_DISABLED", "WINDOW_NOT_FOUND", "TAB_NOT_FOUND", "AMBIGUOUS_TARGET",
  "STALE_NAVIGATION", "CONTROL_STALE", "OWNER_MISMATCH", "NO_COMMITTED_ORIGIN",
  "ORIGIN_NOT_GRANTED", "ATTACHMENT_REQUIRED", "LEASE_LOST", "POLICY_STALE",
  "NAVIGATION_BLOCKED", "OPERATION_NOT_ALLOWED", "APPROVAL_REQUIRED", "APPROVAL_EXPIRED",
  "PAYLOAD_MISMATCH", "PROFILE_ORIGIN_CONFINED", "TIMEOUT", "CANCELLED",
  "CONNECTION_CLOSED", "PAGE_CRASHED", "SESSION_NOT_FOUND", "CAPABILITY_NOT_VERIFIED",
  "WORKFLOW_INVALID", "WORKFLOW_UNTRUSTED", "NIA_PROVIDER_UNAVAILABLE",
  "NIA_PROVIDER_RESPONSE_INVALID",
] as const;

describe("browser public errors", () => {
  it("freezes the exact 28-code public wire table", () => {
    expect(BROWSER_PUBLIC_ERROR_CODES).toEqual(ERROR_CODES);
    expect(BROWSER_PUBLIC_ERROR_CODES).toHaveLength(28);
    expect(Object.isFrozen(BROWSER_PUBLIC_ERROR_CODES)).toBe(true);
  });

  it.each(ERROR_CODES)("has calm actionable Chinese copy for %s", (code) => {
    const message = BROWSER_ERROR_MESSAGES_ZH[code];
    expect(message).toMatch(/[\u3400-\u9fff]/u);
    expect(message.length).toBeGreaterThanOrEqual(8);
    expect(createBrowserPublicError(code).message).toBe(message);
  });

  it("serializes only fixed public copy and allowlisted bounded metadata", () => {
    const internal = new Error("Bearer sk-live-secret; document.cookie; <html>private</html>");
    internal.stack = "secret stack with lease_please_do_not_expose";
    const error = createBrowserPublicError(
      "OPERATION_NOT_ALLOWED",
      {
        action: "execute_js",
        operation: "eval",
        tabId: "tab-main",
        leaseToken: "lease_please_do_not_expose",
        credentials: "password",
        rawPayload: { source: "document.cookie" },
        pageBody: "private page",
        veryLong: "x".repeat(20_000),
      },
      internal,
    );

    const serialized = serializeBrowserError(error);
    expect(serialized).toEqual({
      code: "OPERATION_NOT_ALLOWED",
      message: BROWSER_ERROR_MESSAGES_ZH.OPERATION_NOT_ALLOWED,
      metadata: { action: "execute_js", operation: "eval", tabId: "tab-main" },
    });
    const wire = JSON.stringify(error);
    for (const secret of ["sk-live-secret", "lease_please", "password", "document.cookie", "private page", "secret stack"]) {
      expect(wire).not.toContain(secret);
    }
    expect(Object.keys(error)).not.toContain("cause");
    expect(error.cause).toBe(internal);
  });

  it("maps unknown internal failures to a safe public capability error", () => {
    const wire = serializeBrowserError(new Error("database password: hunter2"));
    expect(wire).toEqual({
      code: "CAPABILITY_NOT_VERIFIED",
      message: BROWSER_ERROR_MESSAGES_ZH.CAPABILITY_NOT_VERIFIED,
    });
    expect(JSON.stringify(wire)).not.toContain("hunter2");
  });

  it("rejects unknown public codes and removes secrets hidden in allowlisted fields", () => {
    expect(() => createBrowserPublicError("LEASE_REQUIRED" as never)).toThrow();
    const wire = serializeBrowserError(createBrowserPublicError("TAB_NOT_FOUND", {
      tabId: "lease_please_do_not_expose",
      origin: "https://user:password@example.com/private",
    }));
    expect(wire).toEqual({
      code: "TAB_NOT_FOUND",
      message: BROWSER_ERROR_MESSAGES_ZH.TAB_NOT_FOUND,
    });
    expect(JSON.stringify(wire)).not.toMatch(/lease_|password|user:/u);
  });

  it("never throws on hostile Proxy, throwing getters, or cyclic metadata", () => {
    const safe = {
      code: "CAPABILITY_NOT_VERIFIED",
      message: BROWSER_ERROR_MESSAGES_ZH.CAPABILITY_NOT_VERIFIED,
    };
    const marker = Symbol.for("auris.browser.public-error");

    expect(serializeBrowserError(new Proxy({}, {
      get() {
        throw new Error("secret proxy trap with lease_token");
      },
    }))).toEqual(safe);

    const forged: Record<string | symbol, unknown> = { code: "TAB_NOT_FOUND" };
    Object.defineProperty(forged, marker, { value: true, enumerable: false });
    Object.defineProperty(forged, "metadata", {
      enumerable: true,
      get() {
        throw new Error("metadata getter leak sk-live-secret");
      },
    });
    expect(serializeBrowserError(forged)).toEqual({
      code: "TAB_NOT_FOUND",
      message: BROWSER_ERROR_MESSAGES_ZH.TAB_NOT_FOUND,
    });

    const cyclic: Record<string, unknown> = { tabId: "tab-main" };
    cyclic.self = cyclic;
    const created = createBrowserPublicError(
      "TIMEOUT",
      new Proxy(cyclic, {
        get(target, prop, receiver) {
          if (prop === "windowId") throw new Error("windowId getter");
          return Reflect.get(target, prop, receiver);
        },
      }),
    );
    expect(created.code).toBe("TIMEOUT");
    expect(serializeBrowserError(created)).toEqual({
      code: "TIMEOUT",
      message: BROWSER_ERROR_MESSAGES_ZH.TIMEOUT,
      metadata: { tabId: "tab-main" },
    });
    expect(JSON.stringify(serializeBrowserError(forged))).not.toMatch(/sk-live|lease_token|secret/u);
  });
});
