import { describe, expect, it } from "vitest";
import {
  buildDesktopIslandContentSnapshot,
} from "@/features/desktop-island/desktop-island-projection";
import { createEmptyDesktopIslandTaskState } from "@/features/desktop-island/desktop-island-task-store";
import type { OutputReviewState } from "@/features/output-review/output-review-model";

const now = new Date("2026-08-26T10:00:00+08:00");

function reviewState(): OutputReviewState {
  return {
    version: 1,
    projects: [{
      id: "project-1",
      name: "线性代数",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }],
    knowledgePoints: [{
      id: "knowledge-1",
      title: "特征值与特征向量",
      projectId: "project-1",
      difficulty: "hard",
      tags: [],
      startDate: "2026-08-21",
      status: "active",
      currentStage: "day4",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }],
    cycles: [{
      id: "cycle-1",
      knowledgePointId: "knowledge-1",
      startedAt: now.toISOString(),
      isCurrent: true,
      events: [{
        id: "review-1",
        knowledgePointId: "knowledge-1",
        stage: "day4",
        originalPlannedDate: "2026-08-25",
        currentPlannedDate: "2026-08-25",
        status: "pending",
      }],
    }],
  };
}

describe("buildDesktopIslandContentSnapshot", () => {
  it("projects bounded task and actionable review content", () => {
    const tasks = createEmptyDesktopIslandTaskState();
    tasks.tasks = [
      { id: "task-1", title: "整理考研阅读笔记", done: true, createdAt: now.toISOString(), updatedAt: now.toISOString() },
      { id: "task-2", title: "完成 10 道数学真题", done: false, createdAt: now.toISOString(), updatedAt: now.toISOString() },
      { id: "task-3", title: "复盘今天的错题", done: false, createdAt: now.toISOString(), updatedAt: now.toISOString() },
      { id: "task-4", title: "不应投影的第四项", done: false, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    ];

    const snapshot = buildDesktopIslandContentSnapshot(tasks, reviewState(), now);

    expect(snapshot.tasks).toMatchObject({ completed: 1, remaining: 3, total: 4, progressPercent: 25 });
    expect(snapshot.tasks.items.map((item) => item.id)).toEqual(["task-1", "task-2", "task-3"]);
    expect(snapshot.review).toMatchObject({ actionableCount: 1, overdueCount: 1, dueTodayCount: 0 });
    expect(snapshot.review.items[0]).toEqual({
      estimatedMinutes: 25,
      knowledgePointId: "knowledge-1",
      overdueDays: 1,
      plannedDate: "2026-08-25",
      projectName: "线性代数",
      stageLabel: "Day 4",
      title: "特征值与特征向量",
      urgency: "overdue",
    });
  });

  it("does not expose upcoming review items as today's work", () => {
    const state = reviewState();
    state.cycles[0].events[0].currentPlannedDate = "2026-08-27";
    state.cycles[0].events[0].originalPlannedDate = "2026-08-27";

    const snapshot = buildDesktopIslandContentSnapshot(createEmptyDesktopIslandTaskState(), state, now);

    expect(snapshot.review.actionableCount).toBe(0);
    expect(snapshot.review.items).toEqual([]);
    expect(snapshot.review.progressPercent).toBeNull();
  });
});
