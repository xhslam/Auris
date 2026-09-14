import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  MAIN_WORKFLOW_RUNTIME_CAPABILITIES,
  createWorkflowCapabilities,
} = require("../../../../electron/workflows/workflow-capabilities.cjs");

describe("workflow capabilities", () => {
  it("keeps pure operations visible while gating each runtime independently", () => {
    const capabilities = createWorkflowCapabilities();
    expect(capabilities.snapshot().nia_yaml.pureOperations).toEqual(["list", "inspect", "validate"]);
    expect(() => capabilities.assertStartAllowed("nia_yaml")).toThrowError(expect.objectContaining({ code: "CAPABILITY_NOT_VERIFIED" }));
    capabilities.markRuntimeVerified("nia_yaml");
    expect(capabilities.assertStartAllowed("nia_yaml")).toBe(true);
    expect(() => capabilities.assertStartAllowed("browser_markdown")).toThrowError(expect.objectContaining({ code: "CAPABILITY_NOT_VERIFIED" }));
  });

  it("seeds only explicitly verified families and exposes the smoke-approved main truth", () => {
    const niaOnly = createWorkflowCapabilities({ nia_yaml: "runtime_verified" });
    expect(niaOnly.assertStartAllowed("nia_yaml")).toBe(true);
    expect(() => niaOnly.assertStartAllowed("browser_markdown")).toThrowError(expect.objectContaining({ code: "CAPABILITY_NOT_VERIFIED" }));

    const browserOnly = createWorkflowCapabilities({ browser_markdown: "runtime_verified" });
    expect(browserOnly.assertStartAllowed("browser_markdown")).toBe(true);
    expect(() => browserOnly.assertStartAllowed("nia_yaml")).toThrowError(expect.objectContaining({ code: "CAPABILITY_NOT_VERIFIED" }));

    const main = createWorkflowCapabilities(MAIN_WORKFLOW_RUNTIME_CAPABILITIES);
    expect(main.snapshot()).toMatchObject({
      nia_yaml: { start: true, status: "runtime_verified" },
      browser_markdown: { start: true, status: "runtime_verified" },
    });
  });
});
