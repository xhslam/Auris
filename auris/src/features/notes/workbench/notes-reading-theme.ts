/**
 * @deprecated 兼容模块。
 *
 * 主题已提升为全应用契约，设置、首页、Notes 与独立窗口共享同一个持久化值和事件。
 * 保留历史导出，避免既有 Notes 调用方出现第二套主题状态；新增代码应从
 * `features/appearance/app-theme` 导入。
 */

import {
  APP_THEME_EVENT,
  APP_THEME_IDS,
  DEFAULT_APP_THEME,
  isAppThemeId,
  loadAppTheme,
  saveAppTheme,
  type AppThemeId,
} from "@/features/appearance/app-theme";

export type NotesReadingThemeId = AppThemeId;
export const NOTES_READING_THEME_IDS = APP_THEME_IDS;
export const DEFAULT_NOTES_READING_THEME = DEFAULT_APP_THEME;
export const NOTES_READING_THEME_EVENT = APP_THEME_EVENT;
export const isNotesReadingThemeId = isAppThemeId;
export const loadNotesReadingTheme = loadAppTheme;
export const saveNotesReadingTheme = saveAppTheme;
