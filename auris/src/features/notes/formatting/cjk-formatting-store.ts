/**
 * CJK 排版设置的持久化与 UI 映射。
 *
 * - 规范配置 `CJKFormattingSettings` 存 localStorage，供「一键中文排版」命令读取。
 * - 设置页（auris-settings）的开关用的是另一套 key（toggles/selects），这里提供
 *   双向映射：UI ↔ 规范配置。
 * - 改动时广播事件，便于已挂载的界面即时同步。
 */

import {
  DEFAULT_CJK_FORMATTING_SETTINGS,
  type CJKFormattingSettings,
  type QuoteStyle,
} from "./cjk-formatting-settings";

const STORAGE_KEY = "auris.notes.cjk-formatting";

/** 同一文档内广播配置变更。 */
export const CJK_FORMATTING_EVENT = "auris:cjk-formatting";

export function loadCjkFormattingSettings(): CJKFormattingSettings {
  if (typeof window === "undefined") {
    return DEFAULT_CJK_FORMATTING_SETTINGS;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CJKFormattingSettings>;
      // 与默认值合并，向前兼容（新增字段不会因旧存档缺失而变 undefined）。
      return { ...DEFAULT_CJK_FORMATTING_SETTINGS, ...parsed };
    }
  } catch {
    // 解析失败时回退默认。
  }
  return DEFAULT_CJK_FORMATTING_SETTINGS;
}

export function saveCjkFormattingSettings(settings: CJKFormattingSettings): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 写入失败不阻塞。
  }
  window.dispatchEvent(
    new CustomEvent<CJKFormattingSettings>(CJK_FORMATTING_EVENT, {
      detail: settings,
    }),
  );
}

/* ── 设置页 UI（toggles/selects）与规范配置的映射 ──────────────────────────
   设置页里这些开关位于「语言」分类，key 与规范字段不同名。 */

const QUOTE_STYLES: QuoteStyle[] = ["curly", "corner", "guillemets"];
// 「限制连续标点符号」下拉：关闭 / 限制为 1 / 限制为 3
const PUNCT_LIMITS = [0, 1, 3];

type UiToggles = Record<string, boolean>;
type UiSelects = Record<string, number>;

/** 由设置页 UI 状态推导规范配置（未在 UI 暴露的字段沿用默认值）。 */
export function cjkSettingsFromUi(
  toggles: UiToggles,
  selects: UiSelects,
): CJKFormattingSettings {
  const punctIdx = selects.limitConsecutivePunct ?? 0;
  return {
    ...DEFAULT_CJK_FORMATTING_SETTINGS,
    // 空格
    slashSpacing: toggles.removeSlashSpacing,
    spaceCollapsing: toggles.collapseSpaces,
    // 破折号与引号
    dashConversion: toggles.convertDashes,
    emdashSpacing: toggles.fixEmDashSpacing,
    smartQuoteConversion: toggles.convertStraightQuotes,
    quoteStyle: QUOTE_STYLES[selects.quoteStyle ?? 0] ?? "curly",
    contextualQuotes: toggles.contextAwareQuotes,
    quoteToggleMode:
      (selects.quoteToggleBehavior ?? 0) === 1 ? "full-cycle" : "simple",
    quoteSpacing: toggles.fixDoubleQuoteSpacing,
    singleQuoteSpacing: toggles.fixSingleQuoteSpacing,
    cjkCornerQuotes: toggles.cjkCornerQuotes,
    cjkNestedQuotes: toggles.nestedCornerQuotes,
    // 清理
    consecutivePunctuationLimit: PUNCT_LIMITS[punctIdx] ?? 0,
    trailingSpaceRemoval: toggles.removeTrailingSpaces,
    ellipsisNormalization: toggles.normalizeEllipsis,
    newlineCollapsing: toggles.collapseNewlines,
    // 章节
    skipReferenceSections: toggles.skipReferenceSections,
  };
}

/** 把规范配置回填到设置页 UI 用的 toggles 覆盖项（用于加载时同步开关状态）。 */
export function cjkUiTogglesFromSettings(
  settings: CJKFormattingSettings,
): UiToggles {
  return {
    removeSlashSpacing: settings.slashSpacing,
    collapseSpaces: settings.spaceCollapsing,
    convertDashes: settings.dashConversion,
    fixEmDashSpacing: settings.emdashSpacing,
    convertStraightQuotes: settings.smartQuoteConversion,
    contextAwareQuotes: settings.contextualQuotes,
    fixDoubleQuoteSpacing: settings.quoteSpacing,
    fixSingleQuoteSpacing: settings.singleQuoteSpacing,
    cjkCornerQuotes: settings.cjkCornerQuotes,
    nestedCornerQuotes: settings.cjkNestedQuotes,
    removeTrailingSpaces: settings.trailingSpaceRemoval,
    normalizeEllipsis: settings.ellipsisNormalization,
    collapseNewlines: settings.newlineCollapsing,
    skipReferenceSections: settings.skipReferenceSections,
  };
}

/** 把规范配置回填到设置页 UI 用的 selects 覆盖项。 */
export function cjkUiSelectsFromSettings(
  settings: CJKFormattingSettings,
): UiSelects {
  const styleIdx = QUOTE_STYLES.indexOf(settings.quoteStyle);
  const punctIdx = PUNCT_LIMITS.indexOf(settings.consecutivePunctuationLimit);
  return {
    quoteStyle: styleIdx >= 0 ? styleIdx : 0,
    quoteToggleBehavior: settings.quoteToggleMode === "full-cycle" ? 1 : 0,
    limitConsecutivePunct: punctIdx >= 0 ? punctIdx : 0,
  };
}
