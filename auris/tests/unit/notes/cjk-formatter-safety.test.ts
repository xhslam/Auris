import { describe, expect, it } from "vitest";
import type { CJKFormattingSettings } from "@/features/notes/formatting/cjk-formatting-settings";
import {
  formatMarkdown,
  formatSelection,
} from "@/features/notes/formatting/cjk-formatter/formatter";
import { verifyIntegrity } from "@/features/notes/formatting/cjk-formatter/integrity";
import { findProtectedRegions } from "@/features/notes/formatting/cjk-formatter/markdownParser";

const spacingOnly: CJKFormattingSettings = {
  ellipsisNormalization: false,
  newlineCollapsing: false,
  fullwidthAlphanumeric: false,
  fullwidthPunctuation: false,
  fullwidthParentheses: false,
  fullwidthBrackets: false,
  cjkEnglishSpacing: true,
  cjkParenthesisSpacing: false,
  currencySpacing: false,
  slashSpacing: false,
  spaceCollapsing: false,
  dashConversion: false,
  emdashSpacing: false,
  smartQuoteConversion: false,
  quoteStyle: "curly",
  contextualQuotes: false,
  quoteSpacing: false,
  singleQuoteSpacing: false,
  cjkCornerQuotes: false,
  cjkNestedQuotes: false,
  quoteToggleMode: "simple",
  consecutivePunctuationLimit: 0,
  trailingSpaceRemoval: true,
  skipReferenceSections: false,
};

describe("CJK formatter content safety", () => {
  it("protects an unclosed fenced block through end of document", () => {
    const source = "正文API\n```ts\nconst 中文API = 1;\n仍在编辑";
    expect(formatMarkdown(source, spacingOnly)).toBe(
      "正文 API\n```ts\nconst 中文API = 1;\n仍在编辑",
    );
    expect(findProtectedRegions(source)).toContainEqual({
      start: source.indexOf("```"),
      end: source.length,
      type: "fenced_code",
    });
  });

  it("protects TOML frontmatter including both delimiters", () => {
    const source = "+++\ntitle = \"中文API\"\n+++\n正文API\n";
    expect(formatMarkdown(source, spacingOnly)).toBe(
      "+++\ntitle = \"中文API\"\n+++\n正文 API\n",
    );
  });

  it("keeps spaces around protected inline spans", () => {
    const source = "使用 `printf` 函数与 $x+y$ 结果";
    expect(formatMarkdown(source, spacingOnly)).toBe(source);
  });

  it("preserves Markdown hard breaks and the final LF", () => {
    const source = "中文API  \n下一行\n";
    expect(
      formatMarkdown(source, spacingOnly, {
        preserveTwoSpaceHardBreaks: true,
      }),
    ).toBe("中文 API  \n下一行\n");
  });

  it("preserves a CRLF document terminator", () => {
    expect(formatMarkdown("中文API\r\n", spacingOnly)).toBe("中文 API\r\n");
  });

  it("uses Markdown protection for selection compatibility", () => {
    expect(formatSelection("`中文API` 外部API", spacingOnly)).toBe(
      "`中文API` 外部 API",
    );
  });

  it("rejects copied, removed, or reordered visible content", () => {
    expect(verifyIntegrity("中文abc", "中文abcabc").ok).toBe(false);
    expect(verifyIntegrity("中文abc", "中文ab").ok).toBe(false);
    expect(verifyIntegrity("中文abc", "abc中文").ok).toBe(false);
  });

  it("allows punctuation, whitespace, and width-only formatting", () => {
    expect(verifyIntegrity("中文, ＡＢＣ", "中文，ABC").ok).toBe(true);
  });
});
