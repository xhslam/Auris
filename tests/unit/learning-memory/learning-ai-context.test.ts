import { describe, expect, it } from "vitest";
import { buildLearningAiContextPrompt } from "@/features/learning-memory/learning-ai-context";

describe("learning-ai-context", () => {
  it("builds a structured prompt from material, recall, words, and sentences", () => {
    const prompt = buildLearningAiContextPrompt({
      materialText: "Natural rhythm matters when speaking clearly.",
      recallItems: [
        {
          id: "note:Learning/rhythm.md",
          preview: "Old rhythm note",
          reasons: ["note title overlaps: rhythm"],
          score: 50,
          targetPath: "Learning/rhythm.md",
          title: "Rhythm Review",
          type: "note",
        },
      ],
      sentences: [
        {
          createdAt: "2026-05-03T00:00:00.000Z",
          id: "sentence-1",
          sourceLabel: "Daily Review",
          text: "Natural rhythm matters.",
          translation: "自然节奏很重要。",
        },
      ],
      sourceNotePath: "Sources/rhythm-drill--source-abc.md",
      title: "Rhythm Drill",
      words: [
        {
          createdAt: "2026-05-03T00:00:00.000Z",
          definitions: ["a repeated pattern of sound"],
          lexicalCategory: "noun",
          sourceLabel: "dictionary",
          synonyms: [],
          word: "rhythm",
        },
      ],
    });

    expect(prompt).toContain("You are helping me review an English shadowing session.");
    expect(prompt).toContain("Title: Rhythm Drill");
    expect(prompt).toContain("Source note: [[Sources/rhythm-drill--source-abc.md]]");
    expect(prompt).toContain("Natural rhythm matters when speaking clearly.");
    expect(prompt).toContain("rhythm: a repeated pattern of sound");
    expect(prompt).toContain("Natural rhythm matters.");
    expect(prompt).toContain("Rhythm Review - note title overlaps: rhythm");
  });

  it("keeps very long prompts bounded", () => {
    const prompt = buildLearningAiContextPrompt({
      materialText: "rhythm ".repeat(500),
      maxChars: 600,
      recallItems: [],
      sentences: [],
      title: "Long Drill",
      words: [],
    });

    expect(prompt.length).toBeLessThanOrEqual(600);
    expect(prompt.endsWith("…")).toBe(true);
  });
});
