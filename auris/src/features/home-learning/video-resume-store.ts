import type { VideoResumeState } from "@/features/home-learning/home-learning.types";

export const VIDEO_RESUME_STORAGE_KEY = "auris.video.resume.v1";
export const VIDEO_RESUME_CHANGED_EVENT = "auris:video-resume-changed";
export const VIDEO_COMPLETION_THRESHOLD = 0.98;

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function parseVideoResumeState(value: unknown): VideoResumeState | null {
  if (!value || typeof value !== "object") return null;
  const state = value as Partial<VideoResumeState>;
  if (
    state.version !== 1 ||
    typeof state.videoId !== "string" ||
    !state.videoId.trim() ||
    typeof state.currentTimeSeconds !== "number" ||
    !Number.isFinite(state.currentTimeSeconds) ||
    state.currentTimeSeconds < 0 ||
    !isValidTimestamp(state.lastOpenedAt) ||
    !(state.completedAt === null || isValidTimestamp(state.completedAt))
  ) {
    return null;
  }
  return {
    version: 1,
    videoId: state.videoId,
    currentTimeSeconds: state.currentTimeSeconds,
    lastOpenedAt: state.lastOpenedAt,
    completedAt: state.completedAt,
  };
}

export function readVideoResume(storage: Storage | null = getStorage()): VideoResumeState | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(VIDEO_RESUME_STORAGE_KEY);
    return raw ? parseVideoResumeState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function dispatchChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(VIDEO_RESUME_CHANGED_EVENT));
  }
}

export function writeVideoResume(
  state: VideoResumeState,
  storage: Storage | null = getStorage(),
): boolean {
  const valid = parseVideoResumeState(state);
  if (!storage || !valid) return false;
  try {
    storage.setItem(VIDEO_RESUME_STORAGE_KEY, JSON.stringify(valid));
    dispatchChange();
    return true;
  } catch {
    return false;
  }
}

export function rememberVideoResume({
  videoId,
  currentTimeSeconds,
  durationSeconds,
  now = new Date(),
}: {
  videoId: string;
  currentTimeSeconds: number;
  durationSeconds: number;
  now?: Date;
}): boolean {
  if (!videoId || !Number.isFinite(currentTimeSeconds) || currentTimeSeconds < 0) return false;
  const boundedDuration = Number.isFinite(durationSeconds) && durationSeconds > 0
    ? durationSeconds
    : 0;
  const boundedTime = boundedDuration > 0
    ? Math.min(currentTimeSeconds, boundedDuration)
    : currentTimeSeconds;
  const completed = boundedDuration > 0 && boundedTime / boundedDuration >= VIDEO_COMPLETION_THRESHOLD;
  return writeVideoResume({
    version: 1,
    videoId,
    currentTimeSeconds: boundedTime,
    lastOpenedAt: now.toISOString(),
    completedAt: completed ? now.toISOString() : null,
  });
}

export function touchVideoResume(videoId: string, now = new Date()): boolean {
  const current = readVideoResume();
  if (current?.videoId === videoId) {
    return writeVideoResume({ ...current, lastOpenedAt: now.toISOString() });
  }
  return writeVideoResume({
    version: 1,
    videoId,
    currentTimeSeconds: 0,
    lastOpenedAt: now.toISOString(),
    completedAt: null,
  });
}

export function getVideoResumeStartTime(
  resume: VideoResumeState | null,
  durationSeconds: number,
): number {
  if (!resume || resume.completedAt || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return 0;
  }
  return Math.min(Math.max(resume.currentTimeSeconds, 0), Math.max(0, durationSeconds - 2));
}

export function clearVideoResume(storage: Storage | null = getStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(VIDEO_RESUME_STORAGE_KEY);
    dispatchChange();
  } catch {
    // 不可用的本地存储不应阻断视频页面。
  }
}
