import { describe, expect, it } from "vitest";
import { getNotesTextMetrics } from "@/features/notes/editor/notes-text-metrics";

describe("notes text metrics", () => {
  it("counts reader-visible text instead of Markdown syntax", () => {
    expect(
      getNotesTextMetrics("# 标题\n\n**你好** [world](https://example.com)\n`hidden code`"),
    ).toEqual({
      characters: 9,
      words: 5,
    });
  });
});
