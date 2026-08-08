import { describe, expect, it } from "vitest";
import {
  appendSentenceToSourceMaterialBody,
  appendWordToSourceMaterialBody,
  buildSourceMaterialNotePage,
} from "@/features/learning-memory/source-material-note";

describe("source-material-note", () => {
  it("builds a source note with frontmatter, original text, sentence splits, and capture areas", () => {
    const page = buildSourceMaterialNotePage({
      audioPath: "/api/audio/session-1",
      createdAt: "2026-05-09T00:00:00.000Z",
      originalText: "Natural rhythm matters. Practice clearly.",
      sourceType: "url",
      sourceUrl: "https://example.com/article",
      text: "Natural rhythm matters.\nPractice clearly.",
      title: "Reader Import",
    });

    expect(page.relativePath).toMatch(/^Sources\/reader-import--source-/);
    expect(page.frontmatter).toMatchObject({
      audioPath: "/api/audio/session-1",
      createdAt: "2026-05-09T00:00:00.000Z",
      sourceType: "url",
      sourceUrl: "https://example.com/article",
      type: "source-material",
    });
    expect(page.markdownBody).toContain("## Original\n\nNatural rhythm matters. Practice clearly.");
    expect(page.markdownBody).toContain("## Sentences\n\n1. Natural rhythm matters.");
    expect(page.markdownBody).toContain("2. Practice clearly.");
    expect(page.markdownBody).toContain("## Excerpts");
    expect(page.markdownBody).toContain("## Vocabulary");
  });

  it("appends saved sentences and words into stable capture sections", () => {
    const page = buildSourceMaterialNotePage({
      createdAt: "2026-05-09T00:00:00.000Z",
      sourceType: "paste",
      text: "Natural rhythm matters.",
      title: "Rhythm Drill",
    });
    const withSentence = appendSentenceToSourceMaterialBody(page.markdownBody, {
      createdAt: "2026-05-09T00:01:00.000Z",
      id: "sentence-1",
      sourceLabel: "Rhythm Drill",
      sourceNotePath: page.relativePath,
      text: "Natural rhythm matters.",
      translation: "",
    });
    const withWord = appendWordToSourceMaterialBody(withSentence, {
      createdAt: "2026-05-09T00:02:00.000Z",
      definitions: ["a repeated pattern of sound"],
      lexicalCategory: "noun",
      sourceLabel: "离线词典",
      sourceNotePath: page.relativePath,
      synonyms: ["cadence"],
      word: "rhythm",
    });

    expect(withWord).toContain("- [sentence-1] Natural rhythm matters.");
    expect(withWord).toContain("- **rhythm** _(noun)_ - a repeated pattern of sound");
    expect(withWord).toContain(`source: [[${page.relativePath}]]`);
  });
});
