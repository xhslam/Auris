import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@testing-library/react";
import { PersonalVocabMarkdown } from "@/components/workspace/personal-vocab-markdown";
import type { PersonalVocabMarkdownGroup } from "@/features/dictionary/personal-vocab/personal-vocab-markdown";

const groups: readonly PersonalVocabMarkdownGroup[] = [
  {
    id: "meaning",
    lines: [
      "**strong** and *emphasis*",
      "",
      "- first",
      "- second",
      "",
      "> quoted",
      "",
      "`inline`",
      "",
      "| Term | Meaning |",
      "| --- | --- |",
      "| auris | ear |",
      "",
      "[safe](https://example.com)",
    ],
  },
];

function splitTopLevelSelectors(selectorList: string) {
  const selectors: string[] = [];
  let bracketDepth = 0;
  let parenthesisDepth = 0;
  let quote: "\"" | "'" | null = null;
  let selectorStart = 0;

  for (let index = 0; index < selectorList.length; index += 1) {
    const character = selectorList[index];

    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
      continue;
    }

    if (character === "\"" || character === "'") quote = character;
    else if (character === "[") bracketDepth += 1;
    else if (character === "]") bracketDepth -= 1;
    else if (character === "(") parenthesisDepth += 1;
    else if (character === ")") parenthesisDepth -= 1;
    else if (
      character === "," &&
      bracketDepth === 0 &&
      parenthesisDepth === 0
    ) {
      selectors.push(selectorList.slice(selectorStart, index).trim());
      selectorStart = index + 1;
    }
  }

  selectors.push(selectorList.slice(selectorStart).trim());
  return selectors.filter(Boolean);
}

function extractTopLevelSelectors(stylesheet: string) {
  const css = stylesheet.replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors: string[] = [];
  let depth = 0;
  let ruleStart = 0;

  for (let index = 0; index < css.length; index += 1) {
    if (css[index] === "{") {
      if (depth === 0) {
        selectors.push(...splitTopLevelSelectors(css.slice(ruleStart, index)));
      }
      depth += 1;
    } else if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) ruleStart = index + 1;
    }
  }

  return selectors;
}

function isScopedPersonalVocabStylesheet(stylesheet: string) {
  if (/@[\w-]+/.test(stylesheet)) return false;

  const selectors = extractTopLevelSelectors(stylesheet);
  return (
    selectors.length > 0 &&
    selectors.every((selector) =>
      selector.startsWith(".personal-vocab-markdown"),
    )
  );
}

describe("PersonalVocabMarkdown", () => {
  it("renders sanitized semantic markdown inside a group", () => {
    const { container } = render(<PersonalVocabMarkdown groups={groups} />);
    const group = container.querySelector(".personal-vocab-markdown__group");

    expect(group).not.toBeNull();
    expect(group?.querySelector("strong")).toHaveTextContent("strong");
    expect(group?.querySelector("em")).toHaveTextContent("emphasis");
    expect(group?.querySelectorAll("ul > li")).toHaveLength(2);
    expect(group?.querySelector("blockquote")).toHaveTextContent("quoted");
    expect(group?.querySelector("code")).toHaveTextContent("inline");
    expect(group?.querySelector("table tbody td")).toHaveTextContent("auris");
    expect(group?.querySelector("a")).toHaveAttribute(
      "href",
      "https://example.com",
    );
  });

  it("removes malicious HTML and unsafe links", () => {
    const malicious: readonly PersonalVocabMarkdownGroup[] = [
      {
        id: "unsafe",
        lines: [
          '<script>alert("xss")</script>',
          '<img src=x onerror="alert(1)">',
          "[bad](javascript:alert(1))",
        ],
      },
    ];

    const { container } = render(<PersonalVocabMarkdown groups={malicious} />);

    expect(container.querySelector("script, img")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
    expect(container.querySelector("a")).not.toHaveAttribute("href");
  });

  it("keeps markdown groups as independent sibling containers", () => {
    const independentGroups: readonly PersonalVocabMarkdownGroup[] = [
      { id: "one", lines: ["- alpha"] },
      { id: "two", lines: ["- beta"] },
    ];
    const { container } = render(
      <PersonalVocabMarkdown groups={independentGroups} />,
    );
    const renderedGroups = container.querySelectorAll(
      ":scope > .personal-vocab-markdown > .personal-vocab-markdown__group",
    );

    expect(renderedGroups).toHaveLength(2);
    expect(renderedGroups[0]).toHaveTextContent("alpha");
    expect(renderedGroups[0]).not.toHaveTextContent("beta");
    expect(renderedGroups[1]).toHaveTextContent("beta");
    expect(renderedGroups[1]).not.toHaveTextContent("alpha");
  });

  it("renders duplicate group ids across rerenders without key warnings", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const duplicateGroups: readonly PersonalVocabMarkdownGroup[] = [
      { id: "duplicate", lines: ["alpha"] },
      { id: "duplicate", lines: ["beta"] },
    ];
    const { container, rerender } = render(
      <PersonalVocabMarkdown groups={duplicateGroups} />,
    );

    rerender(
      <PersonalVocabMarkdown
        groups={[
          { id: "duplicate", lines: ["updated alpha"] },
          { id: "duplicate", lines: ["updated beta"] },
        ]}
      />,
    );

    const renderedGroups = container.querySelectorAll(
      ".personal-vocab-markdown__group",
    );
    expect(renderedGroups).toHaveLength(2);
    expect(renderedGroups[0]).toHaveTextContent("updated alpha");
    expect(renderedGroups[1]).toHaveTextContent("updated beta");
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("renders an empty root for empty groups", () => {
    const { container } = render(<PersonalVocabMarkdown groups={[]} />);

    expect(container.firstElementChild).toHaveClass("personal-vocab-markdown");
    expect(container.firstElementChild).toBeEmptyDOMElement();
  });
});

describe("personal vocabulary markdown stylesheet", () => {
  it("extracts comma-separated selectors without reading declarations", () => {
    const css = `
      .personal-vocab-markdown p,
      .personal-vocab-markdown li { background: linear-gradient(red, blue); }
      .personal-vocab-markdown a { color: cyan; }
    `;

    expect(extractTopLevelSelectors(css)).toEqual([
      ".personal-vocab-markdown p",
      ".personal-vocab-markdown li",
      ".personal-vocab-markdown a",
    ]);
  });

  it("preserves functional and attribute selector commas", () => {
    const scopedCss = `
      .personal-vocab-markdown :is(p, li) { color: inherit; }
      .personal-vocab-markdown [data-kind="one,two"] { color: inherit; }
    `;
    const unscopedCss =
      ".personal-vocab-markdown p, body { color: inherit; }";

    expect(extractTopLevelSelectors(scopedCss)).toEqual([
      ".personal-vocab-markdown :is(p, li)",
      '.personal-vocab-markdown [data-kind="one,two"]',
    ]);
    expect(isScopedPersonalVocabStylesheet(scopedCss)).toBe(true);
    expect(isScopedPersonalVocabStylesheet(unscopedCss)).toBe(false);
  });

  it("rejects nested at-rules that could conceal global selectors", () => {
    const unsafeCss = `
      .personal-vocab-markdown { color: inherit; }
      @media (min-width: 40rem) { body { color: red; } }
    `;

    expect(isScopedPersonalVocabStylesheet(unsafeCss)).toBe(false);
  });

  it("scopes every selector under the component root", () => {
    const stylesheet = readFileSync(
      resolve(
        process.cwd(),
        "src/components/workspace/personal-vocab-markdown.css",
      ),
      "utf8",
    );
    expect(stylesheet).not.toMatch(/@[\w-]+/);

    const selectors = extractTopLevelSelectors(stylesheet);
    expect(selectors.length).toBeGreaterThan(0);
    expect(isScopedPersonalVocabStylesheet(stylesheet)).toBe(true);
    expect(stylesheet).not.toMatch(/(?:^|[\s,{])(?:body|html|\.Notes)(?:[\s.{:#,]|$)/m);
  });
});
