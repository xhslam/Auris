"use client";

import { useEffect, useState } from "react";
import {
  APP_THEME_EVENT,
  DEFAULT_APP_THEME,
  isAppThemeId,
  loadAppTheme,
  type AppThemeId,
} from "@/features/appearance/app-theme";

/**
 * 订阅设置页选择的全局应用主题。
 *
 * 统一处理初始默认值、同窗口自定义事件与跨窗口 storage 事件，防止各页面维护
 * 不同的主题同步实现。调用方只需将返回值挂到自己的 `data-app-theme` 或 Notes
 * 根节点即可消费同一套 CSS 语义令牌。
 */
export function useAppTheme(): AppThemeId {
  const [theme, setTheme] = useState<AppThemeId>(DEFAULT_APP_THEME);

  useEffect(() => {
    setTheme(loadAppTheme());

    const onThemeEvent = (event: Event) => {
      const detail = (event as CustomEvent<AppThemeId>).detail;
      if (isAppThemeId(detail)) {
        setTheme(detail);
      }
    };
    const onStorage = () => setTheme(loadAppTheme());

    window.addEventListener(APP_THEME_EVENT, onThemeEvent);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(APP_THEME_EVENT, onThemeEvent);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Portaled menus/dialogs outside the desktop shell share the same palette.
  useEffect(() => {
    document.documentElement.dataset.appTheme = theme;
  }, [theme]);

  return theme;
}
