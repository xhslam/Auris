"use client";

import { useEffect, useState } from "react";

import {
  DEFAULT_NOTES_READING_THEME,
  NOTES_READING_THEME_EVENT,
  isNotesReadingThemeId,
  loadNotesReadingTheme,
  type NotesReadingThemeId,
} from "@/features/notes/workbench/notes-reading-theme";

/**
 * 订阅「设置 → 外观」选定的全局主题。
 *
 * 任何独立外壳（如首页 `.home-v3`）都可以用它拿到当前主题，挂到自己的根元素上
 * （`data-app-theme={theme}`），从而跟随设置页的换肤——无需被 DesktopAppFrame 包裹。
 *
 * 返回值在挂载后会同步为已持久化的偏好，并实时响应同窗口的主题切换事件
 * 与跨窗口的 storage 事件。
 */
export function useAppReadingTheme(): NotesReadingThemeId {
  const [theme, setTheme] = useState<NotesReadingThemeId>(
    DEFAULT_NOTES_READING_THEME,
  );

  useEffect(() => {
    setTheme(loadNotesReadingTheme());

    const onThemeEvent = (event: Event) => {
      const detail = (event as CustomEvent<NotesReadingThemeId>).detail;
      if (isNotesReadingThemeId(detail)) {
        setTheme(detail);
      }
    };
    const onStorage = () => setTheme(loadNotesReadingTheme());

    window.addEventListener(NOTES_READING_THEME_EVENT, onThemeEvent);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(NOTES_READING_THEME_EVENT, onThemeEvent);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return theme;
}
