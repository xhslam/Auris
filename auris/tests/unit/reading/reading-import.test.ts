import { describe, expect, it } from "vitest";
import { createReadingSourceFromFile } from "@/features/reading/reading-import";
import {
  createReadingSourceFromMarkdownFile,
  markdownToPlainText,
} from "@/features/reading/reading-markdown-import";
import {
  hasReadingExamMarkers,
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

  it.each([
    ["作文", "writing_b"],
    ["大作文", "writing_b"],
    ["小作文", "writing_a"],
  ] as const)("recognizes %s as a composition handout", (label, type) => {
    const markdown = `## 题型：${label}

## Introduction 引言段

### 英文
It is sometimes argued that **healthy habits matter**.

### 中文
人们有时认为健康习惯很重要。

### 词汇与表达 Vocabulary & Expressions
- **healthy habits**：健康习惯。

## Conclusion 结论段

### 英文
In conclusion, balance matters.`;

    const section = parseReadingExamMarkdown(markdown)?.[0];
    expect(section?.type).toBe(type);
    expect(section?.blocks).toHaveLength(2);
    expect(section?.blocks[0]?.title).toBe("Introduction 引言段");
    expect(section?.blocks[0]?.english).toContain("### 中文");
    expect(section?.blocks[1]?.title).toBe("Conclusion 结论段");
  });

  it("recognizes the fixed close-reading report only with a type marker", async () => {
    const markdown = `# 考研英语一｜文章精读

## 题型: 阅读理解

## 0. 一分钟读懂全文
作者质疑一个流行判断。

## 1. 逐句翻译和讲解
### Sentence 1
> The original sentence remains complete.

这个英文句子的中文释义。

#### 句子结构
主谓宾结构。

#### 语法现象
一般现在时。

#### 常见用法
remain complete。

#### 词汇与表达
original sentence。

#### 综合点评
保留原句意义。

## 2. 全文逻辑地图
\`\`\`text
现象 → 原因 → 结论
\`\`\`

## 3. 长难句精讲
### Sentence 1
主干与从句分析。

## 4. 关键词与表达
| 表达 | 含义 |
| --- | --- |
| issue | 议题 |

## 5. 阅读理解题精讲
### Question 21
原文定位与选项分析。

## 6. 文章中的「同义替换」
original phrase → option phrase

## 7. 容易误解的地方
不是因果关系，而是转折关系。

## 8. 用大白话重新讲一遍文章
作者先提出问题，再解释原因。

## 9. 读完这篇文章真正需要记住什么
- 核心论点
- 论证结构

## 10. 最终压缩
问题—原因—结论。
`;
    const file = new File([markdown], "2010-Text1.md", { type: "text/markdown" });
    const source = await createReadingSourceFromMarkdownFile(file);

    expect(hasReadingExamMarkers(markdown)).toBe(true);
    expect(source.category).toBe("exam");
    expect(source.examSections?.[0]?.type).toBe("reading");
    expect(source.examSections?.[0]?.blocks.map((block) => block.kind)).toEqual([
      "overview",
      "passage",
      "logic_map",
      "sentences",
      "vocabulary",
      "questions",
      "synonyms",
      "pitfalls",
      "retelling",
      "takeaways",
      "summary",
    ]);
    expect(source.examSections?.[0]?.blocks[1]?.english).toContain(
      "The original sentence remains complete.",
    );
  });

  it("keeps the legacy paragraph-study heading compatible", () => {
    const markdown = `## 题型: 阅读理解

## 0. 一分钟读懂全文
摘要
## 1. 原文与逐段理解
旧格式正文
## 2. 全文逻辑地图
逻辑
## 3. 长难句精讲
句子
## 4. 关键词与表达
词汇
## 5. 阅读理解题精讲
题目
## 6. 文章中的「同义替换」
替换
## 7. 容易误解的地方
误解
## 8. 用大白话重新讲一遍文章
复述
## 9. 读完这篇文章真正需要记住什么
记忆
## 10. 最终压缩
压缩`;

    expect(parseReadingExamMarkdown(markdown)?.[0]?.blocks[1]?.english).toBe("旧格式正文");
  });

  it("parses the numbered long-form reading handout after the explicit marker", () => {
    const markdown = `# 2011 考研英语一 · Text 2

## 题型: 阅读理解

## 1. 基本信息
- 年份：2011

## 2. Original Text
### Paragraph 1
The original paragraph.

## 3. 逐句翻译和讲解
### Paragraph 1（P1-1）
**英文**
The original sentence.
**中文**
原句译文。
**句子结构**
主谓宾。
**语法现象**
一般现在时。
**常见用法**
original sentence。
**词汇与表达**
original。
**综合点评**
开篇点题。

## 4. 文章结构
案例 → 趋势。

## 6. Questions
### 26. What is the answer?
[A] A  [B] B

## 7. Question Analysis
### 26. 答案：B
原文定位。

## 8. Core Vocabulary
| 单词 | 含义 |
| --- | --- |
| original | 原来的 |

## 11. 文章中的「同义替换」
straight up → frank

## 12. 容易误解的地方
不要偷换概念。

## 13. 用大白话重新讲一遍这篇文章
作者先举例。

## 14. 读完这篇文章真正需要记住什么
记住逻辑。`;

    const section = parseReadingExamMarkdown(markdown)?.[0];
    expect(section?.blocks.map((block) => block.kind)).toEqual([
      "overview",
      "passage",
      "logic_map",
      "vocabulary",
      "questions",
      "answers",
      "synonyms",
      "pitfalls",
      "retelling",
      "takeaways",
    ]);
    expect(section?.blocks[1]?.english).toContain("Paragraph 1（P1-1）");
  });

  it("does not infer an exam from the 0–10 headings alone", () => {
    const markdown = `# 考研英语一｜文章精读

## 0. 一分钟读懂全文
一分钟摘要。

## 1. 原文与逐段理解
Complete English passage.

## 2. 全文逻辑地图
现象 → 原因 → 结论

## 3. 长难句精讲
句法分析。

## 4. 关键词与表达
关键词。

## 5. 阅读理解题精讲
题目分析。

## 6. 文章中的「同义替换」
同义替换。

## 7. 容易误解的地方
常见误区。

## 8. 用大白话重新讲一遍文章
大白话复述。

## 9. 读完这篇文章真正需要记住什么
核心记忆。

## 10. 最终压缩
最终总结。
`;

    expect(hasReadingExamMarkers(markdown)).toBe(false);
    expect(parseReadingExamMarkdown(markdown)).toBeNull();
  });

  it("rejects empty markdown", async () => {
    const file = new File(["---\ntitle: x\n---\n\n"], "Empty.md", {
      type: "text/markdown",
    });

    await expect(createReadingSourceFromMarkdownFile(file)).rejects.toThrow(
      /没有可导入的文字/,
    );
  });

  it("rejects an exam import instead of flattening Markdown without a marker", async () => {
    const file = new File(
      ["# Reading notes\n\n## 0. 一分钟读懂全文\n\nOnly a summary."],
      "Unmarked exam.md",
      { type: "text/markdown" },
    );

    await expect(
      createReadingSourceFromMarkdownFile(file, { category: "exam" }),
    ).rejects.toThrow(/添加.*## 题型: 阅读理解/);
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

  it("accepts the legacy explicit reading heading without using 0–10 inference", () => {
    const sections = parseReadingExamMarkdown(`## 阅读理解

## 2. Original Text

### Paragraph 1
Legacy passage remains structured.

## 6. Questions

### Question 21
What is the main idea?
`);

    expect(hasReadingExamMarkers("## 阅读理解\n\nText")).toBe(true);
    expect(sections?.[0]?.type).toBe("reading");
    expect(sections?.[0]?.blocks.some((block) => block.kind === "passage")).toBe(true);
    expect(sections?.[0]?.blocks.some((block) => block.kind === "questions")).toBe(true);
  });

  it("normalizes rich reading handouts into one bilingual passage and question area", () => {
    const sections = parseReadingExamMarkdown(`## 题型：阅读理解

# 2. Original Text

# Paragraph 1

First English paragraph.

### Paragraph 2

Second English paragraph.

## 3. 全文翻译

### Paragraph 1

**原文**

First English paragraph.

**翻译**

第一段译文。

### Paragraph 2

**原文**

Second English paragraph.

**翻译**

第二段译文。

## 6. Questions

### Question 21

What is the main idea?

A. One
B. Two

## 7. Question Analysis

### Question 21

**答案：B**
`);

    expect(sections?.[0]?.blocks.map((block) => block.kind)).toEqual([
      "passage",
      "questions",
      "answers",
    ]);
    expect(sections?.[0]?.blocks[0]?.english).toContain("First English paragraph");
    expect(sections?.[0]?.blocks[0]?.translation).toContain("第一段译文");
    expect(sections?.[0]?.blocks[1]?.english).toContain("Question 21");
  });

  it("recovers bilingual passages saved by the legacy flattened serializer", () => {
    const sections = parseReadingExamMarkdown(`## 题型: 阅读理解

### 内容

Old duplicate passage.

## 3. 全文翻译

### 内容

**原文**

Recovered English paragraph.

恢复后的中文译文。

**翻译**

## 6. Questions

### 内容

21. What happened?
`);

    const passage = sections?.[0]?.blocks.find((block) => block.kind === "passage");
    expect(passage?.english).toContain("Recovered English paragraph");
    expect(passage?.translation).toContain("恢复后的中文译文");
    expect(passage?.english).not.toContain("Old duplicate passage");
  });

  it("keeps persisted sentence-study labels in one interactive block", () => {
    const sections = parseReadingExamMarkdown(`## 题型: 阅读理解

### Sentence 1

**英文**
The rough guide used to be simple.

**中文**
过去的粗略准则很简单。

**句子结构**
主系表结构。

**语法现象**
used to 表示过去的状态。

**常见用法**
used to be。

**词汇与表达**
rough guide。

**综合点评**
引出旧规则。`);

    const sentence = sections?.[0]?.blocks[0];
    expect(sentence?.english).toContain("**英文**");
    expect(sentence?.english).toContain("**中文**");
    expect(sentence?.english).toContain("**综合点评**");
    expect(sentence?.translation).toBeUndefined();
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
