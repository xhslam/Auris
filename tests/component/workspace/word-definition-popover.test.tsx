import { createRef } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WordDefinitionPopover } from "@/components/workspace/word-definition-popover";
import type { DictionaryEntry } from "@/features/dictionary/dictionary.types";
import { INFORM_PERSONAL_VOCAB_ENTRY } from "../../fixtures/dictionary/inform-personal-vocab";

const entry: DictionaryEntry = {
  meanings: [
    {
      definitions: ["数字的"],
      lexicalCategory: "adjective",
    },
  ],
  personal: {
    definition: "数字的",
    fileName: "digital.md",
    sections: [
      {
        title: "核心语义",
        lines: [
          "- **原始画面**: digit 最早关联手指计数。",
          "- **核心意象**: 手指计数 -> 离散数字 -> 电子编码。",
        ],
      },
      {
        title: "解释",
        lines: ["Digital 强调信息被转换成机器可处理的离散编码。"],
      },
      {
        title: "一语道破",
        lines: ["Digital means reality can be carried as data."],
      },
    ],
    source: {},
  },
  pronunciations: ["/ˈdɪdʒɪtl/"],
  sourceLabel: "个人词库",
  synonyms: [],
  word: "Digital",
};

function renderPopover(contextText?: string) {
  return render(
    <WordDefinitionPopover
      contextText={contextText}
      entry={entry}
      error={null}
      isLoading={false}
      isSaved={false}
      onSaveWord={vi.fn()}
      popoverRef={createRef<HTMLDivElement>()}
      position={{ left: 12, top: 20 }}
      word="digital"
    />,
  );
}

describe("WordDefinitionPopover", () => {
  it("starts as a short card and expands sections on demand", async () => {
    const user = userEvent.setup();

    renderPopover("This is a digital technology lesson.");

    expect(screen.getByText("Digital")).toBeInTheDocument();
    expect(screen.getByText("/ˈdɪdʒɪtl/")).toBeInTheDocument();
    expect(screen.getByText("数字的")).toBeInTheDocument();
    expect(screen.getByText("选择左侧分区查看内容。")).toBeInTheDocument();
    expect(
      screen.queryByText("原始画面: digit 最早关联手指计数。"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "当前语境" }));

    expect(
      screen.getByText("This is a digital technology lesson."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "词源构词" }));

    const etymologyPanel = screen.getByLabelText("词源构词");
    const list = within(etymologyPanel).getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("原始画面").tagName).toBe("STRONG");
    expect(etymologyPanel).not.toHaveTextContent("**");
  });

  it("keeps the context section blank when no sentence context exists", async () => {
    const user = userEvent.setup();

    renderPopover();

    await user.click(screen.getByRole("button", { name: "当前语境" }));

    expect(screen.getByText("当前没有句子上下文。")).toBeInTheDocument();
  });

  it("renders the reported Inform markdown as semantic vocabulary content", async () => {
    const user = userEvent.setup();

    render(
      <WordDefinitionPopover
        entry={INFORM_PERSONAL_VOCAB_ENTRY}
        error={null}
        isLoading={false}
        isSaved={false}
        popoverRef={createRef<HTMLDivElement>()}
        position={{ left: 12, top: 20 }}
        word="inform"
      />,
    );

    await user.click(screen.getByRole("button", { name: "词源构词" }));

    const etymologyPanel = screen.getByLabelText("词源构词");
    const list = within(etymologyPanel).getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(within(list).getByText("词源/构词").tagName).toBe("STRONG");
    expect(within(list).getByText("原始画面").tagName).toBe("STRONG");
    expect(within(list).getByText("核心意象").tagName).toBe("STRONG");
    expect(etymologyPanel).not.toHaveTextContent("**");
  });
});
