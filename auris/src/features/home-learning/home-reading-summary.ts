import type { NotesStorage } from "@/features/notes/note-types";
import {
  loadReadingProgress,
} from "@/features/reading/reading-library-store";
import { loadReadingSourceNotes } from "@/features/reading/reading-source-note";
import type { ReadingSource } from "@/features/reading/reading-fixtures";
import {
  EMPTY_HOME_READING_SUMMARY,
  type HomeReadingSummary,
  type ReadingResumeState,
} from "@/features/home-learning/home-learning.types";
import { clearReadingResume } from "@/features/home-learning/reading-resume-store";

function normalizeProgress(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(100, Math.max(0, Math.round(value)))
    : 0;
}

function positionLabel(source: ReadingSource, resume: ReadingResumeState): string | null {
  const position = resume.position;
  if (position.kind === "paragraph") {
    const index = source.paragraphs.findIndex(
      (paragraph) => paragraph.id === position.paragraphId,
    );
    if (index >= 0) return `第 ${index + 1} / ${source.paragraphs.length} 段`;
    return null;
  }
  if (position.kind === "pdf") return `第 ${position.page} 页`;
  return null;
}

export function getHomeReadingSummary(
  resume: ReadingResumeState | null,
  sources: ReadingSource[],
  progressMap: Record<string, number>,
): HomeReadingSummary {
  if (!resume) return { ...EMPTY_HOME_READING_SUMMARY };
  const source = sources.find((candidate) => candidate.id === resume.sourceId);
  if (!source) {
    clearReadingResume();
    return {
      ...EMPTY_HOME_READING_SUMMARY,
      status: "empty",
    };
  }

  return {
    status: "ready",
    sourceId: source.id,
    title: source.title,
    category: source.category,
    format: source.format ?? "text",
    progressPercent: normalizeProgress(progressMap[source.id]),
    positionLabel: positionLabel(source, resume),
    lastOpenedAt: resume.lastOpenedAt,
  };
}

/** 只加载用户真实保存于 Reading 目录的来源，内置示例永远不会成为首页进度。 */
export async function loadHomeReadingSummary(
  notesStorage: NotesStorage | null,
  resume: ReadingResumeState | null,
): Promise<HomeReadingSummary> {
  if (!resume) return { ...EMPTY_HOME_READING_SUMMARY };
  if (!notesStorage) {
    return { ...EMPTY_HOME_READING_SUMMARY, status: "unavailable" };
  }

  try {
    const sources = await loadReadingSourceNotes(notesStorage);
    return getHomeReadingSummary(resume, sources, loadReadingProgress());
  } catch {
    return { ...EMPTY_HOME_READING_SUMMARY, status: "unavailable" };
  }
}
