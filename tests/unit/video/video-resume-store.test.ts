import {
  VIDEO_RESUME_STORAGE_KEY, getVideoResumeStartTime, parseVideoResumeState,
  readVideoResume, rememberVideoResume, touchVideoResume,
} from "@/features/video/video-resume-store";

describe("video resume storage", () => {
  beforeEach(() => localStorage.clear());

  it("keeps existing playback progress and timestamps when reopening the same video", () => {
    const existing = { version: 1, videoId: "v1", currentTimeSeconds: 123, lastOpenedAt: "2026-10-05T01:00:00Z", completedAt: null };
    localStorage.setItem("auris.video.resume.v1", JSON.stringify(existing));
    expect(readVideoResume()).toEqual(existing);
    touchVideoResume("v1", new Date("2026-10-06T01:00:00Z"));
    expect(readVideoResume()).toMatchObject({ currentTimeSeconds: 123, lastOpenedAt: "2026-10-06T01:00:00.000Z" });
    expect(getVideoResumeStartTime(readVideoResume(), 600)).toBe(123);
  });

  it("retains the completion threshold and restarts completed videos", () => {
    rememberVideoResume({ videoId: "v1", currentTimeSeconds: 590, durationSeconds: 600 });
    expect(readVideoResume()?.completedAt).not.toBeNull();
    expect(getVideoResumeStartTime(readVideoResume(), 600)).toBe(0);
    touchVideoResume("v2");
    expect(readVideoResume()).toMatchObject({ videoId: "v2", currentTimeSeconds: 0, completedAt: null });
  });

  it("rejects negative positions and bounds unfinished playback to duration", () => {
    expect(parseVideoResumeState({ version: 1, videoId: "v1", currentTimeSeconds: -1, lastOpenedAt: "2026-10-05T01:00:00Z", completedAt: null })).toBeNull();
    localStorage.setItem(VIDEO_RESUME_STORAGE_KEY, JSON.stringify({ version: 1, videoId: "v1", currentTimeSeconds: 1000, lastOpenedAt: "2026-10-05T01:00:00Z", completedAt: null }));
    expect(getVideoResumeStartTime(readVideoResume(), 600)).toBe(598);
  });
});
