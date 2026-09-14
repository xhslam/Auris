import type { z } from "zod";

export const workflowFamilySchema: z.ZodType<"nia_yaml" | "browser_markdown">;
export const workflowActionSchema: z.ZodType<
  "list" | "inspect" | "validate" | "start" | "get_state" | "cancel" | "resume"
>;
export const workflowToolInputSchema: z.ZodType<Record<string, unknown>>;
export const WORKFLOW_TOOL_DESCRIPTION: string;
export function normalizeWorkflowToolInput(input: unknown): Readonly<Record<string, unknown>>;
