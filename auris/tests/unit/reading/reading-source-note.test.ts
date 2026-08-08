import { describe, expect, it } from "vitest";
import type { ReadingSource } from "@/features/reading/reading-fixtures";
import {
  buildReadingSourceNotePage,
  loadReadingSourceNotes,
  parseReadingSourceNotePage,
  saveReadingSourceNote,
} from "@/features/reading/reading-source-note";
import { parseMarkdownNote, serializeMarkdownNote } from "@/features/notes/markdown-codec";
import type {
  NotePage,
  NotePageSummary,
  NotesDirectoryInfo,
  NotesStorage,
} from "@/features/notes/note-types";

function createReadingSource(overrides: Partial<ReadingSource> = {}): ReadingSource {
  return {
    category: "article",
    estimatedMinutes: 3,
    id: "local-reading-123",
    kicker: "Local import",
    paragraphs: [
      {
        analysis: "placeholder",
        english: "Quiet momentum begins when a learner returns to the same page.",
        id: "local-reading-123-paragraph-1",
        order: 1,
        translation: "安静的动量从学习者回到同一页开始。",
        wordKeys: ["momentum"],
      },
      {
        analysis: "placeholder",
        english: "A steady rhythm protects attention from turning practice into noise.",
        id: "local-reading-123-paragraph-2",
        order: 2,
        translation: "稳定的节奏保护注意力，不让练习变成噪音。",
        wordKeys: ["rhythm"],
      },
    ],
    progress: 0,
    title: "Quiet Momentum",
    ...overrides,
  };
}

/**
 * Fake vault that round-trips pages through the real markdown codec, so the
 * test exercises frontmatter and body serialization the way a real file does.
 */
function createFakeVault(isConfigured = true) {
  const files = new Map<string, { fileName: string; markdown: string; relativePath: string }>();

  const storage: NotesStorage = {
    async createPage() {
      throw new Error("not used");
    },
    async deletePage(id) {
      files.delete(id);
    },
    async getDirectoryInfo(): Promise<NotesDirectoryInfo> {
      return { directoryName: isConfigured ? "vault" : null, isConfigured, isSupported: true };
    },
    async getPage(id): Promise<NotePage | null> {
      const file = files.get(id);
      return file
        ? parseMarkdownNote({
            fileName: file.fileName,
            markdown: file.markdown,
            relativePath: file.relativePath,
          })
        : null;
    },
    async listPages(): Promise<NotePageSummary[]> {
      return [...files.values()].map((file) => {
        const page = parseMarkdownNote({
          fileName: file.fileName,
          markdown: file.markdown,
          relativePath: file.relativePath,
        })!;
        return {
          fileName: page.fileName,
          icon: page.icon,
          id: page.id,
          relativePath: page.relativePath,
          title: page.title,
          updatedAt: page.updatedAt,
        };
      });
    },
    async pickDirectory(): Promise<NotesDirectoryInfo> {
      return { directoryName: "vault", isConfigured: true, isSupported: true };
    },
    async savePage(page): Promise<NotePageSummary> {
      files.set(page.id, {
        fileName: page.fileName,
        markdown: serializeMarkdownNote(page),
        relativePath: page.relativePath,
      });
      return {
        fileName: page.fileName,
        icon: page.icon,
        id: page.id,
        relativePath: page.relativePath,
        title: page.title,
        updatedAt: page.updatedAt,
      };
    },
  };

  return { files, storage };
}

describe("reading-source-note", () => {
  it("round-trips a reading source through build and parse", () => {
    const source = createReadingSource({
      paragraphs: [
        {
          analysis: "placeholder",
          english: "Quiet momentum begins when a learner returns to the same page.",
          id: "local-reading-123-paragraph-1",
          order: 1,
          translation: "安静的动量从学习者回到同一页开始。",
          wordKeys: ["momentum"],
        },
        {
          analysis: "placeholder",
          english: "A steady rhythm protects attention from turning practice into noise.",
          id: "local-reading-123-paragraph-2",
          order: 2,
          translation: "稳定的节奏保护注意力，避免练习变成噪音。",
          wordKeys: ["rhythm"],
        },
      ],
    });
    const page = buildReadingSourceNotePage(source);

    expect(page.frontmatter?.type).toBe("reading-source");
    expect(page.relativePath).toMatch(/^Reading\//);
    expect(page.markdownBody).toContain("安静的动量从学习者回到同一页开始。");

    const parsed = parseReadingSourceNotePage(page);

    expect(parsed).not.toBeNull();
    expect(parsed?.title).toBe("Quiet Momentum");
    expect(parsed?.category).toBe("article");
    expect(parsed?.estimatedMinutes).toBe(3);
    expect(parsed?.paragraphs).toHaveLength(2);
    expect(parsed?.paragraphs[0]?.translation).toBe(
      "安静的动量从学习者回到同一页开始。",
    );
    expect(parsed?.paragraphs[1]?.english).toBe(
      "A steady rhythm protects attention from turning practice into noise.",
    );
    expect(parsed?.paragraphs[1]?.translation).toBe(
      "稳定的节奏保护注意力，避免练习变成噪音。",
    );
  });

  it("ignores notes that are not reading sources", () => {
    const page = buildReadingSourceNotePage(createReadingSource());
    const foreignPage = { ...page, frontmatter: { ...page.frontmatter, type: "source-material" } };

    expect(parseReadingSourceNotePage(foreignPage)).toBeNull();
  });

  it("uses an externally renamed reading filename as the displayed title", () => {
    const page = buildReadingSourceNotePage(createReadingSource());
    const renamedPage = {
      ...page,
      fileName: `Renamed Outside Auris--${page.id}.md`,
      relativePath: `Reading/Renamed Outside Auris--${page.id}.md`,
    };

    expect(parseReadingSourceNotePage(renamedPage)?.title).toBe("Renamed Outside Auris");
  });

  it("saves to and loads from a configured vault", async () => {
    const { storage } = createFakeVault(true);
    const source = createReadingSource({ category: "episode", estimatedMinutes: 5 });

    const wasSaved = await saveReadingSourceNote(storage, source);
    expect(wasSaved).toBe(true);

    const loaded = await loadReadingSourceNotes(storage);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.id).toBe(source.id);
    expect(loaded[0]?.category).toBe("episode");
    expect(loaded[0]?.estimatedMinutes).toBe(5);
    expect(loaded[0]?.paragraphs).toHaveLength(2);
  });

  it("stays in-memory when no vault is configured", async () => {
    const { storage, files } = createFakeVault(false);

    const wasSaved = await saveReadingSourceNote(storage, createReadingSource());

    expect(wasSaved).toBe(false);
    expect(files.size).toBe(0);
  });

  it("returns an empty list for null storage", async () => {
    expect(await loadReadingSourceNotes(null)).toEqual([]);
  });
});
