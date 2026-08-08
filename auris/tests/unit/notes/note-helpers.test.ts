import { describe, expect, it } from "vitest";
import {
  buildSentenceMarkdownSnippet,
  buildWordMarkdownSnippet,
  createNoteBlock,
  reorderNoteBlocks,
  resolveSlashCommandMatches,
} from "@/features/notes/local-notes-store";

describe("note helpers", () => {
  it("reorders note blocks when dragging to a new position", () => {
    const blocks = [
      createNoteBlock("paragraph", "First line"),
      createNoteBlock("paragraph", "Second line"),
      createNoteBlock("paragraph", "Third line"),
    ];

    const nextBlocks = reorderNoteBlocks(blocks, blocks[2].id, blocks[0].id);

    expect(nextBlocks.map((block) => block.text)).toEqual(["Third line", "First line", "Second line"]);
  });

  it("matches slash commands with Chinese labels", () => {
    const matches = resolveSlashCommandMatches("/待办");

    expect(matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "待办清单",
          type: "todo",
        }),
      ]),
    );
  });

  it("builds a markdown snippet from a saved word record", () => {
    const snippet = buildWordMarkdownSnippet({
      createdAt: "2026-03-19T10:00:00.000Z",
      definitions: ["the regular pattern of sounds or movements"],
      lexicalCategory: "noun",
      sourceLabel: "离线词典",
      synonyms: ["beat", "cadence"],
      word: "rhythm",
    });

    expect(snippet).toContain("rhythm");
    expect(snippet).toContain("the regular pattern of sounds or movements");
    expect(snippet).toContain("beat");
    expect(snippet).toContain("cadence");
  });

  it("builds a markdown snippet from a saved sentence record", () => {
    const snippet = buildSentenceMarkdownSnippet({
      createdAt: "2026-03-19T10:00:00.000Z",
      id: "sentence-1",
      sourceLabel: "快速跟读练习",
      text: "Practice makes perfect.",
      translation: "熟能生巧。",
    });

    expect(snippet).toContain("##");
    expect(snippet).toContain("Practice makes perfect.");
    expect(snippet).toContain("熟能生巧。");
    expect(snippet).toContain("快速跟读练习");
  });
});
