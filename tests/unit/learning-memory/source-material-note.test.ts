import { describe, expect, it, vi } from "vitest";
import { buildLearningDependencySnapshot } from "@/features/learning-memory/learning-dependency-review";
import { LEARNING_DEPENDENCY_SNAPSHOT_KEY } from "@/features/learning-memory/learning-dependency-sync";
import type { NotePage, NotesStorage } from "@/features/notes/note-types";
import {
  appendSentenceToSourceMaterialBody,
  appendSentenceToSourceMaterialNote,
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

  it("marks dependent learning notes for review after appending a source excerpt", async () => {
    const source = buildSourceMaterialNotePage({
      createdAt: "2026-08-20T10:00:00.000Z",
      sourceType: "paste",
      text: "Original source text.",
      title: "Source",
    });
    const learningPage: NotePage = {
      blocks: [],
      fileName: "learning.md",
      frontmatter: {
        [LEARNING_DEPENDENCY_SNAPSHOT_KEY]: buildLearningDependencySnapshot({
          capturedAt: "2026-08-20T10:00:00.000Z",
          materialText: "Original source text.",
          sourceNote: { content: source.markdownBody, path: source.relativePath },
        }),
      },
      icon: "N",
      id: "learning",
      markdownBody: "## Dependency Review\n\n<!-- auris:dependency-review:start -->\n- Status: current\n<!-- auris:dependency-review:end -->",
      relativePath: "Learning/learning.md",
      title: "Learning",
      updatedAt: "2026-08-20T10:00:00.000Z",
    };
    const pages = new Map<string, NotePage>([
      [source.id, source],
      [learningPage.id, learningPage],
    ]);
    const savePage = vi.fn(async (page: NotePage) => {
      pages.set(page.id, page);
      return {
        fileName: page.fileName,
        icon: page.icon,
        id: page.id,
        relativePath: page.relativePath,
        title: page.title,
        updatedAt: page.updatedAt,
      };
    });
    const notesStorage = {
      getPage: vi.fn(async (id: string) => pages.get(id) ?? null),
      listPages: vi.fn(async () => Array.from(pages.values()).map((page) => ({
        fileName: page.fileName,
        icon: page.icon,
        id: page.id,
        relativePath: page.relativePath,
        title: page.title,
        updatedAt: page.updatedAt,
      }))),
      savePage,
    } as unknown as NotesStorage;

    await appendSentenceToSourceMaterialNote(notesStorage, {
      id: source.id,
      relativePath: source.relativePath,
      title: source.title,
    }, {
      createdAt: "2026-08-20T11:00:00.000Z",
      id: "sentence-1",
      sourceLabel: "Source",
      sourceNotePath: source.relativePath,
      text: "A new excerpt.",
      translation: "",
    });

    const updatedLearningPage = pages.get(learningPage.id)!;
    expect(updatedLearningPage.frontmatter?.[LEARNING_DEPENDENCY_SNAPSHOT_KEY]).toMatchObject({
      status: "needs-review",
    });
    expect(updatedLearningPage.markdownBody).toContain("- Status: needs-review");
    expect(savePage).toHaveBeenCalledTimes(2);
  });
});
