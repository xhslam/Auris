export const DESKTOP_ISLAND_TASKS_KEY = "auris.desktop-island.tasks.v1";
export const DESKTOP_ISLAND_TASKS_EVENT = "auris:desktop-island-tasks-changed";
const LEGACY_TASKS_KEY = "auris:home:v1";

export type DesktopIslandTask = {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DesktopIslandTaskState = { version: 1; tasks: DesktopIslandTask[] };
type TaskStorage = Pick<Storage, "getItem" | "setItem">;

export function createEmptyDesktopIslandTaskState(): DesktopIslandTaskState {
  return { version: 1, tasks: [] };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseTasks(value: unknown[]): DesktopIslandTask[] {
  return value.flatMap((item) => {
    if (!isObject(item)) return [];
    const { id, title, done, createdAt, updatedAt } = item;
    if (typeof id !== "string" || typeof title !== "string" || typeof done !== "boolean" ||
        typeof createdAt !== "string" || typeof updatedAt !== "string") return [];
    return [{ id, title, done, createdAt, updatedAt }];
  });
}

/** Copy legacy tasks only when the new key is absent; never change the source. */
export function readDesktopIslandTaskState(storage: TaskStorage | null): DesktopIslandTaskState {
  if (!storage) return createEmptyDesktopIslandTaskState();
  try {
    const raw = storage.getItem(DESKTOP_ISLAND_TASKS_KEY);
    if (raw !== null) {
      const current: unknown = JSON.parse(raw);
      if (isObject(current) && current.version === 1 && Array.isArray(current.tasks)) {
        return { version: 1, tasks: parseTasks(current.tasks) };
      }
      return createEmptyDesktopIslandTaskState();
    }
    const legacyRaw = storage.getItem(LEGACY_TASKS_KEY);
    if (legacyRaw === null) return createEmptyDesktopIslandTaskState();
    const legacy: unknown = JSON.parse(legacyRaw);
    if (!isObject(legacy) || !Array.isArray(legacy.plans)) return createEmptyDesktopIslandTaskState();
    const migrated: DesktopIslandTaskState = { version: 1, tasks: parseTasks(legacy.plans) };
    try {
      storage.setItem(DESKTOP_ISLAND_TASKS_KEY, JSON.stringify(migrated));
    } catch {
      // Keep legacy tasks readable when storage is full; retry on the next read.
    }
    return migrated;
  } catch {
    return createEmptyDesktopIslandTaskState();
  }
}

/** A failed write must throw so the native completion intent remains retryable. */
export function writeDesktopIslandTaskState(storage: TaskStorage, state: DesktopIslandTaskState): void {
  storage.setItem(DESKTOP_ISLAND_TASKS_KEY, JSON.stringify({ version: 1, tasks: parseTasks(state.tasks) }));
  if (typeof window !== "undefined") {
    queueMicrotask(() => window.dispatchEvent(new CustomEvent(DESKTOP_ISLAND_TASKS_EVENT)));
  }
}
