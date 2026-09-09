import { describe, expect, it, vi } from "vitest";
import {
  EMPTY_OUTPUT_REVIEW_STATE,
  completeCurrentReview,
  createKnowledgePoint,
  createProject,
  currentCycleFor,
  getDashboardMetrics,
  getNiaReviewMessage,
  getReviewQueue,
  restartReviewCycle,
  setKnowledgePointStatus,
  buildReviewHeatmapModel,
} from "@/features/output-review/output-review-model";

vi.spyOn(Math, "random").mockReturnValue(0.123456);

function fixture(startDate = "2026-08-16") {
  const withProject = createProject(
    EMPTY_OUTPUT_REVIEW_STATE,
    { name: "Linear Algebra" },
    new Date(2026, 7, 16, 9),
  );
  const projectId = withProject.projects[0]!.id;
  return createKnowledgePoint(
    withProject,
    {
      title: "Eigenvalues",
      projectId,
      startDate,
      difficulty: "hard",
      tags: ["matrix", "#exam"],
    },
    new Date(2026, 7, 16, 10),
  );
}

describe("output review scheduling", () => {
  it("creates the Day 1 / 2 / 4 / 7 schedule and preserves normalized tags", () => {
    const state = fixture();
    const point = state.knowledgePoints[0]!;
    const cycle = currentCycleFor(state, point.id)!;

    expect(cycle.events.map((event) => event.currentPlannedDate)).toEqual([
      "2026-08-17",
      "2026-08-18",
      "2026-08-20",
      "2026-08-23",
    ]);
    expect(point.tags).toEqual(["matrix", "exam"]);
    expect(point.currentStage).toBe("day1");
  });

  it("shifts every future pending stage by the exact late delay", () => {
    let state = fixture();
    const pointId = state.knowledgePoints[0]!.id;
    state = completeCurrentReview(state, pointId, new Date(2026, 7, 17, 20));
    state = completeCurrentReview(state, pointId, new Date(2026, 7, 20, 19, 42));

    const events = currentCycleFor(state, pointId)!.events;
    expect(events[1]).toMatchObject({
      originalPlannedDate: "2026-08-18",
      currentPlannedDate: "2026-08-18",
      delayDays: 2,
      scheduleShiftDays: 2,
      status: "completed",
    });
    expect(events[2]).toMatchObject({
      originalPlannedDate: "2026-08-20",
      currentPlannedDate: "2026-08-22",
      status: "pending",
    });
    expect(events[3].currentPlannedDate).toBe("2026-08-25");
  });

  it("accumulates later delays without rewriting the original schedule", () => {
    let state = fixture();
    const pointId = state.knowledgePoints[0]!.id;
    state = completeCurrentReview(state, pointId, new Date(2026, 7, 17));
    state = completeCurrentReview(state, pointId, new Date(2026, 7, 20));
    state = completeCurrentReview(state, pointId, new Date(2026, 7, 25));

    const day7 = currentCycleFor(state, pointId)!.events[3];
    expect(day7).toMatchObject({
      originalPlannedDate: "2026-08-23",
      currentPlannedDate: "2026-08-28",
      status: "pending",
    });
  });

  it("allows early completion without pulling future events earlier", () => {
    let state = fixture();
    const pointId = state.knowledgePoints[0]!.id;
    state = completeCurrentReview(state, pointId, new Date(2026, 7, 16, 18));
    const cycle = currentCycleFor(state, pointId)!;
    expect(cycle.events[0].delayDays).toBe(0);
    expect(cycle.events[1].currentPlannedDate).toBe("2026-08-18");
  });

  it("marks Day 7 mastered and removes the knowledge point from the queue", () => {
    let state = fixture();
    const pointId = state.knowledgePoints[0]!.id;
    for (const date of [17, 18, 20, 23]) {
      state = completeCurrentReview(state, pointId, new Date(2026, 7, date, 12));
    }
    expect(state.knowledgePoints[0]).toMatchObject({
      currentStage: null,
      status: "mastered",
    });
    expect(getReviewQueue(state, "2026-08-24")).toEqual([]);
  });

  it("resumes the current pending stage on today and recalculates future dates", () => {
    let state = fixture();
    const pointId = state.knowledgePoints[0]!.id;
    state = setKnowledgePointStatus(state, pointId, "pause", new Date(2026, 7, 16));
    state = setKnowledgePointStatus(state, pointId, "resume", new Date(2026, 7, 22));
    const events = currentCycleFor(state, pointId)!.events;
    expect(events.map((event) => event.currentPlannedDate)).toEqual([
      "2026-08-22",
      "2026-08-23",
      "2026-08-25",
      "2026-08-28",
    ]);
  });

  it("keeps an old cycle in history when restarting", () => {
    let state = fixture();
    const pointId = state.knowledgePoints[0]!.id;
    state = completeCurrentReview(state, pointId, new Date(2026, 7, 17));
    state = restartReviewCycle(state, pointId, new Date(2026, 8, 1));
    expect(state.cycles).toHaveLength(2);
    expect(state.cycles[0].isCurrent).toBe(false);
    expect(state.cycles[1].events[0].currentPlannedDate).toBe("2026-09-02");
  });

  it("sorts oldest overdue before due today and returns behavioral metrics", () => {
    const state = fixture();
    const queue = getReviewQueue(state, "2026-08-20");
    const metrics = getDashboardMetrics(state, "2026-08-20");
    expect(queue[0]).toMatchObject({ overdueDays: 3, urgency: "overdue" });
    expect(metrics).toMatchObject({ overdueCount: 1, maxOverdueDays: 3 });
    expect(getNiaReviewMessage(state, "2026-08-20", 9)).toContain("延迟 3 天");
  });

  describe("review heatmap model", () => {
    it("builds a 365-day continuous heatmap model with correct levels and metrics", () => {
      let state = fixture("2026-09-01");
      const pointId = state.knowledgePoints[0]!.id;
      // Complete review on 2026-09-07 and 2026-09-08
      state = completeCurrentReview(state, pointId, new Date(2026, 8, 7, 10));
      state = completeCurrentReview(state, pointId, new Date(2026, 8, 8, 14));

      const model = buildReviewHeatmapModel(state, "2026-09-09", 365);
      expect(model.cells).toHaveLength(365);
      expect(model.totalReviews).toBe(2);
      expect(model.studiedDayCount).toBe(2);
      expect(model.peakDailyReviews).toBe(1);
      expect(model.streak).toBe(2); // Completed yesterday (Sep 8) and Sep 7

      const sep7Cell = model.cells.find((c) => c.date === "2026-09-07");
      expect(sep7Cell).toBeDefined();
      expect(sep7Cell?.count).toBe(1);
      expect(sep7Cell?.level).toBe(4); // 1 / 1 = 100% -> level 4

      const sep9Cell = model.cells.find((c) => c.date === "2026-09-09");
      expect(sep9Cell).toBeDefined();
      expect(sep9Cell?.count).toBe(0);
      expect(sep9Cell?.level).toBe(0);

      expect(model.averageDailyReviews).toBe(1);
      expect(model.totalDurationMinutes).toBe(8); // Day 1 (5m) + Day 2 (3m)
      expect(model.averageDailyMinutes).toBe(4); // 8m / 2 days
      expect(model.longestStreak).toBe(2);
      expect(model.currentStreak).toBe(2);

      // Insights assertions
      expect(model.insights.leverage.summary).toBe("还没有词根攒够 3 个认识的词");
      expect(model.insights.stubborn.summary).toBe("1 个词发生过 2 次以上延期复习");
      expect(model.insights.durationTrend.summary).toContain("比上一次");
      expect(model.insights.timeDistribution.summary).toBe("常在上午学 · 清晨回忆率最高");
    });

    it("calculates longest streak even if current streak is broken", () => {
      let state = fixture("2026-09-01");
      const pointId = state.knowledgePoints[0]!.id;
      // Complete review on Sep 1, Sep 2, Sep 3 (streak 3), then gap, then Sep 8 (streak 1)
      state = completeCurrentReview(state, pointId, new Date(2026, 8, 1, 10));
      state = completeCurrentReview(state, pointId, new Date(2026, 8, 2, 10));
      state = completeCurrentReview(state, pointId, new Date(2026, 8, 3, 10));
      state = completeCurrentReview(state, pointId, new Date(2026, 8, 8, 10));

      const model = buildReviewHeatmapModel(state, "2026-09-09", 365);
      expect(model.currentStreak).toBe(1); // yesterday Sep 8
      expect(model.longestStreak).toBe(3); // Sep 1, 2, 3
    });

    it("handles empty state gracefully with zero counts, streak, and default insights", () => {
      const state = EMPTY_OUTPUT_REVIEW_STATE;
      const model = buildReviewHeatmapModel(state, "2026-09-09", 365);
      expect(model.cells).toHaveLength(365);
      expect(model.totalReviews).toBe(0);
      expect(model.totalDurationMinutes).toBe(0);
      expect(model.studiedDayCount).toBe(0);
      expect(model.averageDailyReviews).toBe(0);
      expect(model.averageDailyMinutes).toBe(0);
      expect(model.peakDailyReviews).toBe(0);
      expect(model.currentStreak).toBe(0);
      expect(model.longestStreak).toBe(0);
      expect(model.streak).toBe(0);
      expect(model.insights.leverage.summary).toBe("还没有词根攒够 3 个认识的词");
      expect(model.insights.stubborn.summary).toBe("暂无顽固词");
      expect(model.insights.durationTrend.summary).toBe("暂无对比数据");
      expect(model.insights.timeDistribution.summary).toBe("暂无时段数据 · 开启第一次复盘后记录");
      expect(model.cells.every((c) => c.count === 0 && c.level === 0)).toBe(true);
    });
  });
});
