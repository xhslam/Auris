import { describe, expect, it } from "vitest";
import {
  filterSources,
  formatReadingDate,
  groupSourcesByDate,
} from "@/features/reading/reading-library";
import type { ReadingSource } from "@/features/reading/reading-fixtures";

function makeSource(
  id: string,
  overrides: Partial<ReadingSource> = {},
): ReadingSource {
  return {
    category: "article",
    estimatedMinutes: 5,
    id,
    kicker: "Test",
    paragraphs: [],
    progress: 0,
    title: id,
    ...overrides,
  };
}

describe("formatReadingDate", () => {
  it("formats YYYY-MM-DD into dotted form", () => {
    expect(formatReadingDate("2026-06-21")).toBe("2026.06.21");
  });

  it("falls back for missing or odd input", () => {
    expect(formatReadingDate(undefined)).toBe("未分组");
    expect(formatReadingDate("whenever")).toBe("whenever");
  });
});

describe("groupSourcesByDate", () => {
  it("groups by date, newest first, undated last", () => {
    const sources = [
      makeSource("a", { publishedAt: "2026-06-14" }),
      makeSource("b", { publishedAt: "2026-06-21" }),
      makeSource("c"),
      makeSource("d", { publishedAt: "2026-06-21" }),
    ];

    const groups = groupSourcesByDate(sources);

    expect(groups.map((group) => group.date)).toEqual([
      "2026-06-21",
      "2026-06-14",
      "",
    ]);
    expect(groups[0]!.sources.map((s) => s.id)).toEqual(["b", "d"]);
    expect(groups[0]!.label).toBe("2026.06.21");
    expect(groups[2]!.label).toBe("未分组");
  });
});

describe("filterSources", () => {
  const sources = [
    makeSource("a", { category: "article" }),
    makeSource("b", { category: "book" }),
    makeSource("c", { category: "exam" }),
    makeSource("d", { category: "favorite" }),
  ];
  const favorites = new Set(["b"]);

  it("returns all for 'all'", () => {
    expect(filterSources(sources, "all", favorites)).toHaveLength(4);
  });

  it("filters by category", () => {
    expect(filterSources(sources, "book", favorites).map((s) => s.id)).toEqual([
      "b",
    ]);
    expect(filterSources(sources, "exam", favorites).map((s) => s.id)).toEqual([
      "c",
    ]);
  });

  it("treats examSections as exam content", () => {
    const withExamSections = [
      makeSource("plain", { category: "article" }),
      makeSource("paper", {
        category: "article",
        examSections: [
          {
            blocks: [],
            label: "Passage",
            type: "reading",
          },
        ],
      }),
    ];

    expect(
      filterSources(withExamSections, "exam", new Set()).map((s) => s.id),
    ).toEqual(["paper"]);
  });

  it("uses the favorites set for 'favorite'", () => {
    expect(filterSources(sources, "favorite", favorites).map((s) => s.id)).toEqual([
      "b",
    ]);
  });

  it("keeps sources with progress for 'history'", () => {
    const withProgress = [
      makeSource("a", { progress: 0 }),
      makeSource("b", { progress: 12 }),
      makeSource("c", { progress: 0 }),
    ];

    expect(
      filterSources(withProgress, "history", new Set(), { c: 40 }).map((s) => s.id),
    ).toEqual(["b", "c"]);
  });
});
