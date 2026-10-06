export type ReadingResumePosition =
  | { kind: "paragraph"; paragraphId: string }
  | { kind: "pdf"; page: number }
  | { kind: "unknown" };

export type ReadingResumeState = {
  version: 1;
  sourceId: string;
  lastOpenedAt: string;
  position: ReadingResumePosition;
};

export const READING_RESUME_STORAGE_KEY = "auris.reading.resume.v1";
export const READING_RESUME_CHANGED_EVENT = "auris:reading-resume-changed";

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function isReadingResumePosition(value: unknown): value is ReadingResumePosition {
  if (!value || typeof value !== "object") return false;
  const position = value as Partial<ReadingResumePosition>;
  if (position.kind === "unknown") return true;
  if (position.kind === "paragraph") {
    return typeof position.paragraphId === "string" && Boolean(position.paragraphId.trim());
  }
  return position.kind === "pdf" && typeof position.page === "number" &&
    Number.isInteger(position.page) && position.page > 0;
}

export function parseReadingResumeState(value: unknown): ReadingResumeState | null {
  if (!value || typeof value !== "object") return null;
  const state = value as Partial<ReadingResumeState>;
  if (
    state.version !== 1 ||
    typeof state.sourceId !== "string" ||
    !state.sourceId.trim() ||
    !isValidTimestamp(state.lastOpenedAt) ||
    !isReadingResumePosition(state.position)
  ) {
    return null;
  }
  return {
    version: 1,
    sourceId: state.sourceId,
    lastOpenedAt: state.lastOpenedAt,
    position: state.position,
  };
}

export function readReadingResume(storage: Storage | null = getStorage()): ReadingResumeState | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(READING_RESUME_STORAGE_KEY);
    if (!raw) return null;
    return parseReadingResumeState(JSON.parse(raw));
  } catch {
    return null;
  }
}

function dispatchChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(READING_RESUME_CHANGED_EVENT));
  }
}

export function writeReadingResume(
  state: ReadingResumeState,
  storage: Storage | null = getStorage(),
): boolean {
  const valid = parseReadingResumeState(state);
  if (!storage || !valid) return false;
  try {
    storage.setItem(READING_RESUME_STORAGE_KEY, JSON.stringify(valid));
    dispatchChange();
    return true;
  } catch {
    return false;
  }
}

export function rememberReadingResume(
  sourceId: string,
  position: ReadingResumePosition = { kind: "unknown" },
  now = new Date(),
): boolean {
  return writeReadingResume({
    version: 1,
    sourceId,
    lastOpenedAt: now.toISOString(),
    position,
  });
}

export function clearReadingResume(storage: Storage | null = getStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(READING_RESUME_STORAGE_KEY);
    dispatchChange();
  } catch {
    // 本地恢复信息不可用时不影响阅读器本身。
  }
}
