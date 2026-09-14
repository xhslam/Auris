/**
 * CJK 排版设置类型与默认值。
 *
 * 移植自 vmark（github.com/xiaolai/vmark, ISC License, © 2026 Xiaolai Li）
 * 的 `settingsTypes.ts` / `settingsStore/defaults.ts`，仅保留 CJK 排版相关字段。
 *
 * 这些开关驱动 `cjk-formatter/` 引擎里的各条规则；与「设置 → Formats」分类的
 * UI 开关一一对应（映射见 cjk-formatting-store.ts）。
 */

/** 智能引号目标风格：弯引号 / 直角引号 / 书名号。 */
export type QuoteStyle = "curly" | "corner" | "guillemets";

export interface CJKFormattingSettings {
  // 组 1：通用
  ellipsisNormalization: boolean;
  newlineCollapsing: boolean;
  // 组 2：全角规范化
  fullwidthAlphanumeric: boolean;
  fullwidthPunctuation: boolean;
  fullwidthParentheses: boolean;
  fullwidthBrackets: boolean;
  // 组 3：空格
  cjkEnglishSpacing: boolean;
  cjkParenthesisSpacing: boolean;
  currencySpacing: boolean;
  slashSpacing: boolean;
  spaceCollapsing: boolean;
  // 组 4：破折号与引号
  dashConversion: boolean;
  emdashSpacing: boolean;
  smartQuoteConversion: boolean;
  quoteStyle: QuoteStyle;
  contextualQuotes: boolean;
  quoteSpacing: boolean;
  singleQuoteSpacing: boolean;
  cjkCornerQuotes: boolean;
  cjkNestedQuotes: boolean;
  quoteToggleMode: "simple" | "full-cycle";
  // 组 5：清理
  consecutivePunctuationLimit: number; // 0=关闭, 1=单个, 2=双个
  trailingSpaceRemoval: boolean;
  // 组 6：章节处理
  skipReferenceSections: boolean;
}

/** 默认配置（沿用 vmark 的默认开关状态）。 */
export const DEFAULT_CJK_FORMATTING_SETTINGS: CJKFormattingSettings = {
  // 组 1
  ellipsisNormalization: true,
  newlineCollapsing: true,
  // 组 2
  fullwidthAlphanumeric: true,
  fullwidthPunctuation: true,
  fullwidthParentheses: true,
  fullwidthBrackets: false,
  // 组 3
  cjkEnglishSpacing: true,
  cjkParenthesisSpacing: true,
  currencySpacing: true,
  slashSpacing: true,
  spaceCollapsing: true,
  // 组 4
  dashConversion: true,
  emdashSpacing: true,
  smartQuoteConversion: true,
  quoteStyle: "curly",
  contextualQuotes: true,
  quoteSpacing: true,
  singleQuoteSpacing: true,
  cjkCornerQuotes: false,
  cjkNestedQuotes: false,
  quoteToggleMode: "simple",
  // 组 5
  consecutivePunctuationLimit: 0,
  trailingSpaceRemoval: true,
  // 组 6
  skipReferenceSections: false,
};
