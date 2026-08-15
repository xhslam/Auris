import { describe, expect, it } from "vitest";
import {
  buildLearningAssetLineage,
  buildLearningAssetLineageSection,
} from "@/features/learning-memory/learning-asset-lineage";

describe("learning asset lineage", () => {
  it("deduplicates and sorts source assets without exposing mutable records", () => {
    const lineage = buildLearningAssetLineage({
      sessionId: "session-7",
      sourceNotePath: "sources/rhythm.md",
      sentences: [
        { id: "sentence-2", sourceLabel: "Rhythm", sourceNotePath: "sources/rhythm.md", text: "Two", translation: "", createdAt: "2026-01-01" },
        { id: "sentence-1", sourceLabel: "Stress", sourceNotePath: "sources/stress.md", text: "One", translation: "", createdAt: "2026-01-01" },
      ],
      words: [
        { word: "Rhythm", sourceLabel: "Dictionary", sourceNotePath: "sources/rhythm.md", definitions: [], lexicalCategory: "noun", synonyms: [], createdAt: "2026-01-01" },
      ],
    });
    expect(lineage).toEqual({
      sentenceIds: ["sentence-1", "sentence-2"],
      sourceNotePaths: ["sources/rhythm.md", "sources/stress.md"],
      sourceSessionId: "session-7",
      wordIds: ["rhythm"],
    });
  });

  it("renders a wiki-linkable provenance section", () => {
    expect(
      buildLearningAssetLineageSection({
        sourceNotePath: "sources/rhythm.md",
        sessionId: null,
        sentences: [],
        words: [],
      }).join("\n"),
    ).toContain("- Source note: [[sources/rhythm.md]]");
  });
});
