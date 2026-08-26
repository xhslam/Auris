import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  normalizeDesktopIslandSnapshot,
  semanticSnapshotFingerprint,
} = require("../../../electron/desktop-island/desktop-island-contract.cjs") as {
  normalizeDesktopIslandSnapshot: (value: unknown) => Record<string, unknown>;
  semanticSnapshotFingerprint: (value: Record<string, unknown>) => string;
};

function snapshot() {
  return {
    dateKey: "2026-08-26",
    generatedAt: "2026-08-26T02:00:00.000Z",
    review: {
      actionableCount: 1,
      completedToday: 0,
      dueTodayCount: 0,
      items: [{
        estimatedMinutes: 25,
        knowledgePointId: "review-1",
        overdueDays: 1,
        plannedDate: "2026-08-25",
        projectName: "线性代数",
        stageLabel: "Day 4",
        title: "特征值",
        urgency: "overdue",
      }],
      overdueCount: 1,
      progressPercent: 0,
    },
    tasks: {
      completed: 1,
      items: [{ done: false, id: "task-1", title: "整理笔记" }],
      progressPercent: 50,
      remaining: 1,
      total: 2,
    },
    version: 1,
  };
}

describe("desktop island native contract", () => {
  it("accepts a bounded projection and excludes generatedAt from its semantic fingerprint", () => {
    const first = normalizeDesktopIslandSnapshot(snapshot());
    const second = normalizeDesktopIslandSnapshot({
      ...snapshot(),
      generatedAt: "2026-08-26T03:00:00.000Z",
    });
    expect(semanticSnapshotFingerprint(first)).toBe(semanticSnapshotFingerprint(second));
  });

  it("rejects unknown fields and inconsistent aggregates", () => {
    expect(() => normalizeDesktopIslandSnapshot({ ...snapshot(), arbitrary: true })).toThrow();
    expect(() => normalizeDesktopIslandSnapshot({
      ...snapshot(),
      tasks: { ...snapshot().tasks, completed: 2 },
    })).toThrow();
  });

  it("rejects extra review rows and non-boolean task state", () => {
    expect(() => normalizeDesktopIslandSnapshot({
      ...snapshot(),
      review: { ...snapshot().review, items: [...snapshot().review.items, ...snapshot().review.items] },
    })).toThrow();
    expect(() => normalizeDesktopIslandSnapshot({
      ...snapshot(),
      tasks: { ...snapshot().tasks, items: [{ done: "yes", id: "task-1", title: "整理笔记" }] },
    })).toThrow();
  });
});
