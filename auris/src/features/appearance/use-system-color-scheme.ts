"use client";

import { useEffect, useState } from "react";

export type SystemColorScheme = "dark" | "light";

const darkColorSchemeQuery = "(prefers-color-scheme: dark)";

function readSystemColorScheme(): SystemColorScheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }
  return window.matchMedia(darkColorSchemeQuery).matches ? "dark" : "light";
}

/**
 * 读取并订阅操作系统的明暗外观偏好。
 *
 * 首次服务端和客户端渲染都稳定返回 light，挂载后立即同步系统状态；随后通过
 * MediaQueryList 的 change 事件响应用户在系统设置中切换外观。
 */
export function useSystemColorScheme(): SystemColorScheme {
  const [colorScheme, setColorScheme] = useState<SystemColorScheme>("light");

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia(darkColorSchemeQuery);
    const syncColorScheme = () => {
      setColorScheme(mediaQuery.matches ? "dark" : "light");
    };

    syncColorScheme();
    mediaQuery.addEventListener("change", syncColorScheme);
    return () => {
      mediaQuery.removeEventListener("change", syncColorScheme);
    };
  }, []);

  return colorScheme;
}

export { darkColorSchemeQuery, readSystemColorScheme };
