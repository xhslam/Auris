import {
  getDashboardMetrics,
  getReviewQueue,
  toLocalDateKey,
} from "@/features/output-review/output-review-model";
import type { OutputReviewReadResult } from "@/features/output-review/output-review-storage";
import {
  EMPTY_HOME_REVIEW_SUMMARY,
  type HomeReviewSummary,
} from "@/features/home-learning/home-learning.types";

/** 只取逾期与今天到期项；未来 1/2/4/7 节点不属于今日执行队列。 */
export function getHomeReviewSummary(
  result: OutputReviewReadResult,
  now = new Date(),
): HomeReviewSummary {
  if (result.status === "invalid" || result.status === "unavailable" || !result.state) {
    return { ...EMPTY_HOME_REVIEW_SUMMARY, status: "unavailable" };
  }

  const today = toLocalDateKey(now);
  const state = result.state;
  const metrics = getDashboardMetrics(state, today);
  const actionableQueue = getReviewQueue(state, today).filter(
    (item) => item.urgency !== "upcoming",
  );
  const actionableCount = actionableQueue.length;
  const createdToday = state.knowledgePoints.filter(
    (point) => toLocalDateKey(point.createdAt) === today,
  ).length;
  const denominator = metrics.completedToday + actionableCount;
  const isEmpty = state.knowledgePoints.length === 0;
  const next = actionableQueue[0] ?? null;
  const nextKnowledgePoint = next && next.urgency !== "upcoming"
    ? {
        id: next.knowledgePoint.id,
        title: next.knowledgePoint.title,
        urgency: next.urgency,
        overdueDays: next.overdueDays,
      }
    : null;

  return {
    status: isEmpty ? "empty" : "ready",
    actionableCount,
    overdueCount: metrics.overdueCount,
    dueTodayCount: metrics.dueTodayCount,
    completedToday: metrics.completedToday,
    createdToday,
    progressPercent: denominator > 0
      ? Math.round((metrics.completedToday / denominator) * 100)
      : null,
    nextKnowledgePoint,
  };
}
