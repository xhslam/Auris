import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SegmentedWordCard } from "@/components/workspace/segmented-word-card";
import type { WordCardEntry } from "@/features/dictionary/word-card-entry";

const entry: WordCardEntry = {
  definition: "研究",
  examples: [],
  partOfSpeech: "noun/verb",
  phonetic: "/rɪˈsɜːrtʃ/",
  relatedWords: [],
  sections: [
    {
      title: "当前语境",
      lines: [
        "折叠摘要：这里指 Smith 教授的研究项目，用作名词修饰 project。",
        "展开解析：research 在这里作定语修饰 project，表示需要发布通知的是 Smith 教授的研究项目。",
      ],
    },
    {
      title: "词源与构词",
      lines: ["- **构词**: re-（再）+ search（寻找）", "- **核心意象**: 反复寻找以求发现。"],
    },
    {
      title: "用法边界",
      lines: ["study 偏向学习；research 强调系统调查。"],
    },
    {
      title: "深层解释",
      lines: ["研究的本质是提出问题并用证据寻找可靠答案。"],
    },
    {
      title: "一语道破",
      lines: ["用系统的方法，把好奇变成可验证的答案。"],
    },
  ],
  word: "Research",
};

function renderCard(contextText = "Write a notice for Prof. Smith's research project.") {
  return render(
    <SegmentedWordCard
      closeIcon={<span />}
      contextText={contextText}
      entry={entry}
      error={null}
      isLoading={false}
      isSaved={false}
      onClose={vi.fn()}
      onSaveToggle={vi.fn()}
      onSpeak={vi.fn()}
      saveIcon={<span />}
      speakIcon={<span />}
      term="research"
    />,
  );
}

describe("SegmentedWordCard", () => {
  it("keeps the live sentence separate from saved context analysis", async () => {
    const user = userEvent.setup();
    renderCard();

    expect(screen.getByRole("heading", { name: "Research" })).toBeInTheDocument();
    expect(screen.getByText("在这句话里")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "在这句话里" })).toHaveTextContent(
      "Write a notice for Prof. Smith's research project.",
    );

    const contextToggle = screen.getByRole("button", { name: "当前语境" });
    const etymologyToggle = screen.getByRole("button", { name: "词源构词" });
    expect(contextToggle).toHaveAttribute("aria-expanded", "true");
    expect(etymologyToggle).toHaveAttribute("aria-expanded", "false");
    const contextRegion = screen.getByRole("region", { name: "当前语境" });
    expect(contextRegion).toHaveTextContent(
      "research 在这里作定语修饰 project",
    );
    expect(contextRegion).not.toHaveTextContent("折叠摘要");
    expect(contextRegion).not.toHaveTextContent("展开解析");
    expect(contextRegion).not.toHaveTextContent(
      "Write a notice for Prof. Smith's research project.",
    );

    await user.click(etymologyToggle);
    expect(contextToggle).toHaveTextContent(
      "这里指 Smith 教授的研究项目，用作名词修饰 project。",
    );
    const etymologyRegion = screen.getByRole("region", { name: "词源构词" });
    expect(etymologyRegion).toHaveTextContent("re-（再）+ search（寻找）");
    expect(etymologyRegion).toHaveTextContent("反复寻找以求发现。");
  });

  it("keeps only one deep section expanded at a time", async () => {
    const user = userEvent.setup();
    renderCard();

    const contextToggle = screen.getByRole("button", { name: "当前语境" });
    const etymologyToggle = screen.getByRole("button", { name: "词源构词" });
    await user.click(etymologyToggle);

    expect(contextToggle).toHaveAttribute("aria-expanded", "false");
    expect(etymologyToggle).toHaveAttribute("aria-expanded", "true");
    const region = screen.getByRole("region", { name: "词源构词" });
    expect(within(region).getByText("构词").tagName).toBe("STRONG");
    expect(within(region).getByText("核心意象").tagName).toBe("STRONG");
  });

  it("does not reuse a live sentence as missing context analysis", () => {
    const entryWithoutSavedContext = {
      ...entry,
      sections: entry.sections.filter((section) => section.title !== "当前语境"),
    };

    render(
      <SegmentedWordCard
        closeIcon={<span />}
        contextText="Write a notice for Prof. Smith's research project."
        entry={entryWithoutSavedContext}
        error={null}
        isLoading={false}
        isSaved={false}
        onClose={vi.fn()}
        onSaveToggle={vi.fn()}
        onSpeak={vi.fn()}
        saveIcon={<span />}
        speakIcon={<span />}
        term="research"
      />,
    );

    expect(screen.getByRole("region", { name: "在这句话里" })).toHaveTextContent(
      "Write a notice for Prof. Smith's research project.",
    );
    expect(screen.getByRole("region", { name: "当前语境" })).toHaveTextContent(
      "这个词还没有当前语境解析。",
    );
  });

  it("shows a calm missing-sentence message without breaking the accordion", () => {
    renderCard("");

    expect(screen.getByText("当前没有句子上下文。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "词源构词" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});
