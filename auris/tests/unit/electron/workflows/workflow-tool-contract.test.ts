import { describe, expect, it } from "vitest";
import { normalizeWorkflowToolInput, workflowToolInputSchema } from "../../../../electron/mcp/workflow-tool-contract.mjs";

describe("workflow MCP contract", () => {
  it("requires a discriminated family and explicit Browser target", () => {
    expect(workflowToolInputSchema.safeParse({ action: "validate", source: "x" }).success).toBe(false);
    expect(workflowToolInputSchema.safeParse({ action: "start", family: "browser_markdown", source: "x" }).success).toBe(false);
    expect(normalizeWorkflowToolInput({
      action: "start",
      family: "browser_markdown",
      source: "x",
      window_id: "w",
      tab_id: "t",
    })).toMatchObject({
      action: "start",
      family: "browser_markdown",
      request: { target: { windowId: "w", tabId: "t" } },
    });
  });

  it("keeps list family-free but requires run identity for state/cancel/resume", () => {
    expect(normalizeWorkflowToolInput({ action: "list" })).toEqual({ action: "list" });
    expect(workflowToolInputSchema.safeParse({ action: "cancel", family: "nia_yaml" }).success).toBe(false);
    expect(workflowToolInputSchema.safeParse({
      action: "resume",
      family: "nia_yaml",
      run_id: "run-1",
      approved: true,
    }).success).toBe(false);
    expect(normalizeWorkflowToolInput({
      action: "resume",
      family: "browser_markdown",
      run_id: "run-1",
      approved: true,
      approval_id: "approval-1",
    })).toEqual({
      action: "resume",
      family: "browser_markdown",
      runId: "run-1",
      approved: true,
      approvalId: "approval-1",
    });
  });
});
