import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createReminderScheduler, inQuietHours, normalizeTimes } = require("../../../../../electron/nia/companion/reminder-scheduler.cjs");

describe("Nia reminder scheduler", () => {
  it("normalizes clock slots and handles overnight quiet hours", () => {
    expect(normalizeTimes(["20:00", "09:00", "20:00", "bad"])).toEqual([540, 1200]);
    expect(inQuietHours(new Date("2026-09-03T23:30:00"), "23:00", "07:30")).toBe(true);
    expect(inQuietHours(new Date("2026-09-03T08:00:00"), "23:00", "07:30")).toBe(false);
  });

  it("fires a pending reminder once and catches up once after reopening", () => {
    let current = new Date("2026-09-03T14:04:00");
    const fired: unknown[] = [];
    let state = {};
    const scheduler = createReminderScheduler({
      times: ["09:00", "14:00"],
      now: () => current,
      getPending: () => ({ count: 2, items: [{ title: "间隔复习" }] }),
      onReminder: (value: unknown) => fired.push(value),
      saveState: (value: Record<string, unknown>) => { state = value; },
      state,
    });
    expect(scheduler.catchUp()).toBe(true);
    expect(scheduler.catchUp()).toBe(false);
    expect(fired).toHaveLength(1);
    expect(state).toEqual({ lastFired: { "2026-09-03": 840 } });
    current = new Date("2026-09-03T23:30:00");
    expect(scheduler.fire(840, "scheduled")).toBe(false);
  });

  it("does not speak during DND or when no content is due", () => {
    let fired = 0;
    const quiet = createReminderScheduler({ now: () => new Date("2026-09-03T23:30:00"), getPending: () => ({ count: 3, items: [] }), onReminder: () => { fired += 1; } });
    expect(quiet.fire(1380, "scheduled")).toBe(false);
    const empty = createReminderScheduler({ now: () => new Date("2026-09-03T14:00:00"), getPending: () => ({ count: 0, items: [] }), onReminder: () => { fired += 1; } });
    expect(empty.fire(840, "scheduled")).toBe(false);
    expect(fired).toBe(0);
  });
});

