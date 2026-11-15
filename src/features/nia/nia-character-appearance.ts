"use client";

import { useEffect, useState } from "react";

export const NIA_CHARACTER_STYLES = [
  { id: "basic", name: "基础简洁版", detail: "极简方块，干净耐看" },
  { id: "outlined", name: "轮廓加强版", detail: "深棕描边，轮廓清晰" },
  { id: "happy", name: "开心表情版", detail: "闭眼微笑，暖橘脸颊" },
  { id: "focused", name: "学习专注版", detail: "戴上耳机，专注学习" },
  { id: "academic", name: "学术成长版", detail: "学士帽与金色流苏" },
  { id: "coding", name: "编程工作版", detail: "抱着电脑，创造与执行" },
  { id: "explorer", name: "探索旅行版", detail: "背上背包，出发探索" },
  { id: "sporty", name: "运动自律版", detail: "红色头带，自律与坚持" },
  { id: "calm", name: "治愈松弛版", detail: "小草点缀，安静休息" },
  { id: "sparkle", name: "综合优化版", detail: "简洁轮廓，一颗小星星" },
] as const;
export type NiaCharacterStyle = typeof NIA_CHARACTER_STYLES[number]["id"];
export const NIA_CHARACTER_STYLE_KEY = "auris.nia.character-style";
const CHANGE_EVENT = "auris:nia-character-style";

export function normalizeNiaCharacterStyle(value: unknown): NiaCharacterStyle {
  return NIA_CHARACTER_STYLES.find((style) => style.id === value)?.id ?? "basic";
}

function loadStyle(): NiaCharacterStyle {
  try { return normalizeNiaCharacterStyle(window.localStorage.getItem(NIA_CHARACTER_STYLE_KEY)); }
  catch { return "basic"; }
}

export function saveNiaCharacterStyle(value: NiaCharacterStyle): void {
  const style = normalizeNiaCharacterStyle(value);
  try { window.localStorage.setItem(NIA_CHARACTER_STYLE_KEY, style); }
  catch { /* Apply in this window even if persistence is unavailable. */ }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: style }));
}

/** Shared by settings previews, transcript avatars and the desktop companion. */
export function useNiaCharacterStyle(): NiaCharacterStyle {
  const [style, setStyle] = useState<NiaCharacterStyle>("basic");
  useEffect(() => {
    setStyle(loadStyle());
    const onStorage = (event: StorageEvent) => {
      if (event.key === NIA_CHARACTER_STYLE_KEY || event.key === null) setStyle(loadStyle());
    };
    const onChange = (event: Event) => setStyle(normalizeNiaCharacterStyle((event as CustomEvent<unknown>).detail));
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, onChange);
    };
  }, []);
  return style;
}
