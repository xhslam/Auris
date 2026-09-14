import type { HomeData } from "@/features/home/home-store";
import {
  STAGE_LABELS,
  getDashboardMetrics,
  getReviewQueue,
  toLocalDateKey,
  type OutputReviewState,
  type ReviewDifficulty,
} from "@/features/output-review/output-review-model";
import type {
  DesktopIslandContentSnapshot,
  DesktopIslandReviewItem,
} from "@/features/desktop-island/desktop-island.types";

const MAX_PROJECTED_TASKS = 3;
const MAX_PROJECTED_REVIEWS = 1;
const MAX_TITLE_LENGTH = 120;

function compactText(value: string, fallback: string): string {
  const text = value.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_LENGTH);
  return text || fallback;
}

function estimatedMinutes(difficulty: ReviewDifficulty | undefined): number {
  if (difficulty === "easy") return 15;
  if (difficulty === "hard") return 25;
  return 20;
}

function projectReviewItem(
  item: ReturnType<typeof getReviewQueue>[number],
): DesktopIslandReviewItem {
  return {
    estimatedMinutes: estimatedMinutes(item.knowledgePoint.difficulty),
    knowledgePointId: item.knowledgePoint.id,
    overdueDays: item.overdueDays,
    plannedDate: item.event.currentPlannedDate,
    projectName: compactText(item.project.name, "未分类项目"),
    stageLabel: STAGE_LABELS[item.event.stage],
    title: compactText(item.knowledgePoint.title, "未命名知识点"),
    urgency: item.urgency === "overdue" ? "overdue" : "today",
  };
}

export function buildDesktopIslandContentSnapshot(
  homeData: HomeData,
  reviewState: OutputReviewState,
  now = new Date(),
): DesktopIslandContentSnapshot {
  const dateKey = toLocalDateKey(now);
  const completed = homeData.plans.filter((item) => item.done).length;
  const total = homeData.plans.length;
  const queue = getReviewQueue(reviewState, dateKey).filter(
    (item) => item.urgency !== "upcoming",
  );
  const metrics = getDashboardMetrics(reviewState, dateKey);
  const reviewDenominator = metrics.completedToday + queue.length;

  return {
    dateKey,
    generatedAt: now.toISOString(),
    review: {
      actionableCount: queue.length,
      completedToday: metrics.completedToday,
      dueTodayCount: metrics.dueTodayCount,
      items: queue.slice(0, MAX_PROJECTED_REVIEWS).map(projectReviewItem),
      overdueCount: metrics.overdueCount,
      progressPercent: reviewDenominator > 0
        ? Math.round((metrics.completedToday / reviewDenominator) * 100)
        : null,
    },
    tasks: {
      completed,
      items: homeData.plans.slice(0, MAX_PROJECTED_TASKS).map((item) => ({
        done: item.done,
        id: item.id,
        title: compactText(item.title, "未命名任务"),
      })),
      progressPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
      remaining: total - completed,
      total,
    },
    version: 1,
  };
}
