import { describe, expect, it } from "vitest";
import { mapWordTimestamps } from "@/features/audio/map-word-timestamps";

describe("mapWordTimestamps", () => {
  it("maps transcript word timings back onto normalized token order", () => {
    const mapped = mapWordTimestamps({
      tokens: ["Learning", "a", "language"],
      transcriptWords: [
        { word: "Learning", startMs: 0, endMs: 320 },
        { word: "a", startMs: 321, endMs: 410 },
        { word: "language", startMs: 411, endMs: 860 },
      ],
    });

    expect(mapped[2].endMs).toBe(860);
  });

  it("throws when transcript words cannot be aligned in order", () => {
    expect(() =>
      mapWordTimestamps({
        tokens: ["Learning", "a"],
        transcriptWords: [{ word: "language", startMs: 0, endMs: 300 }],
      }),
    ).toThrow("ALIGNMENT_FAILED");
  });
});
