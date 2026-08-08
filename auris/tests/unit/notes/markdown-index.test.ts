import { describe, expect, it } from "vitest";
import { buildMarkdownIndex } from "@/features/notes/documents/markdown-index";

describe("markdown-index", () => {
  it("derives title, headings, tags, links, tasks, and word count from raw markdown", () => {
    const index = buildMarkdownIndex(
      [
        "# Daily Review",
        "",
        "## Speaking",
        "",
        "Practice [[Grammar]] with #shadowing today.",
        "",
        "- [ ] Review difficult sentence",
      ].join("\n"),
    );

    expect(index.title).toBe("Daily Review");
    expect(index.headings).toEqual([
      {
        depth: 1,
        line: 0,
        slug: "daily-review",
        text: "Daily Review",
      },
      {
        depth: 2,
        line: 2,
        slug: "speaking",
        text: "Speaking",
      },
    ]);
    expect(index.links).toEqual([
      {
        alias: null,
        heading: null,
        target: "Grammar",
      },
    ]);
    expect(index.tags).toEqual(["shadowing"]);
    expect(index.tasks).toEqual([
      {
        checked: false,
        line: 6,
        text: "Review difficult sentence",
      },
    ]);
    expect(index.wordCount).toBe(8);
  });
});
