import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { ReadingExamView } from "@/components/reading/reading-exam-view";
import type {
  ReadingExamSection,
  ReadingExamType,
} from "@/features/reading/reading-fixtures";

const LAYOUTS: Array<[ReadingExamType, string, string]> = [
  ["cloze", "cloze-sheet", "完形填空"],
  ["reading", "passage-questions", "阅读理解"],
  ["new_order", "sequence-board", "新题型-排序"],
  ["new_seven_five", "gap-matcher", "新题型-七选五"],
  ["translation", "translation-desk", "翻译"],
  ["writing_a", "composition-handout", "写作-应用文"],
  ["writing_b", "composition-handout", "写作-大作文"],
];

describe("ReadingExamView", () => {
  it("routes every exam type to its own presentation layout", () => {
    const sections: ReadingExamSection[] = LAYOUTS.map(([type, , label]) => ({
      blocks: [{ english: `${label} sample`, kind: "passage" }],
      label,
      type,
    }));

    const { container } = render(
      <ReadingExamView
        onLookupWord={vi.fn()}
        sections={sections}
        showTranslation
        wordActiveKey={null}
      />,
    );

    for (const [type, layout, label] of LAYOUTS) {
      const section = container.querySelector(`[data-type="${type}"]`);
      expect(section).toHaveAttribute("data-layout", layout);
      expect(screen.getByRole("heading", { name: label })).toBeInTheDocument();
    }
  });

  it("keeps block semantics available to each layout", () => {
    const sections: ReadingExamSection[] = [
      {
        blocks: [
          { english: "Read this passage.", kind: "passage" },
          { english: "21. Choose A.", kind: "questions" },
        ],
        label: "阅读理解",
        type: "reading",
      },
    ];

    const { container } = render(
      <ReadingExamView
        onLookupWord={vi.fn()}
        sections={sections}
        showTranslation={false}
        wordActiveKey={null}
      />,
    );

    expect(container.querySelector('[data-kind="passage"]')).toBeInTheDocument();
    expect(container.querySelector('[data-kind="questions"]')).toBeInTheDocument();
  });

  it("renders composition paragraph headings in a restrained handout flow", () => {
    const sections: ReadingExamSection[] = [
      {
        blocks: [
          {
            english: "### 英文\nA balanced view.\n\n### 中文\n一种平衡的观点。",
            kind: "model",
            title: "Introduction 引言段",
          },
        ],
        label: "作文",
        type: "writing_b",
      },
    ];

    const { container } = render(
      <ReadingExamView
        onLookupWord={vi.fn()}
        sections={sections}
        showTranslation
        wordActiveKey={null}
      />,
    );

    expect(container.querySelector('[data-layout="composition-handout"]')).toBeInTheDocument();
    expect(screen.getByText("Introduction 引言段")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "英文" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "中文" })).toBeInTheDocument();
  });

  it("renders the fixed close-reading report as a dedicated editorial layout", () => {
    const sections: ReadingExamSection[] = [
      {
        blocks: [
          { english: "全文速览", kind: "overview" },
          { english: "> Complete English passage.", kind: "passage" },
          { english: "现象 → 原因 → 结论", kind: "logic_map" },
          { english: "主干分析", kind: "sentences" },
          { english: "关键词", kind: "vocabulary" },
          { english: "Question 21", kind: "questions" },
          { english: "同义替换", kind: "synonyms" },
          { english: "常见陷阱", kind: "pitfalls" },
          { english: "大白话复述", kind: "retelling" },
          { english: "核心记忆", kind: "takeaways" },
          { english: "最终压缩", kind: "summary" },
        ],
        label: "考研英语一阅读理解精读",
        type: "reading",
      },
    ];

    const { container } = render(
      <ReadingExamView
        onLookupWord={vi.fn()}
        sections={sections}
        showTranslation
        wordActiveKey={null}
      />,
    );

    expect(container.querySelector('[data-layout="reading-study"]')).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "考研英语一｜文章精读" })).toBeInTheDocument();
    expect(screen.getByText("00")).toBeInTheDocument();
    expect(container.querySelector('[data-kind="summary"]')).toHaveTextContent("最终压缩");
  });

  it("keeps sentence notes collapsed until the leading control is clicked", async () => {
    const user = userEvent.setup();
    const sections: ReadingExamSection[] = [
      {
        blocks: [
          { english: "全文速览", kind: "overview" },
          {
            english: `### Paragraph 1（P1-1）

**英文**
The critics wrote in detail about the events they covered.

**中文**
评论家会详细记录他们所报道的事件。

#### 句子结构

主谓宾结构，they covered 为定语从句。

#### 语法现象

省略关系代词 that。

#### 常见用法

write in detail about sth.

#### 词汇与表达

cover an event 表示“报道事件”。

**综合点评**

本句强调旧日艺评的严肃性。`,
            kind: "passage",
          },
        ],
        label: "考研英语一阅读理解精读",
        type: "reading",
      },
    ];

    render(
      <ReadingExamView
        onLookupWord={vi.fn()}
        sections={sections}
        showTranslation
        wordActiveKey={null}
      />,
    );

    expect(screen.getByText("逐句翻译和讲解")).toBeInTheDocument();
    expect(screen.getByText("评论家会详细记录他们所报道的事件。")).toBeVisible();

    const toggle = screen.getByRole("button", { name: "展开Paragraph 1（P1-1）讲解" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("句子结构").closest(".reading-sentence-study__details"))
      .toHaveAttribute("hidden");

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("主谓宾结构，")).toBeVisible();
    expect(screen.getByRole("heading", { name: "综合点评" })).toBeVisible();
  });

  it("migrates already-persisted sentence blocks into the collapsed reader", async () => {
    const user = userEvent.setup();
    const sections: ReadingExamSection[] = [
      {
        blocks: [
          {
            english: `**英文**
The rough guide used to be simple.

**句子结构**
主系表结构。

**常见用法**
used to be。

**词汇与表达**
rough guide。`,
            translation: `**中文**
过去的粗略准则很简单。

**语法现象**
used to 表示过去的状态。

**综合点评**
引出旧规则。`,
            kind: "other",
          },
        ],
        label: "阅读理解",
        type: "reading",
      },
    ];

    const { container } = render(
      <ReadingExamView
        onLookupWord={vi.fn()}
        sections={sections}
        showTranslation
        wordActiveKey={null}
      />,
    );

    expect(container.querySelector('[data-layout="reading-study"]')).toBeInTheDocument();
    expect(container.querySelector('[data-sentence-study="persisted"]')).toBeInTheDocument();
    expect(screen.queryByText("英文")).not.toBeInTheDocument();
    expect(screen.queryByText("中文")).not.toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "展开Sentence 1讲解" });
    expect(screen.getByText("句子结构").closest(".reading-sentence-study__details"))
      .toHaveAttribute("hidden");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("主系表结构。")).toBeVisible();
  });
});
