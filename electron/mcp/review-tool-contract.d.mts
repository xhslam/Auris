import type { z } from "zod";

export type ReviewReadInput = {
  action: "list_projects" | "list_knowledge_points" | "get_knowledge_point";
  project_id?: string;
  knowledge_point_id?: string;
  offset?: number;
  limit?: number;
};
export type ReviewMutationInput = {
  action: "create_project" | "create_knowledge_point";
  name?: string;
  title?: string;
  project_id?: string;
  start_date?: string;
  description?: string;
  material_url?: string;
  review_reason?: string;
  difficulty?: "easy" | "medium" | "hard";
  tags?: string[];
  notes?: string;
};
export const reviewDateSchema: z.ZodType<string>;
export const reviewReadToolInputSchema: z.ZodType<ReviewReadInput>;
export const reviewMutationToolInputSchema: z.ZodType<ReviewMutationInput>;
export function parseReviewToolInput(input: unknown): ReviewReadInput | ReviewMutationInput;
export const REVIEW_READ_TOOL_DESCRIPTION: string;
export const REVIEW_MUTATION_TOOL_DESCRIPTION: string;
