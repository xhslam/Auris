/**
 * 阅读进度与文章收藏的本地存储（localStorage）。
 * 浏览器安全：SSR / 无 window 时降级为空。本地优先，不引云同步。
 */

const PROGRESS_KEY = "auris-reading-progress";
const FAVORITES_KEY = "auris-reading-favorites";
const DELETED_SOURCES_KEY = "auris-reading-deleted-sources";
export const READING_PROGRESS_CHANGED_EVENT = "auris:reading-progress-changed";

type ProgressMap = Record<string, number>;

function dispatchProgressChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(READING_PROGRESS_CHANGED_EVENT));
  }
}

function safeStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    // 隐私模式等场景下 localStorage 不可用
    return null;
  }
}

export function loadReadingProgress(): ProgressMap {
  const storage = safeStorage();
  if (!storage) {
    return {};
  }
  try {
    const raw = storage.getItem(PROGRESS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === "object" ? (parsed as ProgressMap) : {};
  } catch {
    return {};
  }
}

/** 记录进度；只增不减（已读到的页不回退）。 */
export function saveReadingProgressFor(sourceId: string, progress: number): void {
  const storage = safeStorage();
  if (!storage || !sourceId) {
    return;
  }
  const current = loadReadingProgress();
  const clamped = Math.max(0, Math.min(100, Math.round(progress)));
  if ((current[sourceId] ?? 0) >= clamped) {
    return;
  }
  current[sourceId] = clamped;
  try {
    storage.setItem(PROGRESS_KEY, JSON.stringify(current));
    dispatchProgressChanged();
  } catch {
    // 写入失败静默忽略
  }
}

export function loadReadingFavorites(): Set<string> {
  const storage = safeStorage();
  if (!storage) {
    return new Set();
  }
  try {
    const raw = storage.getItem(FAVORITES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(parsed) ? (parsed as string[]) : []);
  } catch {
    return new Set();
  }
}

/** 切换收藏状态，返回更新后的集合。 */
export function toggleReadingFavorite(sourceId: string): Set<string> {
  const favorites = loadReadingFavorites();
  if (favorites.has(sourceId)) {
    favorites.delete(sourceId);
  } else {
    favorites.add(sourceId);
  }
  const storage = safeStorage();
  if (storage) {
    try {
      storage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(favorites)));
    } catch {
      // 写入失败静默忽略
    }
  }
  return favorites;
}

export function loadDeletedReadingSourceIds(): Set<string> {
  const storage = safeStorage();
  if (!storage) {
    return new Set();
  }
  try {
    const raw = storage.getItem(DELETED_SOURCES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(parsed) ? (parsed as string[]) : []);
  } catch {
    return new Set();
  }
}

export function markReadingSourceDeleted(sourceId: string): Set<string> {
  const deletedSourceIds = loadDeletedReadingSourceIds();
  if (!sourceId) {
    return deletedSourceIds;
  }
  deletedSourceIds.add(sourceId);

  const storage = safeStorage();
  if (storage) {
    try {
      storage.setItem(DELETED_SOURCES_KEY, JSON.stringify(Array.from(deletedSourceIds)));
    } catch {
      // 写入失败静默忽略
    }
  }

  return deletedSourceIds;
}
