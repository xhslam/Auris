import { describe, expect, it } from "vitest";
import wordIndex from "@/features/dictionary/personal-vocab/word-index.json";
import {
  PERSONAL_VOCAB_SECTION_CONTRACTS,
  groupPersonalVocabMarkdownLines,
  renderPersonalVocabMarkdown,
  selectPersonalVocabMarkdownGroups,
} from "@/features/dictionary/personal-vocab/personal-vocab-markdown";
import { INFORM_PERSONAL_VOCAB_LINES } from "../../fixtures/dictionary/inform-personal-vocab";

function parse(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content;
}

type CheckedInVocabEntry = {
  lookupKey: string;
  sections: Array<{ lines: string[]; title: string }>;
};

function entry(lookupKey: string): CheckedInVocabEntry {
  const found = (wordIndex.entries as CheckedInVocabEntry[]).find((item) => item.lookupKey === lookupKey);
  expect(found, `missing checked-in entry ${lookupKey}`).toBeDefined();
  return found!;
}

describe("personal vocabulary section contracts", () => {
  it("exports the card matchers including the saved context section", () => {
    expect(PERSONAL_VOCAB_SECTION_CONTRACTS).toEqual({
      context: ["当前语境"],
      etymology: ["词源", "构词", "核心语义", "原始画面", "核心意象"],
      usage: ["用法", "边界", "搭配", "近义词", "误用"],
      deep: ["深层", "解释"],
      epiphany: ["一语道破", "金句"],
    });
  });

  it("selects matching source sections without flattening them", () => {
    const sections = [
      { title: "词源", lines: ["first"] },
      { title: "当前语境", lines: ["ignored"] },
      { title: "核心意象补充", lines: ["second"] },
    ];

    expect(selectPersonalVocabMarkdownGroups(sections, "etymology")).toEqual([
      { id: "etymology-0", lines: ["first"] },
      { id: "etymology-2", lines: ["second"] },
    ]);
  });
});

describe("groupPersonalVocabMarkdownLines", () => {
  it("makes ordinary source lines separate paragraphs", () => {
    expect(groupPersonalVocabMarkdownLines(["alpha", "beta"])).toBe(
      "alpha\n\nbeta",
    );
  });

  it("keeps contiguous unordered, ordered, and quote lines in their own blocks", () => {
    expect(
      groupPersonalVocabMarkdownLines([
        "- one",
        "* two",
        "prose",
        "1. first",
        "2. second",
        "> quote one",
        "> quote two",
        "tail",
      ]),
    ).toBe(
      "- one\n* two\n\nprose\n\n1. first\n2. second\n\n> quote one\n> quote two\n\ntail",
    );
  });

  it("preserves matching backtick and tilde fences including inner transitions", () => {
    expect(
      groupPersonalVocabMarkdownLines([
        "```ts",
        "- code, not a list",
        "```",
        "after",
        "~~~~",
        "> still code",
        "~~~~",
      ]),
    ).toBe(
      "```ts\n- code, not a list\n```\n\nafter\n\n~~~~\n> still code\n~~~~",
    );
  });

  it("keeps unclosed matching-character fences through the final line", () => {
    expect(
      groupPersonalVocabMarkdownLines(["~~~js", "one", "```", "two"]),
    ).toBe("~~~js\none\n```\ntwo");
  });

  it("treats a backtick fence with a backtick in its info string as ordinary input", () => {
    expect(
      groupPersonalVocabMarkdownLines([
        "```js `invalid`",
        "- this transition is a list",
        "after",
      ]),
    ).toBe("```js `invalid`\n\n- this transition is a list\n\nafter");
  });

  it("groups a GFM pipe header, delimiter, and subsequent pipe rows", () => {
    expect(
      groupPersonalVocabMarkdownLines([
        "| word | meaning |",
        "| :--- | ---: |",
        "| range | span |",
        "after",
      ]),
    ).toBe(
      "| word | meaning |\n| :--- | ---: |\n| range | span |\n\nafter",
    );
  });

  it("does not start tables with invalid delimiters or mismatched column counts", () => {
    expect(
      groupPersonalVocabMarkdownLines([
        "| one | two |",
        "| --- |",
        "| value | value |",
        "| valid | header |",
        "| -- | --- |",
      ]),
    ).toBe(
      "| one | two |\n\n| --- |\n\n| value | value |\n\n| valid | header |\n\n| -- | --- |",
    );
  });
});

describe("renderPersonalVocabMarkdown", () => {
  it("renders the canonical reported inform bold-list fixture", () => {
    const root = parse(renderPersonalVocabMarkdown(INFORM_PERSONAL_VOCAB_LINES));
    expect(root.querySelectorAll("ul li")).toHaveLength(3);
    expect(
      [...root.querySelectorAll("ul li strong")].map((element) => element.textContent),
    ).toEqual(["词源/构词", "原始画面", "核心意象"]);
    expect(root.textContent).not.toContain("**");
  });

  it("renders checked-in fundamental and economic source lines unchanged", () => {
    const fundamental = entry("fundamental");
    const fundamentalLines = fundamental.sections.find((section) =>
      section.title.includes("词源"),
    )!.lines;
    const fundamentalHtml = renderPersonalVocabMarkdown(
      fundamentalLines,
    );
    expect(parse(fundamentalHtml).querySelector("em")?.textContent).toBe(
      "fundamentum",
    );

    const economicLines = entry("economic").sections.at(-1)!.lines;
    const economicRoot = parse(renderPersonalVocabMarkdown(economicLines));
    const storedEconomicText = economicLines[0].replace(/^>\s*/, "");
    expect(economicRoot.textContent).toContain(storedEconomicText);
    expect(Boolean(economicRoot.querySelector("blockquote"))).toBe(
      economicLines[0].startsWith(">"),
    );
  });

  it("keeps checked-in range dollar amounts as currency rather than math", () => {
    const rangeLines = entry("range").sections[0].lines;
    const html = renderPersonalVocabMarkdown(rangeLines);
    expect(parse(html).textContent).toContain("$10 to $50");
    expect(html).not.toMatch(/katex|math/i);
  });

  it("drops raw HTML, scripts, forbidden tags and forbidden attributes", () => {
    const html = renderPersonalVocabMarkdown([
      '<script>alert(1)</script><img src="x"><b class="x" style="color:red" id="x" data-x="x" onclick="x()">safe</b>',
    ]);
    const root = parse(html);
    expect(root.querySelector("script,img,b,[class],[style],[id],[data-x],[onclick]")).toBeNull();
    expect(root.textContent).not.toContain("alert(1)");
  });

  it("allows relative, http, https, and mailto links but rejects unsafe protocols", () => {
    const html = renderPersonalVocabMarkdown([
      "[relative](/words/range) [http](http://example.com) [https](https://example.com) [mail](mailto:reader@example.com) [js](javascript:alert(1)) [data](data:text/html,bad)",
    ]);
    const links = [...parse(html).querySelectorAll("a")];
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/words/range",
      "http://example.com",
      "https://example.com",
      "mailto:reader@example.com",
      null,
      null,
    ]);
  });

  it("keeps only generated disabled checkbox task inputs", () => {
    const task = parse(renderPersonalVocabMarkdown(["- [x] learned", "- [ ] review"]));
    const inputs = [...task.querySelectorAll("input")];
    expect(inputs).toHaveLength(2);
    expect(inputs.every((input) => input.type === "checkbox" && input.disabled)).toBe(true);
    expect(inputs[0].checked).toBe(true);

    const hostile = parse(
      renderPersonalVocabMarkdown([
        '<input type="text"><input type="checkbox"><input type="checkbox" disabled>',
      ]),
    );
    expect(hostile.querySelector("input")).toBeNull();
  });
});

describe("checked-in personal vocabulary corpus", () => {
  it(
    "renders every canonically matched source group without unsafe output",
    () => {
      const seen = new Set<string>();
      for (const corpusEntry of wordIndex.entries) {
        for (const sectionKey of Object.keys(
          PERSONAL_VOCAB_SECTION_CONTRACTS,
        ) as Array<keyof typeof PERSONAL_VOCAB_SECTION_CONTRACTS>) {
          for (const group of selectPersonalVocabMarkdownGroups(
            corpusEntry.sections,
            sectionKey,
          )) {
            const key = `${corpusEntry.lookupKey}:${group.id}`;
            if (seen.has(key)) continue;
            seen.add(key);

            const root = parse(renderPersonalVocabMarkdown(group.lines));
            expect(
              root.querySelector("script,style,img,iframe,svg,input:not([disabled])"),
              key,
            ).toBeNull();
            for (const element of root.querySelectorAll("*")) {
              for (const attribute of element.getAttributeNames()) {
                expect(
                  attribute === "style" ||
                    attribute === "class" ||
                    attribute === "id" ||
                    attribute.startsWith("data-") ||
                    attribute.startsWith("on"),
                  `${key}: ${element.tagName}[${attribute}]`,
                ).toBe(false);
              }
            }
            for (const link of root.querySelectorAll("a[href]")) {
              expect(link.getAttribute("href"), key).toMatch(
                /^(?:https?:|mailto:|\/|\.\/|\.\.\/|#|\?)/i,
              );
            }
          }
        }
      }
      expect(seen.size).toBeGreaterThan(0);
    },
    // 这条用例遍历整份签入语料，成本是 O(语料量)：单独跑约 8s 测试体时间。
    // 原来的 30s 预算在全量并发（300+ 文件 / 8 核）下余量太薄，会间歇性超时——
    // 表现为「随机一条与本次改动无关的用例失败」，很难查。
    //
    // 不改成抽样：它是对全部语料的 XSS/属性白名单检查，抽样会让「某一条语料引入
    // 不安全输出」有概率漏过，而那正是这条用例存在的理由。慢是因为工作量真实。
    120_000,
  );
});
