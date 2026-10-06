import {
  READING_RESUME_STORAGE_KEY, clearReadingResume, parseReadingResumeState,
  readReadingResume, rememberReadingResume,
} from "@/features/reading/reading-resume-store";

describe("reading resume storage", () => {
  beforeEach(() => localStorage.clear());

  it("reads existing progress using the unchanged key and supports both paragraph and PDF positions", () => {
    const existing = { version: 1, sourceId: "source-1", lastOpenedAt: "2026-10-05T01:00:00Z", position: { kind: "paragraph", paragraphId: "p2" } };
    localStorage.setItem("auris.reading.resume.v1", JSON.stringify(existing));
    expect(readReadingResume()).toEqual(existing);
    rememberReadingResume("source-1", { kind: "pdf", page: 8 });
    expect(readReadingResume()?.position).toEqual({ kind: "pdf", page: 8 });
    clearReadingResume();
    expect(localStorage.getItem(READING_RESUME_STORAGE_KEY)).toBeNull();
  });

  it("rejects invalid page numbers and corrupted records", () => {
    expect(parseReadingResumeState({ version: 1, sourceId: "a", lastOpenedAt: "2026-10-05T01:00:00Z", position: { kind: "pdf", page: 0 } })).toBeNull();
    localStorage.setItem(READING_RESUME_STORAGE_KEY, "{broken");
    expect(readReadingResume()).toBeNull();
  });
});
