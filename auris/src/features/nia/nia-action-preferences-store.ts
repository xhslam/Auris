/**
 * Nia 动作偏好（recents / favorites）的持久化。
 *
 * 对齐 vmark `stores/aiStore/genies.ts` 的持久化范围：**只存名字列表，不存定义
 * 本身**。定义每次启动都从主进程重新列出，这样磁盘上被改过或删掉的定义会自然
 * 生效；把定义快照存进 localStorage 会让用户删掉一个定义后它还在选择器里，
 * 点击时才失败。
 *
 * 与 vmark 的一处差异是**这里不需要跨窗口合并**。vmark 的 `genies.ts` 有一整套
 * `mergeMruList` / `createFieldChangeGatedStorage` 机制，注释写明了原因：多个
 * Tauri 窗口共享同一个 localStorage key，各自持有独立 store 实例，persist 在
 * *每次* set() 都序列化，于是一个窗口的无关写入会把另一个窗口刚写的偏好覆盖掉。
 * auris 主进程是 `mainWindow` 单例，同一时刻只有一个渲染进程在写这个 key，
 * 没有需要合并的第二个写者。移植那套合并逻辑只会得到永远只有一个输入的
 * merge 调用，以及一个无法被触发的 gated storage。
 *
 * 存储对象由调用方注入（沿用 `nia-history.ts` 的 `StorageLike` 约定），所以
 * 这些函数在 SSR 和测试里都能直接用。
 *
 * @module features/nia/nia-action-preferences-store
 */

import {
  EMPTY_NIA_ACTION_PREFERENCES,
  MAX_NIA_ACTION_RECENTS,
  type NiaActionPreferences,
} from "@/features/nia/nia-action-catalog";

export const NIA_ACTION_PREFERENCES_KEY = "auris.nia.actions.preferences.v1";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** 只保留字符串条目并去重；recents 额外截到上限。 */
function sanitizeNames(value: unknown, limit?: number): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const names: string[] = [];

  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    names.push(trimmed);
    if (limit !== undefined && names.length >= limit) break;
  }

  return names;
}

export function loadNiaActionPreferences(
  storage: StorageLike | null,
): NiaActionPreferences {
  if (!storage) return EMPTY_NIA_ACTION_PREFERENCES;

  const parsed = safeParse<{ favorites?: unknown; recents?: unknown }>(
    storage.getItem(NIA_ACTION_PREFERENCES_KEY),
    {},
  );

  return {
    favorites: sanitizeNames(parsed.favorites),
    recents: sanitizeNames(parsed.recents, MAX_NIA_ACTION_RECENTS),
  };
}

export function saveNiaActionPreferences(
  storage: StorageLike | null,
  preferences: NiaActionPreferences,
): void {
  if (!storage) return;

  storage.setItem(
    NIA_ACTION_PREFERENCES_KEY,
    JSON.stringify({
      favorites: preferences.favorites,
      recents: preferences.recents.slice(0, MAX_NIA_ACTION_RECENTS),
    }),
  );
}
