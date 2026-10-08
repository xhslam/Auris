/**
 * 笔记编辑器排版设置（字号 / 行高 / 块间距 / CJK 字间距 / 编辑器宽度）。
 *
 * - 设置值持久化在 localStorage，由「设置 → 编辑器」分类驱动；
 *   阅读区右上角行宽滑条也会写入同一份设置。
 * - 工作台把这些值作为 CSS 变量挂到 `.notes-v2` 根上，编辑器 CSS 通过
 *   `var(--notes-editor-*)` 读取。
 * - 拉丁、CJK 和等宽字体分别保留用户选择。
 */

export interface NotesTypographySettings {
  fontSize: string; // 例 "18px"
  lineHeight: string; // 例 "1.6"
  blockSpacing: string; // 段落下间距，例 "14px"
  cjkLetterSpacing: string; // "normal" | "0.05em" | "0.1em"
  editorMaxWidth: string; // "none" | "40em" | "50em" | "60em" | 任意 "NNem"
  fontLatin: string; // 拉丁字体栈，"系统默认"为当前无衬线栈
  fontCjk: string; // CJK 字体栈
  fontMono: string; // 等宽字体栈（同时驱动 --auris-font-mono）
}

/** 阅读区行宽滑条：以 em 为单位的连续区间；拉到最右为「不限宽」。 */
export const EDITOR_WIDTH_SLIDER_MIN_EM = 36;
export const EDITOR_WIDTH_SLIDER_MAX_EM = 80;
export const EDITOR_WIDTH_SLIDER_FULL = 100;

/** 当前编辑器实际字体栈——「系统默认」选项即映射到这几个值，保证不接通时观感不变。 */
const DEFAULT_LATIN_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI"';
const DEFAULT_CJK_STACK = '"PingFang SC", "Microsoft YaHei"';
const DEFAULT_MONO_STACK =
  '"Cascadia Code", "JetBrains Mono", "SFMono-Regular", monospace';

/** 默认值——与编辑器 CSS 的 var() 回退值、设置页 INITIAL_SELECTS 三者保持一致。 */
export const DEFAULT_NOTES_TYPOGRAPHY: NotesTypographySettings = {
  fontSize: "18px",
  lineHeight: "1.8",
  blockSpacing: "14px",
  cjkLetterSpacing: "normal",
  // 默认中等阅读栏：正文列居中，左右留白对称；可用右下角滑条再调。
  editorMaxWidth: "50em",
  fontLatin: DEFAULT_LATIN_STACK,
  fontCjk: DEFAULT_CJK_STACK,
  fontMono: DEFAULT_MONO_STACK,
};

const STORAGE_KEY = "auris.notes.typography";

/** 同一文档内广播排版变更，便于已挂载的工作台即时应用。 */
export const NOTES_TYPOGRAPHY_EVENT = "auris:notes-typography";

export function loadNotesTypography(): NotesTypographySettings {
  if (typeof window === "undefined") {
    return DEFAULT_NOTES_TYPOGRAPHY;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<NotesTypographySettings>;
      return { ...DEFAULT_NOTES_TYPOGRAPHY, ...parsed };
    }
  } catch {
    // 解析失败回退默认。
  }
  return DEFAULT_NOTES_TYPOGRAPHY;
}

export function saveNotesTypography(settings: NotesTypographySettings): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 写入失败不阻塞。
  }
  window.dispatchEvent(
    new CustomEvent<NotesTypographySettings>(NOTES_TYPOGRAPHY_EVENT, {
      detail: settings,
    }),
  );
}

/**
 * 正文列实际使用的 max-width。
 * `none`（设置页「100%」）时退回舒适上限，避免超宽屏一行拖到屏幕边缘。
 */
export function resolveNotesEditorContentWidth(editorMaxWidth: string): string {
  if (!editorMaxWidth || editorMaxWidth === "none") {
    return "min(1240px, 100%)";
  }
  return editorMaxWidth;
}

/** 把排版设置转成挂在根元素上的 CSS 变量。 */
export function notesTypographyCssVars(
  settings: NotesTypographySettings,
): Record<string, string> {
  const contentWidth = resolveNotesEditorContentWidth(settings.editorMaxWidth);
  return {
    "--notes-editor-font-size": settings.fontSize,
    "--notes-editor-line-height": settings.lineHeight,
    "--notes-editor-block-spacing": settings.blockSpacing,
    "--notes-editor-cjk-letter-spacing": settings.cjkLetterSpacing,
    "--notes-editor-max-width": settings.editorMaxWidth,
    // 阅读/编辑正文列共用：标题 + 正文一起限宽并居中。
    "--notes-editor-content-width": contentWidth,
    "--notes-editor-font-latin": settings.fontLatin,
    "--notes-editor-font-cjk": settings.fontCjk,
    "--notes-editor-font-mono": settings.fontMono,
    // 复用既有的全局等宽变量，让代码块/内联代码一并跟随。
    "--auris-font-mono": settings.fontMono,
  };
}

/* ── 设置页 UI（selects）映射 ─────────────────────────────────────────────
   下拉项顺序须与 auris-settings 的 options 数组一致。 */

const FONT_SIZES = ["18px", "20px", "22px", "24px"];
const LINE_HEIGHTS = ["1.4", "1.6", "1.8", "2.0"];
const BLOCK_SPACINGS = ["7px", "14px", "21px", "28px"]; // 0.5× / 1× / 1.5× / 2×（基准 14px）
const CJK_LETTER_SPACINGS = ["normal", "0.05em", "0.1em"];
const EDITOR_WIDTHS = ["40em", "50em", "60em", "none"]; // 40/50/60em / 100%

/** 行宽设置 → 右下角滑条位置（0–100；100 = 不限宽）。 */
export function editorMaxWidthToSlider(editorMaxWidth: string): number {
  if (!editorMaxWidth || editorMaxWidth === "none") {
    return EDITOR_WIDTH_SLIDER_FULL;
  }
  const em = Number.parseFloat(editorMaxWidth);
  if (!Number.isFinite(em)) {
    return editorMaxWidthToSlider(DEFAULT_NOTES_TYPOGRAPHY.editorMaxWidth);
  }
  const clamped = Math.min(
    EDITOR_WIDTH_SLIDER_MAX_EM,
    Math.max(EDITOR_WIDTH_SLIDER_MIN_EM, em),
  );
  return Math.round(
    ((clamped - EDITOR_WIDTH_SLIDER_MIN_EM) /
      (EDITOR_WIDTH_SLIDER_MAX_EM - EDITOR_WIDTH_SLIDER_MIN_EM)) *
      (EDITOR_WIDTH_SLIDER_FULL - 1),
  );
}

/** 右下角滑条位置 → 行宽设置。 */
export function sliderToEditorMaxWidth(slider: number): string {
  const value = Math.round(slider);
  if (value >= EDITOR_WIDTH_SLIDER_FULL) {
    return "none";
  }
  const ratio = Math.min(EDITOR_WIDTH_SLIDER_FULL - 1, Math.max(0, value)) /
    (EDITOR_WIDTH_SLIDER_FULL - 1);
  const em =
    EDITOR_WIDTH_SLIDER_MIN_EM +
    ratio * (EDITOR_WIDTH_SLIDER_MAX_EM - EDITOR_WIDTH_SLIDER_MIN_EM);
  return `${Math.round(em)}em`;
}

/** 把任意行宽值映射到设置页离散选项的最近下标。 */
function nearestEditorWidthIndex(editorMaxWidth: string): number {
  if (editorMaxWidth === "none") {
    return EDITOR_WIDTHS.indexOf("none");
  }
  const em = Number.parseFloat(editorMaxWidth);
  if (!Number.isFinite(em)) {
    return EDITOR_WIDTHS.indexOf(DEFAULT_NOTES_TYPOGRAPHY.editorMaxWidth);
  }
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  EDITOR_WIDTHS.forEach((option, index) => {
    if (option === "none") {
      return;
    }
    const optionEm = Number.parseFloat(option);
    const distance = Math.abs(optionEm - em);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

// 字体下拉项 idx0 均为「系统默认」=当前字体栈，避免接通后观感突变。
const LATIN_FONTS = [
  DEFAULT_LATIN_STACK,
  '"Athelas"',
  '"Georgia"',
  '"Charter"',
  '"Times New Roman", Times',
];
const CJK_FONTS = [
  DEFAULT_CJK_STACK,
  '"Kaiti SC", KaiTi',
  '"Noto Serif SC"',
  '"PingFang SC"',
  '"Songti SC", SimSun',
];
const MONO_FONTS = [
  DEFAULT_MONO_STACK,
  '"Menlo"',
  '"SF Mono", "SFMono-Regular"',
  '"JetBrains Mono"',
  '"Fira Code"',
];

type UiSelects = Record<string, number>;

function valueAt(list: string[], idx: number | undefined, fallback: string) {
  if (idx === undefined || idx < 0 || idx >= list.length) {
    return fallback;
  }
  return list[idx];
}

/** 由设置页 selects 推导排版设置。 */
export function typographyFromUi(selects: UiSelects): NotesTypographySettings {
  return {
    fontSize: valueAt(FONT_SIZES, selects.fontSize, DEFAULT_NOTES_TYPOGRAPHY.fontSize),
    lineHeight: valueAt(LINE_HEIGHTS, selects.lineHeightEd, DEFAULT_NOTES_TYPOGRAPHY.lineHeight),
    blockSpacing: valueAt(BLOCK_SPACINGS, selects.blockSpacing, DEFAULT_NOTES_TYPOGRAPHY.blockSpacing),
    cjkLetterSpacing: valueAt(CJK_LETTER_SPACINGS, selects.cjkLetterSpacing, DEFAULT_NOTES_TYPOGRAPHY.cjkLetterSpacing),
    editorMaxWidth: valueAt(EDITOR_WIDTHS, selects.editorWidth, DEFAULT_NOTES_TYPOGRAPHY.editorMaxWidth),
    fontLatin: valueAt(LATIN_FONTS, selects.latinFont, DEFAULT_NOTES_TYPOGRAPHY.fontLatin),
    fontCjk: valueAt(CJK_FONTS, selects.cjkFont, DEFAULT_NOTES_TYPOGRAPHY.fontCjk),
    fontMono: valueAt(MONO_FONTS, selects.monoFont, DEFAULT_NOTES_TYPOGRAPHY.fontMono),
  };
}

/** 把排版设置回填到设置页 selects（用于加载时同步下拉选中项）。 */
export function typographyUiSelects(
  settings: NotesTypographySettings,
): UiSelects {
  return {
    fontSize: Math.max(0, FONT_SIZES.indexOf(settings.fontSize)),
    lineHeightEd: Math.max(0, LINE_HEIGHTS.indexOf(settings.lineHeight)),
    blockSpacing: Math.max(0, BLOCK_SPACINGS.indexOf(settings.blockSpacing)),
    cjkLetterSpacing: Math.max(0, CJK_LETTER_SPACINGS.indexOf(settings.cjkLetterSpacing)),
    editorWidth: nearestEditorWidthIndex(settings.editorMaxWidth),
    latinFont: Math.max(0, LATIN_FONTS.indexOf(settings.fontLatin)),
    cjkFont: Math.max(0, CJK_FONTS.indexOf(settings.fontCjk)),
    monoFont: Math.max(0, MONO_FONTS.indexOf(settings.fontMono)),
  };
}
