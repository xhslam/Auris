import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
type IslandService = {
  acknowledgeIntent: (actionId: string) => void;
  handleNativeEvent: (event: Record<string, unknown>) => void;
  listPendingIntents: () => Array<{ actionId: string }>;
  getSettings: () => Record<string, unknown>;
  start: () => void;
  syncSnapshot: (snapshotPayload: ReturnType<typeof snapshot>) => { revision: number };
};
const { DesktopIslandService } = require(
  "../../../electron/desktop-island/desktop-island-service.cjs",
) as { DesktopIslandService: new (options: Record<string, unknown>) => IslandService };

function snapshot() {
  return {
    dateKey: "2026-08-26",
    generatedAt: "2026-08-26T02:00:00.000Z",
    review: {
      actionableCount: 1, completedToday: 0, dueTodayCount: 1,
      items: [{
        estimatedMinutes: 20, knowledgePointId: "review-1", overdueDays: 0,
        plannedDate: "2026-08-26", projectName: "英语", stageLabel: "Day 2",
        title: "阅读回顾", urgency: "today",
      }],
      overdueCount: 0, progressPercent: 0,
    },
    tasks: {
      completed: 0,
      items: [{ done: false, id: "task-1", title: "整理笔记" }],
      progressPercent: 0, remaining: 1, total: 1,
    },
    version: 1,
  };
}

function setup() {
  const nativeHost = { dispose: vi.fn(), send: vi.fn(), start: vi.fn(), onEvent: vi.fn() };
  const onIntent = vi.fn();
  const onSettingsChange = vi.fn();
  const service = new DesktopIslandService({
    cachePath: null,
    nativeHost,
    onIntent,
    onOpenHome: vi.fn(),
    onOpenReview: vi.fn(),
    onSettingsChange,
    settings: { enabled: true, expandOnHover: true, placement: "top", privacyMode: false },
  });
  service.start();
  service.syncSnapshot(snapshot());
  return { nativeHost, onIntent, onSettingsChange, service };
}

describe("DesktopIslandService", () => {
  it("publishes compact content and deduplicates timestamp-only refreshes", () => {
    const { nativeHost, service } = setup();
    const revision = service.syncSnapshot({
      ...snapshot(), generatedAt: "2026-08-26T03:00:00.000Z",
    }).revision;
    expect(revision).toBe(1);
    expect(nativeHost.send).toHaveBeenLastCalledWith(expect.objectContaining({ presentation: "compact", revision: 1 }));
  });

  it("queues an idempotent set-task-done intent and validates the task id", () => {
    const { onIntent, service } = setup();
    service.handleNativeEvent({ action: "set-task-done", taskId: "missing", done: true });
    expect(onIntent).not.toHaveBeenCalled();
    service.handleNativeEvent({ action: "set-task-done", taskId: "task-1", done: true });
    expect(onIntent).toHaveBeenCalledWith(expect.objectContaining({
      done: true, name: "set-task-done", taskId: "task-1",
    }));
    expect(service.listPendingIntents()).toHaveLength(1);
    service.acknowledgeIntent(service.listPendingIntents()[0].actionId);
    expect(service.listPendingIntents()).toEqual([]);
  });

  it("dismisses only the current semantic snapshot", () => {
    const { nativeHost, service } = setup();
    service.handleNativeEvent({ action: "dismiss" });
    expect(nativeHost.send).toHaveBeenLastCalledWith(expect.objectContaining({ presentation: "hidden" }));
    const changed = snapshot();
    changed.tasks.total = 2;
    changed.tasks.remaining = 2;
    service.syncSnapshot(changed);
    expect(nativeHost.send).toHaveBeenLastCalledWith(expect.objectContaining({ presentation: "compact" }));
  });

  it("persists and republishes a placement selected by native dragging", () => {
    const { nativeHost, onSettingsChange, service } = setup();
    service.handleNativeEvent({ action: "set-placement", value: "left" });
    expect(service.getSettings()).toMatchObject({ placement: "left" });
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ placement: "left" }));
    expect(nativeHost.send).toHaveBeenLastCalledWith(expect.objectContaining({
      settings: expect.objectContaining({ placement: "left" }),
    }));

    service.handleNativeEvent({ action: "set-placement", value: "center" });
    expect(service.getSettings()).toMatchObject({ placement: "left" });
  });
});
