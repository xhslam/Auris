/**
 * Markdown 渲染布局（所见即所得正文）：块级字号 / 标题对齐 / 图片边框。
 *
 * 对齐 vmark 的 markdown 布局设置（blockFontSize / headingAlignment /
 * mediaBorderStyle）。与字号那刀同款机制：作为 CSS 变量挂到 `.notes-v2` 根，
 * 编辑器 CSS 通过 var() 读取。默认值=当前观感，未改设置时不变。
 *
 * 图片/表格居中、表格适宽暂未纳入（会与现有表格布局打架，单独评估）。
 */

export interface NotesMarkdownLayout {
  blockFontSize: string; // "0.9" | "1" | "1.1"（相对 em 的倍数）
  headingAlign: string; // "left" | "center" | "right"
  mediaBorder: string; // 完整 CSS border 值
}

const BORDER_NONE = "none";
const BORDER_THIN = "1px solid var(--notes-line)";
const BORDER_THICK = "2px solid var(--notes-line-strong)";

/** 默认值——与编辑器 CSS 的 var() 回退值、设置页 INITIAL_SELECTS 三者一致。 */
export const DEFAULT_NOTES_MARKDOWN_LAYOUT: NotesMarkdownLayout = {
  blockFontSize: "1",
  headingAlign: "left",
  mediaBorder: BORDER_NONE,
};

const STORAGE_KEY = "auris.notes.markdown-layout";

export const NOTES_MARKDOWN_LAYOUT_EVENT = "auris:notes-markdown-layout";

export function loadNotesMarkdownLayout(): NotesMarkdownLayout {
  if (typeof window === "undefined") {
    return DEFAULT_NOTES_MARKDOWN_LAYOUT;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<NotesMarkdownLayout>;
      return { ...DEFAULT_NOTES_MARKDOWN_LAYOUT, ...parsed };
    }
  } catch {
    // 回退默认。
  }
  return DEFAULT_NOTES_MARKDOWN_LAYOUT;
}

export function saveNotesMarkdownLayout(settings: NotesMarkdownLayout): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 写入失败不阻塞。
  }
  window.dispatchEvent(
    new CustomEvent<NotesMarkdownLayout>(NOTES_MARKDOWN_LAYOUT_EVENT, {
      detail: settings,
    }),
  );
}

export function notesMarkdownLayoutCssVars(
  settings: NotesMarkdownLayout,
): Record<string, string> {
  return {
    "--notes-md-block-font-size": settings.blockFontSize,
    "--notes-md-heading-align": settings.headingAlign,
    "--notes-md-media-border": settings.mediaBorder,
  };
}

/* ── 设置页 selects 映射（顺序须与 auris-settings 的 options 一致）─────────── */

const BLOCK_FONT_SIZES = ["0.9", "1", "1.1"]; // 90% / 100% / 110%
const HEADING_ALIGNS = ["left", "center", "right"]; // 左 / 居中 / 右
const MEDIA_BORDERS = [BORDER_NONE, BORDER_THIN, BORDER_THICK]; // 无 / 细 / 粗

type UiSelects = Record<string, number>;

function valueAt(list: string[], idx: number | undefined, fallback: string) {
  if (idx === undefined || idx < 0 || idx >= list.length) {
    return fallback;
  }
  return list[idx];
}

export function markdownLayoutFromUi(selects: UiSelects): NotesMarkdownLayout {
  return {
    blockFontSize: valueAt(BLOCK_FONT_SIZES, selects.blockFontSize, DEFAULT_NOTES_MARKDOWN_LAYOUT.blockFontSize),
    headingAlign: valueAt(HEADING_ALIGNS, selects.headingAlign, DEFAULT_NOTES_MARKDOWN_LAYOUT.headingAlign),
    mediaBorder: valueAt(MEDIA_BORDERS, selects.imageBorder, DEFAULT_NOTES_MARKDOWN_LAYOUT.mediaBorder),
  };
}

export function markdownLayoutUiSelects(
  settings: NotesMarkdownLayout,
): UiSelects {
  return {
    blockFontSize: Math.max(0, BLOCK_FONT_SIZES.indexOf(settings.blockFontSize)),
    headingAlign: Math.max(0, HEADING_ALIGNS.indexOf(settings.headingAlign)),
    imageBorder: Math.max(0, MEDIA_BORDERS.indexOf(settings.mediaBorder)),
  };
}
