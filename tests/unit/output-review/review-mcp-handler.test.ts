import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeReviewMcpRequest } from "@/features/output-review/review-mcp-handler";
import { OUTPUT_REVIEW_STORAGE_EVENT, OUTPUT_REVIEW_STORAGE_KEY } from "@/features/output-review/output-review-storage";

const now = new Date(2026, 9, 19, 17, 30);
const call = (params: unknown, storage: Storage | null = window.localStorage) =>
  executeReviewMcpRequest({ method: "review.mcp.action", params }, storage, now);
const state = () => JSON.parse(window.localStorage.getItem(OUTPUT_REVIEW_STORAGE_KEY)!);

describe("Review MCP persistence and scheduling", () => {
  beforeEach(() => window.localStorage.clear());

  it("creates and reuses projects without changing existing descriptions", () => {
    const first = call({ action: "create_project", name: "  数学  ", description: "原描述" });
    expect(first).toMatchObject({ created: true, project: { name: "数学" } });
    expect(call({ action: "create_project", name: "数学", description: "不覆盖" })).toMatchObject({ created: false });
    expect(state().projects).toHaveLength(1);
    expect(state().projects[0].description).toBe("原描述");
  });

  it("creates project-scoped points and the existing four-stage cycle using local today", () => {
    call({ action: "create_project", name: "数学" });
    const projectId = state().projects[0].id;
    const listener = vi.fn();
    window.addEventListener(OUTPUT_REVIEW_STORAGE_EVENT, listener);
    try {
      expect(call({ action: "create_knowledge_point", project_id: projectId, title: "特征值", tags: ["#Matrix", "matrix"], difficulty: "hard", notes: "备注" })).toMatchObject({
        created: true, knowledge_point: { projectId, title: "特征值", startDate: "2026-10-19", tags: ["matrix"], notes: "备注" },
        cycle: { events: [
          { stage: "day1", currentPlannedDate: "2026-10-20" },
          { stage: "day2", currentPlannedDate: "2026-10-21" },
          { stage: "day4", currentPlannedDate: "2026-10-23" },
          { stage: "day7", currentPlannedDate: "2026-10-26" },
        ] },
      });
      expect(listener).toHaveBeenCalledOnce();
    } finally { window.removeEventListener(OUTPUT_REVIEW_STORAGE_EVENT, listener); }
  });

  it("reads latest persisted state between calls and paginates/filter points", () => {
    call({ action: "create_project", name: "数学" });
    const projectId = state().projects[0].id;
    for (const title of ["A", "B", "C"]) call({ action: "create_knowledge_point", project_id: projectId, title });
    expect(call({ action: "list_knowledge_points", project_id: projectId, limit: 2 })).toMatchObject({ total: 3, next_offset: 2, knowledge_points: [{ title: "A" }, { title: "B" }] });
    expect(call({ action: "list_knowledge_points", offset: 2, limit: 2 })).toMatchObject({ total: 3, next_offset: null, knowledge_points: [{ title: "C" }] });
    const pointId = state().knowledgePoints[0].id;
    expect(call({ action: "get_knowledge_point", knowledge_point_id: pointId })).toMatchObject({ knowledge_point: { id: pointId }, cycles: [{ events: expect.any(Array) }] });
    expect(state().knowledgePoints).toHaveLength(3);
  });

  it.each([
    { action: "create_project", name: " " },
    { action: "create_knowledge_point", project_id: "missing", title: "X" },
    { action: "create_knowledge_point", project_id: "missing", title: "X", start_date: "2026-02-30" },
    { action: "create_knowledge_point", project_id: "missing", title: "X", material_url: "javascript:alert(1)" },
    { action: "list_projects", limit: 101 },
    { action: "list_projects", offset: -1 },
    { action: "get_knowledge_point" },
    { action: "delete_project", project_id: "anything" },
    { action: "create_project", name: "X", force: true },
  ])("rejects invalid input without writes: %j", params => {
    expect(() => call(params)).toThrow();
    expect(window.localStorage.getItem(OUTPUT_REVIEW_STORAGE_KEY)).toBeNull();
  });

  it("never replaces invalid/incompatible stored data", () => {
    for (const raw of ["broken", '{"version":2}', '{"version":1,"projects":[null],"knowledgePoints":[],"cycles":[]}']) {
      window.localStorage.setItem(OUTPUT_REVIEW_STORAGE_KEY, raw);
      expect(() => call({ action: "create_project", name: "X" })).toThrow(/REVIEW_STORAGE_INVALID/);
      expect(window.localStorage.getItem(OUTPUT_REVIEW_STORAGE_KEY)).toBe(raw);
    }
  });

  it("does not confirm or notify on unavailable or failed persistence", () => {
    expect(() => call({ action: "create_project", name: "X" }, null)).toThrow(/REVIEW_STORAGE_UNAVAILABLE/);
    const listener = vi.fn();
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    window.addEventListener(OUTPUT_REVIEW_STORAGE_EVENT, listener);
    try {
      expect(() => call({ action: "create_project", name: "X" })).toThrow(/REVIEW_PERSIST_FAILED/);
      expect(listener).not.toHaveBeenCalled();
    } finally { setItem.mockRestore(); window.removeEventListener(OUTPUT_REVIEW_STORAGE_EVENT, listener); }
  });

  it("rejects unrelated methods and missing targets without modifying data", () => {
    expect(() => executeReviewMcpRequest({ method: "notes.mcp.document", params: { action: "list_projects" } }, window.localStorage)).toThrow(/Unsupported/);
    expect(() => call({ action: "get_knowledge_point", knowledge_point_id: "missing" })).toThrow(/KNOWLEDGE_POINT_NOT_FOUND/);
    expect(() => call({ action: "list_knowledge_points", project_id: "missing" })).toThrow(/PROJECT_NOT_FOUND/);
  });
});
