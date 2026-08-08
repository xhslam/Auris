import { describe, expect, it } from "vitest";
import { createReadingSourceFromFile } from "@/features/reading/reading-import";
import {
  createReadingSourceFromMarkdownFile,
  markdownToPlainText,
} from "@/features/reading/reading-markdown-import";
import {
  parseReadingExamMarkdown,
  serializeReadingExamSections,
} from "@/features/reading/reading-exam-parse";
import {
  buildReadingSourceNotePage,
  parseReadingSourceNotePage,
} from "@/features/reading/reading-source-note";

describe("markdownToPlainText", () => {
  it("strips frontmatter and light markdown syntax", () => {
    const plain = markdownToPlainText(`---
title: Demo
---

# Hello World

This is **bold** and a [link](https://example.com).

- item one

1. numbered
`);

    expect(plain).toContain("Hello World");
    expect(plain).toContain("This is bold and a link.");
    expect(plain).toContain("item one");
    expect(plain).toContain("numbered");
    expect(plain).not.toContain("---");
    expect(plain).not.toContain("**");
    expect(plain).not.toContain("# ");
  });
});

describe("createReadingSourceFromMarkdownFile", () => {
  it("imports markdown into reading paragraphs", async () => {
    const file = new File(
      [
        "First paragraph about momentum.\n\nSecond paragraph keeps context close.",
      ],
      "Field Notes.md",
      { type: "text/markdown" },
    );

    const source = await createReadingSourceFromMarkdownFile(file);

    expect(source.title).toBe("Field Notes");
    expect(source.kicker).toBe("Field Notes.md");
    expect(source.id).toMatch(/^markdown-reading-/);
    expect(source.paragraphs).toHaveLength(2);
    expect(source.paragraphs[0]?.english).toBe(
      "First paragraph about momentum.",
    );
    expect(source.paragraphs[1]?.english).toBe(
      "Second paragraph keeps context close.",
    );
    expect(source.examSections).toBeUndefined();
  });

  it("pairs blank-line English/Chinese blocks as bilingual paragraphs", async () => {
    const file = new File(
      [
        "Quiet momentum begins when a learner returns.\n\n安静的动量从学习者回到同一页开始。\n\nA steady rhythm protects attention.\n\n稳定的节奏保护注意力。",
      ],
      "Bilingual Notes.md",
      { type: "text/markdown" },
    );

    const source = await createReadingSourceFromMarkdownFile(file);

    expect(source.paragraphs).toHaveLength(2);
    expect(source.paragraphs[0]?.english).toBe(
      "Quiet momentum begins when a learner returns.",
    );
    expect(source.paragraphs[0]?.translation).toBe(
      "安静的动量从学习者回到同一页开始。",
    );
    expect(source.paragraphs[1]?.english).toBe(
      "A steady rhythm protects attention.",
    );
    expect(source.paragraphs[1]?.translation).toBe("稳定的节奏保护注意力。");
  });

  it("parses exam-type markers into structured sections", async () => {
    const file = new File(
      [
        `## 题型: 完形填空

### Directions
Choose the best word.

### 篇章
Advances in AI __1__ our lives.

### 选项
1. A. Still  B. Therefore

### 参考答案
1. A
`,
      ],
      "Cloze.md",
      { type: "text/markdown" },
    );

    const source = await createReadingSourceFromMarkdownFile(file);

    expect(source.examSections).toHaveLength(1);
    expect(source.examSections?.[0]?.type).toBe("cloze");
    expect(source.examSections?.[0]?.blocks.some((block) => block.kind === "passage")).toBe(
      true,
    );
    expect(
      source.examSections?.[0]?.blocks.find((block) => block.kind === "passage")?.english,
    ).toContain("__1__");
  });

  it("rejects empty markdown", async () => {
    const file = new File(["---\ntitle: x\n---\n\n"], "Empty.md", {
      type: "text/markdown",
    });

    await expect(createReadingSourceFromMarkdownFile(file)).rejects.toThrow(
      /没有可导入的文字/,
    );
  });
});

describe("parseReadingExamMarkdown", () => {
  it("returns null without exam markers", () => {
    expect(parseReadingExamMarkdown("Hello\n\nWorld")).toBeNull();
  });

  it("parses reading and order sections", () => {
    const sections = parseReadingExamMarkdown(`## 题型: 阅读理解

### Text 1
Donkeys were tamed earlier than horses.

### 题目
21. What can be learned?
A. One
B. Two

## 题型: 新题型-排序

### 答题链
F → __41__ → H

### 段落库
A. First option paragraph.
`);

    expect(sections).toHaveLength(2);
    expect(sections?.[0]?.type).toBe("reading");
    expect(sections?.[1]?.type).toBe("new_order");
  });
});

describe("createReadingSourceFromFile", () => {
  it("routes markdown by extension", async () => {
    const file = new File(["Hello from markdown.\n\nSecond bit."], "a.md", {
      type: "text/markdown",
    });

    const source = await createReadingSourceFromFile(file);
    expect(source.id).toMatch(/^markdown-reading-/);
    expect(source.paragraphs).toHaveLength(2);
  });

  it("rejects Word and PDF with Markdown-only guidance", async () => {
    const docx = new File(["x"], "a.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    await expect(createReadingSourceFromFile(docx)).rejects.toThrow(
      /仅支持 Markdown/,
    );

    const pdf = new File([new Uint8Array([37, 80, 68, 70])], "a.pdf", {
      type: "application/pdf",
    });
    await expect(createReadingSourceFromFile(pdf)).rejects.toThrow(
      /hg-word-suitability/,
    );
  });
});

describe("exam source note round-trip", () => {
  it("persists exam markers through build and parse", () => {
    const sections = parseReadingExamMarkdown(`## 题型: 翻译

### 篇章
Science education (46) matters.

### 划线句
(46) matters.
`)!;

    const page = buildReadingSourceNotePage({
      category: "article",
      estimatedMinutes: 2,
      examSections: sections,
      format: "text",
      id: "exam-1",
      kicker: "exam.md",
      paragraphs: [
        {
          analysis: "",
          english: "Science education (46) matters.",
          id: "exam-1-paragraph-1",
          order: 1,
          translation: "译文待补充。先保留英文上下文，后续可接入翻译或 AI 分析。",
          wordKeys: ["momentum"],
        },
      ],
      progress: 0,
      title: "Translation Drill",
    });

    expect(page.markdownBody).toContain("## 题型: 翻译");
    expect(serializeReadingExamSections(sections)).toContain("### 篇章");

    const parsed = parseReadingSourceNotePage(page);
    expect(parsed?.examSections?.[0]?.type).toBe("translation");
    expect(parsed?.title).toBe("Translation Drill");
  });
});
