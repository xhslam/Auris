import type { LearningNoteFoldersState } from "@/features/home-learning/home-learning.types";

export const LEARNING_NOTE_FOLDERS_STORAGE_KEY = "auris.home.learning-note-folders.v1";
export const LEARNING_NOTE_FOLDERS_CHANGED_EVENT = "auris:learning-note-folders-changed";

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function normalizeLearningFolderPath(value: string): string | null {
  const path = value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!path || path.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    return null;
  }
  return path;
}

function normalizePaths(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const paths = value
    .filter((item): item is string => typeof item === "string")
    .map(normalizeLearningFolderPath)
    .filter((item): item is string => Boolean(item));
  return Array.from(new Set(paths));
}

export function parseLearningNoteFoldersState(value: unknown): LearningNoteFoldersState | null {
  if (!value || typeof value !== "object") return null;
  const state = value as Partial<LearningNoteFoldersState>;
  const relativePaths = normalizePaths(state.relativePaths);
  if (state.version !== 1 || relativePaths === null) return null;
  return { version: 1, relativePaths };
}

export function readLearningNoteFolders(
  storage: Storage | null = getStorage(),
): LearningNoteFoldersState | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(LEARNING_NOTE_FOLDERS_STORAGE_KEY);
    return raw ? parseLearningNoteFoldersState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function dispatchChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(LEARNING_NOTE_FOLDERS_CHANGED_EVENT));
  }
}

export function writeLearningNoteFolders(
  relativePaths: string[],
  storage: Storage | null = getStorage(),
): boolean {
  const normalized = normalizePaths(relativePaths);
  if (!storage || normalized === null) return false;
  try {
    storage.setItem(
      LEARNING_NOTE_FOLDERS_STORAGE_KEY,
      JSON.stringify({ version: 1, relativePaths: normalized } satisfies LearningNoteFoldersState),
    );
    dispatchChange();
    return true;
  } catch {
    return false;
  }
}
