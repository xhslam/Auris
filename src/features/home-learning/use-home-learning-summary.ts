"use client";

import { useEffect, useState } from "react";
import { getNotesStorage } from "@/platform/notes/get-notes-storage";
import { getDesktopVideoLibraryBridge } from "@/platform/desktop/video-library-adapter";
import {
  OUTPUT_REVIEW_STORAGE_EVENT,
  OUTPUT_REVIEW_STORAGE_KEY,
  readOutputReviewStateResult,
} from "@/features/output-review/output-review-storage";
import { getHomeReviewSummary } from "@/features/home-learning/home-review-summary";
import { loadHomeReadingSummary } from "@/features/home-learning/home-reading-summary";
import { loadHomeVideoSummary } from "@/features/home-learning/home-video-summary";
import { loadHomeLearningNoteSummary } from "@/features/home-learning/home-learning-note-summary";
import {
  READING_RESUME_CHANGED_EVENT,
  READING_RESUME_STORAGE_KEY,
  readReadingResume,
} from "@/features/home-learning/reading-resume-store";
import {
  VIDEO_RESUME_CHANGED_EVENT,
  VIDEO_RESUME_STORAGE_KEY,
  readVideoResume,
} from "@/features/home-learning/video-resume-store";
import {
  loadingHomeLearningSummary,
  type HomeLearningSummary,
} from "@/features/home-learning/home-learning.types";

export const READING_PROGRESS_CHANGED_EVENT = "auris:reading-progress-changed";

function millisecondsUntilNextLocalMidnight(now: Date): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 250);
  return Math.max(500, next.getTime() - now.getTime());
}

/**
 * 首页唯一的学习数据入口。每种来源独立恢复，任一失败不会将其它卡片降级。
 */
export function useHomeLearningSummary(): HomeLearningSummary {
  const [summary, setSummary] = useState<HomeLearningSummary>(loadingHomeLearningSummary);

  useEffect(() => {
    let cancelled = false;
    let midnightTimer: number | null = null;
    const notesStorage = getNotesStorage();
    const videoLibrary = getDesktopVideoLibraryBridge();

    const scheduleMidnightRefresh = () => {
      if (midnightTimer) window.clearTimeout(midnightTimer);
      midnightTimer = window.setTimeout(() => {
        void refresh();
      }, millisecondsUntilNextLocalMidnight(new Date()));
    };

    const refresh = async () => {
      const now = new Date();
      const review = getHomeReviewSummary(
        readOutputReviewStateResult(window.localStorage),
        now,
      );
      const readingResume = readReadingResume();
      const videoResume = readVideoResume();
      if (cancelled) return;
      setSummary((current) => ({ ...current, review }));

      const [reading, video, note] = await Promise.all([
        loadHomeReadingSummary(notesStorage, readingResume),
        loadHomeVideoSummary(videoResume, videoLibrary),
        loadHomeLearningNoteSummary(notesStorage),
      ]);
      if (cancelled) return;

      setSummary({
        review,
        reading,
        continueLearning: { article: reading, video, note },
      });
      scheduleMidnightRefresh();
    };

    const handleStorage = (event: StorageEvent) => {
      if (
        event.storageArea === window.localStorage &&
        [
          OUTPUT_REVIEW_STORAGE_KEY,
          READING_RESUME_STORAGE_KEY,
          VIDEO_RESUME_STORAGE_KEY,
        ].includes(event.key ?? "")
      ) {
        void refresh();
      }
    };
    const handleFocus = () => { void refresh(); };
    const handleSourceChange = () => { void refresh(); };

    void refresh();
    window.addEventListener(OUTPUT_REVIEW_STORAGE_EVENT, handleSourceChange);
    window.addEventListener(READING_PROGRESS_CHANGED_EVENT, handleSourceChange);
    window.addEventListener(READING_RESUME_CHANGED_EVENT, handleSourceChange);
    window.addEventListener(VIDEO_RESUME_CHANGED_EVENT, handleSourceChange);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleFocus);
    const unsubscribeNotes = notesStorage?.subscribeToChanges?.(handleSourceChange);

    return () => {
      cancelled = true;
      if (midnightTimer) window.clearTimeout(midnightTimer);
      window.removeEventListener(OUTPUT_REVIEW_STORAGE_EVENT, handleSourceChange);
      window.removeEventListener(READING_PROGRESS_CHANGED_EVENT, handleSourceChange);
      window.removeEventListener(READING_RESUME_CHANGED_EVENT, handleSourceChange);
      window.removeEventListener(VIDEO_RESUME_CHANGED_EVENT, handleSourceChange);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleFocus);
      unsubscribeNotes?.();
    };
  }, []);

  return summary;
}
