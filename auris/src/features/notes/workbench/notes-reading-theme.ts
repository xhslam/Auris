/**
 * 笔记阅读主题：通过覆盖 `.notes-v2` 上的 `--notes-*` CSS 变量切换配色。
 *
 * - 主题在「设置 → 外观」里选择，本模块负责持久化与广播。
 * - 笔记工作台只读取并应用主题（监听变更事件实时刷新）。
 * - 实际配色定义在 globals.css 的 `[data-notes-theme="..."]` 选择器块里。
 * - 主题 id 与设置页的色块（SWATCHES）保持一致。
 */

export type NotesReadingThemeId =
  | "white"
  | "paper"
  | "mint"
  | "sepia"
  | "night"
  | "solarized";

export const NOTES_READING_THEME_IDS: readonly NotesReadingThemeId[] = [
  "white",
  "paper",
  "mint",
  "sepia",
  "night",
  "solarized",
];

/** 默认主题：等于当前基础（薄荷绿）外观，未设置偏好时沿用。 */
export const DEFAULT_NOTES_READING_THEME: NotesReadingThemeId = "mint";

const STORAGE_KEY = "auris.notes.reading-theme";

/** 同一文档内广播主题变更（storage 事件不会在触发它的文档里回放）。 */
export const NOTES_READING_THEME_EVENT = "auris:notes-reading-theme";

export function isNotesReadingThemeId(
  value: string | null | undefined,
): value is NotesReadingThemeId {
  if (!value) {
    return false;
  }
  return NOTES_READING_THEME_IDS.includes(value as NotesReadingThemeId);
}

export function loadNotesReadingTheme(): NotesReadingThemeId {
  if (typeof window === "undefined") {
    return DEFAULT_NOTES_READING_THEME;
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isNotesReadingThemeId(stored)) {
      return stored;
    }
  } catch {
    // 隐私模式或存储被禁用时静默回退。
  }
  return DEFAULT_NOTES_READING_THEME;
}

export function saveNotesReadingTheme(theme: NotesReadingThemeId): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // 写入失败时不阻塞交互。
  }
  // 通知同窗口内已挂载的笔记工作台立即应用新主题。
  window.dispatchEvent(
    new CustomEvent<NotesReadingThemeId>(NOTES_READING_THEME_EVENT, {
      detail: theme,
    }),
  );
}
