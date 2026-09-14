import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  BROWSER_AUTHORITY_OPERATIONS,
  deriveBrowserAuthorityOperation,
} = require("../../../../electron/shared/browser-contract.cjs");
const {
  BROWSER_OPERATION_POLICY_TABLE,
  getBrowserOperationPolicy,
  listBrowserOperationPolicies,
} = require("../../../../electron/browser/browser-operation-policy.cjs");

const REQUIRED_OPERATIONS = [
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

describe("browser operation policy", () => {
  it("assigns every closed authority operation a complete policy row", () => {
    expect([...BROWSER_AUTHORITY_OPERATIONS].sort()).toEqual([...REQUIRED_OPERATIONS].sort());
    expect(Object.keys(BROWSER_OPERATION_POLICY_TABLE).sort()).toEqual(
      [...REQUIRED_OPERATIONS].sort(),
    );
    for (const operation of REQUIRED_OPERATIONS) {
      const policy = getBrowserOperationPolicy(operation);
      expect(policy).toMatchObject({
        operation,
        humanOnly: expect.any(Boolean),
        requiresAttachment: expect.any(Boolean),
        requiresExactPayload: expect.any(Boolean),
        standingGrantable: expect.any(Boolean),
        timeoutClass: expect.any(String),
      });
      expect(["none", "exact-once", "exact-or-standing"]).toContain(policy.approvalClass);
      expect(["read", "mutate", "navigate", "session", "eval"]).toContain(policy.timeoutClass);
    }
  });

  it("keeps upload human-only and blocks standing grants for eval/session", () => {
    expect(getBrowserOperationPolicy("upload")).toMatchObject({
      humanOnly: true,
      standingGrantable: false,
      approvalClass: "exact-once",
    });
    expect(getBrowserOperationPolicy("eval")).toMatchObject({
      standingGrantable: false,
      approvalClass: "exact-once",
      requiresExactPayload: true,
    });
    expect(getBrowserOperationPolicy("session")).toMatchObject({
      standingGrantable: false,
      approvalClass: "exact-once",
      requiresExactPayload: true,
    });
  });

  it("derives authority operations from tool actions and never trusts caller authorityOperation", () => {
    expect(deriveBrowserAuthorityOperation({ action: "read" })).toBe("read");
    expect(deriveBrowserAuthorityOperation({
      action: "act",
      variant: "click",
      target: { kind: "selector", selector: "#ok" },
    })).toBe("click");
    expect(deriveBrowserAuthorityOperation({
      action: "screenshot",
      publication: "evidence",
    })).toBe("publish");
    expect(() => listBrowserOperationPolicies().find((row) => row.operation === "missing"))
      .not.toThrow();
    expect(
      listBrowserOperationPolicies().every((row) => REQUIRED_OPERATIONS.includes(row.operation)),
    ).toBe(true);
  });
});
