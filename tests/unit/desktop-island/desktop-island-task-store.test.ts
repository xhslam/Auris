import {
  DESKTOP_ISLAND_TASKS_KEY, readDesktopIslandTaskState, writeDesktopIslandTaskState,
} from "@/features/desktop-island/desktop-island-task-store";

const task = { id: "task-1", title: "旧任务", done: false, createdAt: "2026-10-05T01:00:00Z", updatedAt: "2026-10-05T01:00:00Z" };
const legacyKey = "auris:home:v1";

describe("independent desktop island task storage", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("copies existing tasks once without changing legacy records or timestamps", () => {
    const legacy = JSON.stringify({ plans: [task], birthYear: 2005, lifeRecords: [{ text: "原记录" }], quote: { text: "原句子" } });
    localStorage.setItem(legacyKey, legacy);
    const migrated = readDesktopIslandTaskState(localStorage);
    expect(migrated).toEqual({ version: 1, tasks: [task] });
    expect(JSON.parse(localStorage.getItem(DESKTOP_ISLAND_TASKS_KEY)!)).toEqual(migrated);
    writeDesktopIslandTaskState(localStorage, { ...migrated, tasks: [{ ...task, done: true }] });
    expect(readDesktopIslandTaskState(localStorage).tasks[0].done).toBe(true);
    expect(localStorage.getItem(legacyKey)).toBe(legacy);
  });

  it("treats even an empty new store as authoritative instead of importing old tasks again", () => {
    localStorage.setItem(legacyKey, JSON.stringify({ plans: [task] }));
    localStorage.setItem(DESKTOP_ISLAND_TASKS_KEY, JSON.stringify({ version: 1, tasks: [] }));
    expect(readDesktopIslandTaskState(localStorage).tasks).toEqual([]);
  });

  it("keeps migrated tasks independent of later legacy changes", () => {
    localStorage.setItem(legacyKey, JSON.stringify({ plans: [task] }));
    readDesktopIslandTaskState(localStorage);
    localStorage.setItem(legacyKey, JSON.stringify({ plans: [] }));
    expect(readDesktopIslandTaskState(localStorage).tasks).toEqual([task]);
  });

  it.each(["{broken", JSON.stringify({ version: 2, tasks: [] })])("does not replace unreadable new data with old tasks: %s", (raw) => {
    localStorage.setItem(legacyKey, JSON.stringify({ plans: [task] }));
    localStorage.setItem(DESKTOP_ISLAND_TASKS_KEY, raw);
    expect(readDesktopIslandTaskState(localStorage).tasks).toEqual([]);
    expect(localStorage.getItem(DESKTOP_ISLAND_TASKS_KEY)).toBe(raw);
  });

  it.each(["{broken", "null", "[]", JSON.stringify({ plans: "invalid" })])("leaves invalid legacy data untouched: %s", (raw) => {
    localStorage.setItem(legacyKey, raw);
    expect(readDesktopIslandTaskState(localStorage).tasks).toEqual([]);
    expect(localStorage.getItem(legacyKey)).toBe(raw);
    expect(localStorage.getItem(DESKTOP_ISLAND_TASKS_KEY)).toBeNull();
  });

  it("keeps the old task validation boundary during migration", () => {
    localStorage.setItem(legacyKey, JSON.stringify({ plans: [null, { ...task, done: "true" }, task] }));
    expect(readDesktopIslandTaskState(localStorage).tasks).toEqual([task]);
  });

  it("retains readable legacy tasks after a failed copy and retries later", () => {
    localStorage.setItem(legacyKey, JSON.stringify({ plans: [task] }));
    const failing = { getItem: (key: string) => localStorage.getItem(key), setItem: vi.fn(() => { throw new Error("quota"); }) };
    expect(readDesktopIslandTaskState(failing).tasks).toEqual([task]);
    expect(localStorage.getItem(DESKTOP_ISLAND_TASKS_KEY)).toBeNull();
    expect(() => writeDesktopIslandTaskState(failing, { version: 1, tasks: [{ ...task, done: true }] })).toThrow("quota");
    expect(readDesktopIslandTaskState(localStorage).tasks).toEqual([task]);
    expect(localStorage.getItem(DESKTOP_ISLAND_TASKS_KEY)).not.toBeNull();
  });

  it("handles missing or inaccessible storage without writing an empty replacement", () => {
    const setItem = vi.fn();
    expect(readDesktopIslandTaskState(null).tasks).toEqual([]);
    expect(readDesktopIslandTaskState({ getItem: () => { throw new Error("denied"); }, setItem }).tasks).toEqual([]);
    expect(readDesktopIslandTaskState(localStorage).tasks).toEqual([]);
    expect(localStorage.getItem(DESKTOP_ISLAND_TASKS_KEY)).toBeNull();
    expect(setItem).not.toHaveBeenCalled();
  });
});
