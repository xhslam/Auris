import type { CJKFormattingSettings } from "@/features/notes/formatting/cjk-formatting-settings";
import { formatMarkdown } from "@/features/notes/formatting/cjk-formatter/formatter";

/** Automatic-save normalization deliberately enables only CJK/Latin spacing. */
const CJK_SPACING_ONLY: CJKFormattingSettings = {
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
  trailingSpaceRemoval: false,
  skipReferenceSections: false,
};

/**
 * Add spacing between adjacent CJK and ASCII letters/numbers without touching
 * Markdown structure, code, frontmatter, URLs, math, or hard breaks.
 */
export function normalizeCjkSpacing(source: string): string {
  return formatMarkdown(source, CJK_SPACING_ONLY, {
    preserveTwoSpaceHardBreaks: true,
  });
}
