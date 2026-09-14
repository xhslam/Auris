import type { DesktopBridge } from "@/platform/desktop/desktop-bridge";
import {
  EMPTY_HOME_VIDEO_SUMMARY,
  type HomeVideoSummary,
  type VideoResumeState,
} from "@/features/home-learning/home-learning.types";
import {
  clearVideoResume,
  VIDEO_COMPLETION_THRESHOLD,
} from "@/features/home-learning/video-resume-store";

type VideoLibraryBridge = NonNullable<DesktopBridge["videoLibrary"]>;

function durationFromDetails(
  detail: Awaited<ReturnType<VideoLibraryBridge["getVideoDetails"]>>,
): number | null {
  if (!detail) return null;
  const milliseconds = detail.variants.find(
    (variant) => variant.status === "ready" && variant.playbackUrl,
  )?.durationMs ?? detail.video.durationMs;
  return typeof milliseconds === "number" && Number.isFinite(milliseconds) && milliseconds > 0
    ? milliseconds / 1000
    : null;
}

export async function loadHomeVideoSummary(
  resume: VideoResumeState | null,
  videoLibrary: VideoLibraryBridge | null,
): Promise<HomeVideoSummary> {
  if (!resume) return { ...EMPTY_HOME_VIDEO_SUMMARY };
  if (!videoLibrary) return { ...EMPTY_HOME_VIDEO_SUMMARY, status: "unavailable" };

  try {
    const detail = await videoLibrary.getVideoDetails(resume.videoId);
    const playable = detail?.video.importState === "ready" && detail.variants.some(
      (variant) => variant.status === "ready" && Boolean(variant.playbackUrl),
    );
    if (!detail || !playable) {
      clearVideoResume();
      return { ...EMPTY_HOME_VIDEO_SUMMARY };
    }

    const durationSeconds = durationFromDetails(detail);
    const currentTimeSeconds = durationSeconds === null
      ? resume.currentTimeSeconds
      : Math.min(resume.currentTimeSeconds, durationSeconds);
    const completed = Boolean(
      resume.completedAt ||
      (durationSeconds && durationSeconds > 0 && currentTimeSeconds / durationSeconds >= VIDEO_COMPLETION_THRESHOLD),
    );

    return {
      status: "ready",
      videoId: detail.video.id,
      title: detail.video.title,
      currentTimeSeconds,
      durationSeconds,
      completed,
      lastOpenedAt: resume.lastOpenedAt,
    };
  } catch {
    return { ...EMPTY_HOME_VIDEO_SUMMARY, status: "unavailable" };
  }
}
