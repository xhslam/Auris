import { z } from "zod";

export const workflowFamilySchema = z.enum(["nia_yaml", "browser_markdown"]);
export const workflowActionSchema = z.enum([
  "list",
  "inspect",
  "validate",
  "start",
  "get_state",
  "cancel",
  "resume",
]);

export const workflowToolInputSchema = z.object({
  action: workflowActionSchema,
  family: workflowFamilySchema.optional(),
  source: z.string().max(262_144).optional(),
  definition_id: z.string().max(128).optional(),
  run_id: z.string().max(128).optional(),
  inputs: z.record(z.string(), z.unknown()).optional(),
  window_id: z.string().max(128).optional(),
  tab_id: z.string().max(128).optional(),
  approved: z.boolean().optional(),
  approval_id: z.string().max(128).optional(),
}).strict().superRefine((value, context) => {
  if (value.action !== "list" && !value.family) context.addIssue({ code: "custom", message: "family is required" });
  if (value.action === "validate" && !value.source) context.addIssue({ code: "custom", message: "source is required" });
  if (["get_state", "cancel", "resume"].includes(value.action) && !value.run_id) {
    context.addIssue({ code: "custom", message: "run_id is required" });
  }
  if (value.action === "resume" && value.family !== "browser_markdown") {
    context.addIssue({ code: "custom", message: "resume requires family browser_markdown" });
  }
  if (value.action === "resume" && value.approved === undefined) {
    context.addIssue({ code: "custom", message: "approved is required for resume" });
  }
  if (value.action === "inspect" && !value.definition_id) context.addIssue({ code: "custom", message: "definition_id is required" });
  if (value.action === "start" && !value.source && !value.definition_id) context.addIssue({ code: "custom", message: "source or definition_id is required" });
  if (value.action === "start" && value.family === "browser_markdown" && (!value.window_id || !value.tab_id)) {
    context.addIssue({ code: "custom", message: "browser_markdown start requires window_id and tab_id" });
  }
});

export function normalizeWorkflowToolInput(input) {
  const value = workflowToolInputSchema.parse(input);
  if (value.action === "list") return Object.freeze({ action: "list" });
  if (value.action === "validate") return Object.freeze({ action: value.action, family: value.family, source: value.source });
  if (value.action === "inspect") return Object.freeze({ action: value.action, family: value.family, definitionId: value.definition_id });
  if (value.action === "get_state" || value.action === "cancel") {
    return Object.freeze({ action: value.action, family: value.family, runId: value.run_id });
  }
  if (value.action === "resume") {
    return Object.freeze({
      action: "resume",
      family: value.family,
      runId: value.run_id,
      approved: value.approved === true,
      ...(typeof value.approval_id === "string" ? { approvalId: value.approval_id } : {}),
    });
  }
  const request = {
    ...(value.source ? { source: value.source } : { storedRef: value.definition_id }),
    inputs: value.inputs ?? {},
    ...(value.family === "browser_markdown" ? { target: { windowId: value.window_id, tabId: value.tab_id } } : {}),
  };
  return Object.freeze({ action: "start", family: value.family, request: Object.freeze(request) });
}

export const WORKFLOW_TOOL_DESCRIPTION = [
  "List, inspect, validate, start, inspect state, cancel, or resume an Auris workflow.",
  "resume is browser_markdown-only: set approved true/false; include approval_id when pending browser_approval.",
  "Start remains independently capability-gated per family.",
].join(" ");
