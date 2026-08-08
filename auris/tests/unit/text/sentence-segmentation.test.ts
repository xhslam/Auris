import { describe, expect, it } from "vitest";
import { splitIntoSentences } from "@/features/text/sentence-segmentation";

describe("splitIntoSentences", () => {
  it("keeps punctuation attached to each sentence", () => {
    expect(splitIntoSentences("Hello world. How are you?")).toEqual([
      "Hello world.",
      "How are you?",
    ]);
  });

  it("falls back to a single sentence when punctuation is absent", () => {
    expect(splitIntoSentences("Shadowing builds confidence")).toEqual([
      "Shadowing builds confidence",
    ]);
  });
});
