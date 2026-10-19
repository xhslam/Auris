import { z } from "zod";
import { parseReviewToolInput, reviewDateSchema } from "../../../electron/mcp/review-tool-contract.mjs";
import {
  createKnowledgePoint, createProject, currentCycleFor, refreshReviewStatuses, toLocalDateKey,
  type OutputReviewState,
} from "@/features/output-review/output-review-model";
import {
  OUTPUT_REVIEW_STORAGE_EVENT, OUTPUT_REVIEW_STORAGE_KEY, readOutputReviewStateResult,
} from "@/features/output-review/output-review-storage";

// Validate before a read-modify-write. A malformed record must never cause an
// apparently empty state to replace the user's existing Review data.
const id = z.string().min(1);
const timestamp = z.string().datetime({ offset: true });
const stage = z.enum(["day1", "day2", "day4", "day7"]);
const persistedStateSchema = z.object({
  version: z.literal(1),
  projects: z.array(z.object({ id, name: z.string().min(1), description: z.string().optional(), createdAt: timestamp, updatedAt: timestamp })),
  knowledgePoints: z.array(z.object({
    id, title: z.string().min(1), projectId: id, startDate: reviewDateSchema,
    status: z.enum(["active", "overdue", "paused", "mastered", "archived"]),
    currentStage: stage.nullable(), tags: z.array(z.string()), createdAt: timestamp, updatedAt: timestamp,
    description: z.string().optional(), materialUrl: z.string().optional(), reviewReason: z.string().optional(),
    difficulty: z.enum(["easy", "medium", "hard"]).optional(), notes: z.string().optional(),
  })),
  cycles: z.array(z.object({
    id, knowledgePointId: id, startedAt: timestamp, completedAt: timestamp.optional(), isCurrent: z.boolean(),
    events: z.array(z.object({
      id, knowledgePointId: id, stage, originalPlannedDate: reviewDateSchema, currentPlannedDate: reviewDateSchema,
      status: z.enum(["pending", "completed", "skipped"]), completedAt: timestamp.optional(),
      durationMinutes: z.number().finite().optional(), delayDays: z.number().finite().optional(), scheduleShiftDays: z.number().finite().optional(),
    })),
  })),
});

export function readReviewMcpState(storage: Storage | null): OutputReviewState {
  const result = readOutputReviewStateResult(storage);
  if (!result.state) throw new Error(`REVIEW_STORAGE_${result.status.toUpperCase()}`);
  const state = result.state;
  if (!persistedStateSchema.safeParse(state).success) throw new Error("REVIEW_STORAGE_INVALID");
  const projects = new Set(state.projects.map(project => project.id));
  const points = new Set(state.knowledgePoints.map(point => point.id));
  if (projects.size !== state.projects.length || points.size !== state.knowledgePoints.length ||
      state.knowledgePoints.some(point => !projects.has(point.projectId)) ||
      state.cycles.some(cycle => !points.has(cycle.knowledgePointId) || cycle.events.some(event => event.knowledgePointId !== cycle.knowledgePointId))) {
    throw new Error("REVIEW_STORAGE_INVALID");
  }
  return state;
}

export function persistReviewMcpState(storage: Storage, state: OutputReviewState) {
  try {
    storage.setItem(OUTPUT_REVIEW_STORAGE_KEY, JSON.stringify(state));
  } catch {
    throw new Error("REVIEW_PERSIST_FAILED: local storage write failed; no creation confirmed.");
  }
  window.dispatchEvent(new CustomEvent(OUTPUT_REVIEW_STORAGE_EVENT));
}

function paginate<T>(items: T[], input: { limit?: number; offset?: number }) {
  const offset = input.offset ?? 0;
  const limit = input.limit ?? 50;
  return { items: items.slice(offset, offset + limit), total: items.length, offset, limit,
    next_offset: offset + limit < items.length ? offset + limit : null };
}

/** Synchronous read/transform/write prevents interleaved renderer calls from
 * overwriting each other. Only the main-window facade executes mutations. */
export function executeReviewMcpRequest(
  request: { method: string; params?: unknown },
  storage: Storage | null,
  now = new Date(),
): unknown {
  if (request.method !== "review.mcp.action") throw new Error("Unsupported Review MCP method.");
  const input = parseReviewToolInput(request.params);
  const state = readReviewMcpState(storage);
  if (input.action === "create_project") {
    const next = createProject(state, { name: input.name!, description: input.description }, now);
    const project = next.projects.find(item => item.name.toLocaleLowerCase() === input.name!.toLocaleLowerCase())!;
    if (next !== state) persistReviewMcpState(storage!, next);
    return { created: next !== state, project };
  }
  if (input.action === "create_knowledge_point") {
    if (!state.projects.some(project => project.id === input.project_id)) throw new Error("PROJECT_NOT_FOUND");
    const next = createKnowledgePoint(state, {
      projectId: input.project_id!, title: input.title!, startDate: input.start_date ?? toLocalDateKey(now),
      description: input.description, materialUrl: input.material_url, reviewReason: input.review_reason,
      difficulty: input.difficulty, tags: input.tags, notes: input.notes,
    }, now);
    const point = next.knowledgePoints[next.knowledgePoints.length - 1];
    persistReviewMcpState(storage!, next);
    return { created: true, knowledge_point: point, cycle: currentCycleFor(next, point.id) };
  }
  const query = input as import("../../../electron/mcp/review-tool-contract.mjs").ReviewReadInput;
  const live = refreshReviewStatuses(state, toLocalDateKey(now));
  if (query.action === "list_projects") {
    const { items, ...page } = paginate(live.projects, query);
    return { projects: items, ...page };
  }
  if (query.action === "get_knowledge_point") {
    const point = live.knowledgePoints.find(item => item.id === query.knowledge_point_id);
    if (!point) throw new Error("KNOWLEDGE_POINT_NOT_FOUND");
    return { knowledge_point: point, project: live.projects.find(project => project.id === point.projectId),
      cycles: live.cycles.filter(cycle => cycle.knowledgePointId === point.id) };
  }
  if (query.project_id && !live.projects.some(project => project.id === query.project_id)) throw new Error("PROJECT_NOT_FOUND");
  const { items, ...page } = paginate(live.knowledgePoints.filter(point => !query.project_id || point.projectId === query.project_id), query);
  return { knowledge_points: items, ...page };
}
