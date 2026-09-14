import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createCloseAttemptTracker } = require("../../../electron/close-attempt-tracker.cjs");

describe("createCloseAttemptTracker", () => {
  it("writes correlated start, milestone and completion logs", () => {
    let now = 100;
    const log = vi.fn();
    const tracker = createCloseAttemptTracker({
      log,
      now: () => now,
      setTimeoutImpl: vi.fn(() => ({ unref: vi.fn() })),
    });

    const id = tracker.begin("before-quit");
    now = 125;
    expect(tracker.milestone(id, "browser-cleanup")) .toBe(true);
    now = 140;
    expect(tracker.complete(id)).toBe(true);

    expect(log).toHaveBeenNthCalledWith(1, "app:close:start", "id=1 reason=before-quit");
    expect(log).toHaveBeenNthCalledWith(2, "app:close:milestone", "id=1 browser-cleanup");
    expect(log).toHaveBeenNthCalledWith(3, "app:close:complete", "id=1 elapsedMs=40");
    expect(tracker.getCurrent()).toBeNull();
  });

  it("emits a stall log only for the still-current attempt", () => {
    const scheduler: { callback: (() => void) | null } = { callback: null };
    let now = 0;
    const log = vi.fn();
    const tracker = createCloseAttemptTracker({
      log,
      now: () => now,
      setTimeoutImpl: vi.fn((callback: () => void) => {
        scheduler.callback = callback;
        return { unref: vi.fn() };
      }),
      clearTimeoutImpl: vi.fn(),
      stallAfterMs: 100,
    });

    const id = tracker.begin();
    now = 101;
    scheduler.callback?.();
    expect(log).toHaveBeenLastCalledWith("app:close:stalled", "id=1 elapsedMs=101");
    tracker.complete(id);
    scheduler.callback?.();
    expect(log).toHaveBeenCalledTimes(3);
  });

  it("does not let stale completions overwrite the active attempt", () => {
    const tracker = createCloseAttemptTracker({
      setTimeoutImpl: vi.fn(() => ({ unref: vi.fn() })),
    });
    const first = tracker.begin();
    tracker.complete(first);
    const second = tracker.begin();

    expect(tracker.complete(first)).toBe(false);
    expect(tracker.getCurrent()).toMatchObject({ id: second });
  });
});
