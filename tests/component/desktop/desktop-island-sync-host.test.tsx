import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopIslandSyncHost } from "@/components/desktop/desktop-island-sync-host";
import { DESKTOP_ISLAND_TASKS_KEY, createEmptyDesktopIslandTaskState } from "@/features/desktop-island/desktop-island-task-store";
import type { DesktopIslandContentSnapshot, DesktopIslandRendererIntent, DesktopIslandSettings, DesktopIslandSyncResult } from "@/features/desktop-island/desktop-island.types";

const island = {
  acknowledgeIntent: vi.fn<(actionId: string) => Promise<void>>(async () => undefined),
  getSettings: vi.fn(async () => ({ enabled: true, expandOnHover: true, placement: "top" as const, privacyMode: false })),
  listPendingIntents: vi.fn(async () => [] as DesktopIslandRendererIntent[]),
  listener: null as ((intent: DesktopIslandRendererIntent) => void) | null,
  onIntent: vi.fn((listener: (intent: DesktopIslandRendererIntent) => void) => {
    island.listener = listener;
    return () => { island.listener = null; };
  }),
  syncSnapshot: vi.fn<(snapshot: DesktopIslandContentSnapshot) => Promise<DesktopIslandSyncResult>>(async () => ({ accepted: true, revision: 1 })),
  updateSettings: vi.fn<(patch: Partial<DesktopIslandSettings>) => Promise<DesktopIslandSettings>>(async () => ({ enabled: true, expandOnHover: true, placement: "top", privacyMode: false })),
};

vi.mock("@/platform/desktop/use-hydrated-desktop-bridge", () => ({
  useHydratedDesktopBridge: () => ({
    desktopBridge: { desktopIsland: island },
    hasHydratedDesktopBridge: true,
  }),
}));

describe("DesktopIslandSyncHost", () => {
  beforeEach(() => {
    localStorage.clear();
    island.acknowledgeIntent.mockClear();
    island.listPendingIntents.mockClear();
    island.onIntent.mockClear();
    island.syncSnapshot.mockClear();
    island.listener = null;
  });

  it("syncs local task state and applies a replay-safe completion intent", async () => {
    const tasks = createEmptyDesktopIslandTaskState();
    tasks.tasks = [{
      createdAt: "2026-08-26T02:00:00.000Z",
      done: false,
      id: "task-1",
      title: "整理阅读笔记",
      updatedAt: "2026-08-26T02:00:00.000Z",
    }];
    const legacy = JSON.stringify({ plans: tasks.tasks, quote: { text: "原每日一句" } });
    localStorage.setItem("auris:home:v1", legacy);

    render(<DesktopIslandSyncHost />);
    await waitFor(() => expect(island.syncSnapshot).toHaveBeenCalled());
    const firstCall = island.syncSnapshot.mock.calls[0];
    expect(firstCall).toBeDefined();
    expect(firstCall?.[0].tasks.items[0]).toMatchObject({
      done: false, id: "task-1", title: "整理阅读笔记",
    });

    await act(async () => {
      island.listener?.({
        actionId: "intent-1",
        done: true,
        name: "set-task-done",
        taskId: "task-1",
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(island.acknowledgeIntent).toHaveBeenCalledWith("intent-1"));
    const persisted = JSON.parse(localStorage.getItem(DESKTOP_ISLAND_TASKS_KEY) || "null");
    expect(persisted.tasks[0].done).toBe(true);
    expect(localStorage.getItem("auris:home:v1")).toBe(legacy);
    await act(async () => {
      island.listener?.({ actionId: "intent-1", done: true, name: "set-task-done", taskId: "task-1" });
    });
    expect(island.acknowledgeIntent).toHaveBeenCalledTimes(1);
  });

  it("keeps a failed task write unacknowledged and allows retrying the same intent", async () => {
    localStorage.setItem(DESKTOP_ISLAND_TASKS_KEY, JSON.stringify({ version: 1, tasks: [{
      id: "task-1", title: "任务", done: false, createdAt: "2026-10-06", updatedAt: "2026-10-06",
    }] }));
    render(<DesktopIslandSyncHost />);
    await waitFor(() => expect(island.syncSnapshot).toHaveBeenCalled());
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    const intent = { actionId: "retry-1", done: true, name: "set-task-done", taskId: "task-1" } as const;
    try {
      await act(async () => { island.listener?.(intent); });
      expect(island.acknowledgeIntent).not.toHaveBeenCalled();
      expect(JSON.parse(localStorage.getItem(DESKTOP_ISLAND_TASKS_KEY)!).tasks[0].done).toBe(false);
    } finally {
      write.mockRestore();
    }
    await act(async () => { island.listener?.(intent); });
    await waitFor(() => expect(island.acknowledgeIntent).toHaveBeenCalledWith("retry-1"));
    expect(JSON.parse(localStorage.getItem(DESKTOP_ISLAND_TASKS_KEY)!).tasks[0].done).toBe(true);
  });
});
