import { describe, expect, it } from "vitest";
import { buildRelatedMemory } from "@/features/learning-memory/memory-recall-engine";

describe("memory-recall-engine", () => {
  it("returns no recall items for empty imported material", () => {
    const results = buildRelatedMemory({
      materialText: "   ",
      notes: [
        {
          content: "Practice rhythm with short loops.",
          path: "Learning/rhythm.md",
          tags: ["shadowing"],
          title: "Rhythm Review",
        },
      ],
      sentences: [],
      words: [],
    });

    expect(results).toEqual([]);
  });

  it("recalls saved words that appear in the imported material", () => {
    const results = buildRelatedMemory({
      materialText: "Natural rhythm matters when you shadow a sentence.",
      notes: [],
      sentences: [],
      words: [
        {
          createdAt: "2026-05-03T00:00:00.000Z",
          definitions: ["a regular repeated pattern of sound"],
          lexicalCategory: "noun",
          sourceLabel: "dictionary",
          synonyms: ["beat"],
          word: "rhythm",
        },
      ],
    });

    expect(results).toMatchObject([
      {
        id: "word:rhythm",
        preview: "a regular repeated pattern of sound",
        reasons: ["contains saved word: rhythm"],
        title: "rhythm",
        type: "word",
      },
    ]);
    expect(results[0]?.score).toBeGreaterThanOrEqual(80);
  });

  it("recalls saved sentences by phrase overlap", () => {
    const results = buildRelatedMemory({
      materialText: "Today I need to keep breathing steady during the talk.",
      notes: [],
      sentences: [
        {
          createdAt: "2026-05-02T00:00:00.000Z",
          id: "sentence-1",
          sourceLabel: "Daily Review",
          text: "Keep breathing steady before you answer.",
          translation: "回答前保持呼吸稳定。",
        },
      ],
      words: [],
    });

    expect(results[0]).toMatchObject({
      id: "sentence:sentence-1",
      reasons: ["overlaps saved sentence: keep breathing steady"],
      title: "Keep breathing steady before you answer.",
      type: "sentence",
    });
  });

  it("recalls notes by title, tag, and body overlap with visible reasons", () => {
    const results = buildRelatedMemory({
      materialText: "We will practice shadowing rhythm and intonation.",
      notes: [
        {
          content: "Intonation drills make the speaking line easier to imitate.",
          path: "Learning/rhythm-review.md",
          tags: ["shadowing"],
          title: "Rhythm Review",
        },
      ],
      sentences: [],
      words: [],
    });

    expect(results[0]).toMatchObject({
      id: "note:Learning/rhythm-review.md",
      reasons: [
        "note title overlaps: rhythm",
        "tag: shadowing",
        "note body overlaps: intonation",
      ],
      targetPath: "Learning/rhythm-review.md",
      title: "Rhythm Review",
      type: "note",
    });
  });

  it("sorts stronger matches before weaker matches", () => {
    const results = buildRelatedMemory({
      materialText: "Rhythm and breathing matter in this shadowing drill.",
      notes: [
        {
          content: "A general note about meetings.",
          path: "Learning/meeting.md",
          tags: [],
          title: "Meeting",
        },
      ],
      sentences: [
        {
          createdAt: "2026-05-02T00:00:00.000Z",
          id: "sentence-1",
          sourceLabel: "Daily Review",
          text: "Rhythm and breathing matter.",
          translation: "",
        },
      ],
      words: [
        {
          createdAt: "2026-05-03T00:00:00.000Z",
          definitions: ["a repeated pattern"],
          lexicalCategory: "noun",
          sourceLabel: "dictionary",
          synonyms: [],
          word: "rhythm",
        },
      ],
    });

    expect(results.map((item) => item.type)).toEqual(["sentence", "word"]);
  });
});
