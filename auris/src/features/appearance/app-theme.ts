/**
 * 应用主题的单一权威契约。
 *
 * 主题由「设置 → 外观」选择，并同步到桌面外壳、首页、Notes、阅读、复习、浏览器
 * 与独立窗口。页面只读取这里的状态；配色则由各自根节点下的语义 CSS 令牌实现。
 */

export type AppThemeId =
  | "white"
  | "paper"
  | "mint"
  | "sepia"
  | "night"
  | "solarized";

export const APP_THEME_IDS: readonly AppThemeId[] = [
  "white",
  "paper",
  "mint",
  "sepia",
  "night",
  "solarized",
];

export const DEFAULT_APP_THEME: AppThemeId = "mint";
export const APP_THEME_STORAGE_KEY = "auris.notes.reading-theme";
export const APP_THEME_EVENT = "auris:app-theme";

export function isAppThemeId(value: string | null | undefined): value is AppThemeId {
  return Boolean(value && APP_THEME_IDS.includes(value as AppThemeId));
}

export function loadAppTheme(): AppThemeId {
  if (typeof window === "undefined") {
    return DEFAULT_APP_THEME;
  }

  try {
    const stored = window.localStorage.getItem(APP_THEME_STORAGE_KEY);
    if (isAppThemeId(stored)) {
      return stored;
    }
  } catch {
    // 存储不可用时使用稳定默认值，主题不应阻断页面渲染。
  }

  return DEFAULT_APP_THEME;
}

export function saveAppTheme(theme: AppThemeId): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(APP_THEME_STORAGE_KEY, theme);
  } catch {
    // 即使无法持久化，也继续向当前窗口广播即时主题变化。
  }

  window.dispatchEvent(
    new CustomEvent<AppThemeId>(APP_THEME_EVENT, {
      detail: theme,
    }),
  );
}
