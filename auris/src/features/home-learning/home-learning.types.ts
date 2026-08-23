import type { NotePageSummary } from "@/features/notes/note-types";
import type {
  ReadingSourceCategory,
  ReadingSourceFormat,
} from "@/features/reading/reading-fixtures";

export type LearningSourceStatus = "loading" | "ready" | "empty" | "unavailable";

export type ReadingResumePosition =
  | { kind: "paragraph"; paragraphId: string }
  | { kind: "pdf"; page: number }
  | { kind: "unknown" };

export type ReadingResumeState = {
  version: 1;
  sourceId: string;
  lastOpenedAt: string;
  position: ReadingResumePosition;
};

export type VideoResumeState = {
  version: 1;
  videoId: string;
  currentTimeSeconds: number;
  lastOpenedAt: string;
  completedAt: string | null;
};

export type HomeReviewSummary = {
  status: LearningSourceStatus;
  actionableCount: number;
  overdueCount: number;
  dueTodayCount: number;
  completedToday: number;
  createdToday: number;
  progressPercent: number | null;
  nextKnowledgePoint: {
    id: string;
    title: string;
    urgency: "overdue" | "today";
    overdueDays: number;
  } | null;
};

export type HomeReadingSummary = {
  status: LearningSourceStatus;
  sourceId: string | null;
  title: string | null;
  category: ReadingSourceCategory | null;
  format: ReadingSourceFormat | null;
  progressPercent: number | null;
  positionLabel: string | null;
  lastOpenedAt: string | null;
};

export type HomeVideoSummary = {
  status: LearningSourceStatus;
  videoId: string | null;
  title: string | null;
  currentTimeSeconds: number | null;
  durationSeconds: number | null;
  completed: boolean;
  lastOpenedAt: string | null;
};

export type HomeLearningNoteSummary = {
  status: LearningSourceStatus;
  note: NotePageSummary | null;
};

export type HomeLearningSummary = {
  review: HomeReviewSummary;
  reading: HomeReadingSummary;
  continueLearning: {
    article: HomeReadingSummary;
    video: HomeVideoSummary;
    note: HomeLearningNoteSummary;
  };
};

export const EMPTY_HOME_REVIEW_SUMMARY: HomeReviewSummary = {
  status: "empty",
  actionableCount: 0,
  overdueCount: 0,
  dueTodayCount: 0,
  completedToday: 0,
  createdToday: 0,
  progressPercent: null,
  nextKnowledgePoint: null,
};

export const EMPTY_HOME_READING_SUMMARY: HomeReadingSummary = {
  status: "empty",
  sourceId: null,
  title: null,
  category: null,
  format: null,
  progressPercent: null,
  positionLabel: null,
  lastOpenedAt: null,
};

export const EMPTY_HOME_VIDEO_SUMMARY: HomeVideoSummary = {
  status: "empty",
  videoId: null,
  title: null,
  currentTimeSeconds: null,
  durationSeconds: null,
  completed: false,
  lastOpenedAt: null,
};

export const EMPTY_HOME_LEARNING_NOTE_SUMMARY: HomeLearningNoteSummary = {
  status: "empty",
  note: null,
};

export function loadingHomeLearningSummary(): HomeLearningSummary {
  return {
    review: { ...EMPTY_HOME_REVIEW_SUMMARY, status: "loading" },
    reading: { ...EMPTY_HOME_READING_SUMMARY, status: "loading" },
    continueLearning: {
      article: { ...EMPTY_HOME_READING_SUMMARY, status: "loading" },
      video: { ...EMPTY_HOME_VIDEO_SUMMARY, status: "loading" },
      note: { ...EMPTY_HOME_LEARNING_NOTE_SUMMARY, status: "loading" },
    },
  };
}
