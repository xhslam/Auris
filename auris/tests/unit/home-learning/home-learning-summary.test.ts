import {
  EMPTY_OUTPUT_REVIEW_STATE,
  completeCurrentReview,
  createKnowledgePoint,
  createProject,
} from "@/features/output-review/output-review-model";
import { getHomeLearningNoteSummary, isNoteInsideLearningFolder } from "@/features/home-learning/home-learning-note-summary";
import { getHomeReviewSummary } from "@/features/home-learning/home-review-summary";
import { getHomeReadingSummary } from "@/features/home-learning/home-reading-summary";
import { getVideoResumeStartTime, parseVideoResumeState } from "@/features/home-learning/video-resume-store";
import type { ReadingSource } from "@/features/reading/reading-fixtures";

function reviewFixture(startDate: string, createdAt: Date) {
  const withProject = createProject(EMPTY_OUTPUT_REVIEW_STATE, { name: "数学" }, createdAt);
  return createKnowledgePoint(
    withProject,
    {
      title: "矩阵相似",
      projectId: withProject.projects[0]!.id,
      startDate,
      tags: [],
    },
    createdAt,
  );
}

const readingSource: ReadingSource = {
  id: "reading-1",
  title: "真实导入文章",
  category: "article",
  estimatedMinutes: 5,
  kicker: "Reading",
  progress: 0,
  paragraphs: [
    { id: "p-1", order: 1, english: "One", translation: "一", analysis: "", wordKeys: [] },
    { id: "p-2", order: 2, english: "Two", translation: "二", analysis: "", wordKeys: [] },
  ],
};

describe("home learning summaries", () => {
  it("does not count future review events as actionable and keeps today-created count", () => {
    const state = reviewFixture("2026-08-20", new Date(2026, 7, 20, 9));
    const summary = getHomeReviewSummary({ status: "ready", state }, new Date(2026, 7, 20, 12));

    expect(summary).toMatchObject({
      status: "ready",
      actionableCount: 0,
      dueTodayCount: 0,
      overdueCount: 0,
      createdToday: 1,
      progressPercent: null,
      nextKnowledgePoint: null,
    });
  });

  it("keeps the add-knowledge reminder signal after completing an old review", () => {
    let state = reviewFixture("2026-08-16", new Date(2026, 7, 16, 9));
    state = completeCurrentReview(state, state.knowledgePoints[0]!.id, new Date(2026, 7, 17, 9));
    const summary = getHomeReviewSummary({ status: "ready", state }, new Date(2026, 7, 17, 13));

    expect(summary.completedToday).toBe(1);
    expect(summary.createdToday).toBe(0);
    expect(summary.actionableCount).toBe(0);
  });

  it("does not recover a removed source or use fixture progress as user progress", () => {
    const resume = {
      version: 1 as const,
      sourceId: "reading-1",
      lastOpenedAt: "2026-08-20T09:00:00.000Z",
      position: { kind: "paragraph" as const, paragraphId: "p-2" },
    };
    expect(getHomeReadingSummary(resume, [readingSource], {})).toMatchObject({
      status: "ready",
      progressPercent: 0,
      positionLabel: "第 2 / 2 段",
    });
    expect(getHomeReadingSummary(resume, [], {})).toMatchObject({ status: "empty" });
  });

  it("validates video positions and restarts completed videos at zero", () => {
    expect(parseVideoResumeState({
      version: 1,
      videoId: "v1",
      currentTimeSeconds: -1,
      lastOpenedAt: "2026-08-20T09:00:00.000Z",
      completedAt: null,
    })).toBeNull();
    expect(getVideoResumeStartTime({
      version: 1,
      videoId: "v1",
      currentTimeSeconds: 598,
      lastOpenedAt: "2026-08-20T09:00:00.000Z",
      completedAt: "2026-08-20T09:10:00.000Z",
    }, 600)).toBe(0);
  });

  it("uses folder boundaries, supports valid-empty directories, and reports missing ones", () => {
    expect(isNoteInsideLearningFolder("mathematics/notes/a.md", "math")).toBe(false);
    const summary = getHomeLearningNoteSummary({
      folders: { version: 1, relativePaths: ["math", "physics"] },
      entries: [{ kind: "directory", path: "math", name: "math", mtime: null, size: null }],
      notes: [],
    });
    expect(summary).toMatchObject({
      status: "empty",
      configuredFolders: ["math", "physics"],
      missingFolders: ["physics"],
      note: null,
    });
  });
});
