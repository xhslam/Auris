import { describe, expect, it } from "vitest";
import { buildLearningDependencySnapshot } from "@/features/learning-memory/learning-dependency-review";
import { buildLearningNoteMarkdown } from "@/features/learning-memory/learning-note-template";

describe("learning-note-template", () => {
  it("builds a deterministic Markdown learning note", () => {
    const markdown = buildLearningNoteMarkdown({
      createdAt: "2026-05-03T00:00:00.000Z",
      materialText: "Natural rhythm matters when speaking clearly.",
      recallItems: [
        {
          id: "note:Learning/rhythm-review.md",
          preview: "Old rhythm practice",
          reasons: ["note title overlaps: rhythm"],
          score: 50,
          targetPath: "Learning/rhythm-review.md",
          title: "Rhythm Review",
          type: "note",
        },
        {
          id: "sentence:sentence-1",
          preview: "Daily Review",
          reasons: ["overlaps saved sentence: natural rhythm matters"],
          score: 95,
          targetId: "sentence-1",
          title: "Natural rhythm matters.",
          type: "sentence",
        },
      ],
      sentences: [
        {
          createdAt: "2026-05-03T00:00:00.000Z",
          id: "sentence-1",
          sourceLabel: "Daily Review",
          sourceNotePath: "Sources/rhythm-drill--source-abc.md",
          text: "Natural rhythm matters.",
          translation: "自然节奏很重要。",
        },
      ],
      sessionId: "session-1",
      sourceNotePath: "Sources/rhythm-drill--source-abc.md",
      title: "Rhythm Drill",
      words: [
        {
          createdAt: "2026-05-03T00:00:00.000Z",
          definitions: ["a repeated pattern of sound"],
          lexicalCategory: "noun",
          sourceLabel: "dictionary",
          sourceNotePath: "Sources/rhythm-drill--source-abc.md",
          synonyms: ["beat"],
          word: "rhythm",
        },
      ],
    });

    expect(markdown).toContain("type: learning-session");
    expect(markdown).toContain('sourceSessionId: "session-1"');
    expect(markdown).toContain("- english");
    expect(markdown).toContain(
      'sourceNote: "Sources/rhythm-drill--source-abc.md"',
    );
    expect(markdown).toContain("# Rhythm Drill");
    expect(markdown).toContain(
      "## Source\n\nSource note: [[Sources/rhythm-drill--source-abc.md]]\nNatural rhythm matters when speaking clearly.",
    );
    expect(markdown).toContain("- **rhythm** _(noun)_ - a repeated pattern of sound");
    expect(markdown).toContain("> Natural rhythm matters.");
    expect(markdown).toContain("- Translation: 自然节奏很重要。");
    expect(markdown).toContain(
      "- Source note: [[Sources/rhythm-drill--source-abc.md]]",
    );
    expect(markdown).toContain("- [[Rhythm Review]]");
    expect(markdown).toContain("- Saved sentence: Natural rhythm matters.");
    expect(markdown).toContain("## Review");
  });

  it("omits optional sections cleanly when context has no saved artifacts", () => {
    const markdown = buildLearningNoteMarkdown({
      createdAt: "2026-05-03T00:00:00.000Z",
      materialText: "Short practice.",
      recallItems: [],
      sentences: [],
      sessionId: null,
      title: "Short Practice",
      words: [],
    });

    expect(markdown).not.toContain("sourceSessionId");
    expect(markdown).toContain("## Saved Words\n\nNo saved words yet.");
    expect(markdown).toContain("## Saved Sentences\n\nNo saved sentences yet.");
    expect(markdown).toContain("## Related Memory\n\nNo related memory found yet.");
  });
  it("includes deterministic asset lineage for future audit and recall", () => {
    const markdown = buildLearningNoteMarkdown({
      createdAt: "2026-01-01T00:00:00.000Z",
      dependencySnapshot: buildLearningDependencySnapshot({
        capturedAt: "2026-01-01T00:00:00.000Z",
        materialText: "Practice rhythm.",
        sourceNote: { content: "# Rhythm", path: "sources/rhythm.md" },
      }),
      materialText: "Practice rhythm.",
      recallItems: [],
      sentences: [],
      sessionId: "session-1",
      sourceNotePath: "sources/rhythm.md",
      title: "Rhythm",
      words: [],
    });
    expect(markdown).toContain("## Asset Lineage");
    expect(markdown).toContain("- Session: session-1");
    expect(markdown).toContain("- Source note: [[sources/rhythm.md]]");
    expect(markdown).toContain("aurisDependencySnapshot:");
    expect(markdown).toContain("  status: current");
    expect(markdown).toContain("  dependencies:");
    expect(markdown).toContain("## Dependency Review");
    expect(markdown).toContain("- Status: current");
    expect(markdown).toContain("- source-note: [[sources/rhythm.md]]");
  });

});
