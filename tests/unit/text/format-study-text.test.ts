import { describe, expect, it } from "vitest";
import { formatTextForSentenceStudy } from "@/features/text/format-study-text";

describe("formatTextForSentenceStudy", () => {
  it("splits a long paragraph into one sentence per line", () => {
    expect(
      formatTextForSentenceStudy(
        "Learning a language is hard. But rhythm makes it easier! Can we train every day?",
      ),
    ).toBe(
      [
        "Learning a language is hard.",
        "But rhythm makes it easier!",
        "Can we train every day?",
      ].join("\n"),
    );
  });

  it("preserves paragraph breaks while enforcing single-sentence lines", () => {
    expect(
      formatTextForSentenceStudy(
        "First paragraph ends here. Another sentence follows.\n\nSecond block starts now. It ends here.",
      ),
    ).toBe(
      [
        "First paragraph ends here.",
        "Another sentence follows.",
        "",
        "Second block starts now.",
        "It ends here.",
      ].join("\n"),
    );
  });
});
