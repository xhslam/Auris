import { afterEach, describe, expect, it, vi } from "vitest";
import { buildNiaReviewReminder, readNiaTodayReviews } from "@/features/nia/nia-review-context";
import { OUTPUT_REVIEW_STORAGE_KEY } from "@/features/output-review/output-review-storage";
import { EMPTY_OUTPUT_REVIEW_STATE, createProject, createKnowledgePoint, completeCurrentReview, setKnowledgePointStatus } from "@/features/output-review/output-review-model";

function fixture() {
  let state = createProject(EMPTY_OUTPUT_REVIEW_STATE, { name: "数学" });
  for (const [title, startDate] of [["逾期知识点", "2026-09-06"], ["今日知识点", "2026-09-07"], ["未来知识点", "2026-09-09"], ["暂停知识点", "2026-09-07"]]) {
    state = createKnowledgePoint(state, { title, startDate, projectId: state.projects[0].id });
  }
  const paused = state.knowledgePoints.find((p) => p.title === "暂停知识点")!;
  return setKnowledgePointStatus(state, paused.id, "pause");
}
afterEach(() => { localStorage.clear(); vi.useRealTimers(); });
describe("Nia today's review reader", () => {
  it("reads the shared queue fresh, includes overdue, excludes future/paused, and sees completion", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 8, 8, 20));
    const state = fixture();
    localStorage.setItem(OUTPUT_REVIEW_STORAGE_KEY, JSON.stringify(state));
    const before = localStorage.getItem(OUTPUT_REVIEW_STORAGE_KEY);
    const first = readNiaTodayReviews(localStorage);
    expect(first).toMatchObject({ status: "ready", dateKey: "2026-09-08", actionableCount: 2, overdueCount: 1, dueTodayCount: 1 });
    expect(first.items?.map((i) => i.title)).toEqual(["逾期知识点", "今日知识点"]);
    expect(localStorage.getItem(OUTPUT_REVIEW_STORAGE_KEY)).toBe(before);
    const updated = completeCurrentReview(state, first.items![0].knowledgePointId, new Date());
    localStorage.setItem(OUTPUT_REVIEW_STORAGE_KEY, JSON.stringify(updated));
    expect(readNiaTodayReviews(localStorage)).toMatchObject({ actionableCount: 1, completedToday: 1 });
    vi.setSystemTime(new Date(2026, 8, 9, 0, 1));
    expect(readNiaTodayReviews(localStorage)).toMatchObject({ dateKey: "2026-09-09", actionableCount: 2 });
  });
  it("distinguishes empty, damaged and unavailable data and validates arguments", () => {
    expect(readNiaTodayReviews(localStorage)).toMatchObject({ status: "ready", actionableCount: 0 });
    expect(readNiaTodayReviews(null)).toMatchObject({ status: "unavailable" });
    localStorage.setItem(OUTPUT_REVIEW_STORAGE_KEY, "broken");
    expect(readNiaTodayReviews(localStorage)).toMatchObject({ status: "unavailable" });
    expect(readNiaTodayReviews(localStorage, '{"offset":-1}')).toMatchObject({ status: "invalid_arguments" });
  });
  it("paginates without implying that a partial list is complete", () => {
    let state = createProject(EMPTY_OUTPUT_REVIEW_STATE, { name: "项目" });
    for (let i = 0; i < 23; i++) state = createKnowledgePoint(state, { title: `知识点 ${i}`, startDate: "2026-09-07", projectId: state.projects[0].id });
    localStorage.setItem(OUTPUT_REVIEW_STORAGE_KEY, JSON.stringify(state));
    const first = readNiaTodayReviews(localStorage, "{}", new Date(2026, 8, 8));
    const second = readNiaTodayReviews(localStorage, '{"offset":20}', new Date(2026, 8, 8));
    expect(first).toMatchObject({ actionableCount: 23, nextOffset: 20 });
    expect(first.items).toHaveLength(20);
    expect(second.items).toHaveLength(3);
    expect(second.nextOffset).toBeNull();
  });
  it("includes actual reminder fields and marks them as data", () => {
    const text = buildNiaReviewReminder({ count: 1, items: [{ title: "特征值", projectName: "线性代数", stageLabel: "Day 1", plannedDate: "2026-09-08", overdueDays: 0, secret: "excluded" }] });
    expect(text).toContain("特征值"); expect(text).toContain("线性代数");
    expect(text).toContain("get_today_reviews"); expect(text).not.toContain("excluded");
  });
});
