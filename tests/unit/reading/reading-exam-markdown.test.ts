import { describe, expect, it } from "vitest";
import {
  parseExamMarkdown,
  parseExamMarkdownInline,
} from "@/features/reading/reading-exam-markdown";

describe("parseExamMarkdownInline", () => {
  it("parses bold, italic, code, and numbered blanks", () => {
    const nodes = parseExamMarkdownInline(
      "**来源**: year *note* and `code` blank __2__",
    );

    expect(nodes).toEqual([
      { type: "strong", children: [{ type: "text", value: "来源" }] },
      { type: "text", value: ": year " },
      { type: "em", children: [{ type: "text", value: "note" }] },
      { type: "text", value: " and " },
      { type: "code", value: "code" },
      { type: "text", value: " blank " },
      { type: "blank", number: "2" },
    ]);
  });
});

describe("parseExamMarkdown", () => {
  it("renders lists, horizontal rules, and paragraphs", () => {
    const blocks = parseExamMarkdown(`**Directions:** Write a notice.

- Proficiency in spoken English
- Ability to write reports

---

中文说明继续。

1) First duty
2) Second duty
`);

    expect(blocks[0]).toEqual({
      type: "paragraph",
      children: [
        { type: "strong", children: [{ type: "text", value: "Directions:" }] },
        { type: "text", value: " Write a notice." },
      ],
    });
    expect(blocks[1]).toMatchObject({
      type: "ul",
      items: [
        [{ type: "text", value: "Proficiency in spoken English" }],
        [{ type: "text", value: "Ability to write reports" }],
      ],
    });
    expect(blocks[2]).toEqual({ type: "hr" });
    expect(blocks[3]).toEqual({
      type: "paragraph",
      children: [{ type: "text", value: "中文说明继续。" }],
    });
    expect(blocks[4]).toMatchObject({
      type: "ol",
      items: [
        [{ type: "text", value: "First duty" }],
        [{ type: "text", value: "Second duty" }],
      ],
    });
  });

  it("parses headings without leaving markdown markers", () => {
    const blocks = parseExamMarkdown("### Notice\n\nBody text.");
    expect(blocks[0]).toEqual({
      type: "heading",
      level: 3,
      children: [{ type: "text", value: "Notice" }],
    });
    expect(blocks[1]).toEqual({
      type: "paragraph",
      children: [{ type: "text", value: "Body text." }],
    });
  });

  it("parses markdown tables with header rows", () => {
    const blocks = parseExamMarkdown(`| 英文表达 | 中文释义 |
|---|---|
| depict a scene | 描绘一个场景 |
| conduct a research project | 开展一项研究项目 |
`);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "table",
      header: [
        [{ type: "text", value: "英文表达" }],
        [{ type: "text", value: "中文释义" }],
      ],
      rows: [
        [
          [{ type: "text", value: "depict a scene" }],
          [{ type: "text", value: "描绘一个场景" }],
        ],
        [
          [{ type: "text", value: "conduct a research project" }],
          [{ type: "text", value: "开展一项研究项目" }],
        ],
      ],
    });
  });

  it("parses tables that start with a separator and no header", () => {
    const blocks = parseExamMarkdown(`|---|---|
| conduct a research project | 开展一项研究项目 |
| depict a scene | 描绘一个场景 |
`);

    expect(blocks[0]).toMatchObject({
      type: "table",
      header: null,
      rows: [
        [
          [{ type: "text", value: "conduct a research project" }],
          [{ type: "text", value: "开展一项研究项目" }],
        ],
        [
          [{ type: "text", value: "depict a scene" }],
          [{ type: "text", value: "描绘一个场景" }],
        ],
      ],
    });
  });
});
