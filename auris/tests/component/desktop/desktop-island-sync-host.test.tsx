import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopIslandSyncHost } from "@/components/desktop/desktop-island-sync-host";
import { HOME_STORAGE_KEY, createDefaultHomeData } from "@/features/home/home-store";
import type { DesktopIslandRendererIntent } from "@/features/desktop-island/desktop-island.types";

const island = {
  acknowledgeIntent: vi.fn(async () => undefined),
  getSettings: vi.fn(async () => ({ enabled: true, expandOnHover: true, privacyMode: false })),
  listPendingIntents: vi.fn(async () => [] as DesktopIslandRendererIntent[]),
  listener: null as ((intent: DesktopIslandRendererIntent) => void) | null,
  onIntent: vi.fn((listener: (intent: DesktopIslandRendererIntent) => void) => {
    island.listener = listener;
    return () => { island.listener = null; };
  }),
  syncSnapshot: vi.fn(async () => ({ accepted: true, revision: 1 })),
  updateSettings: vi.fn(async () => ({ enabled: true, expandOnHover: true, privacyMode: false })),
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
    const home = createDefaultHomeData(new Date("2026-08-26T10:00:00+08:00"));
    home.plans = [{
      createdAt: "2026-08-26T02:00:00.000Z",
      done: false,
      id: "task-1",
      title: "整理阅读笔记",
      updatedAt: "2026-08-26T02:00:00.000Z",
    }];
    localStorage.setItem(HOME_STORAGE_KEY, JSON.stringify(home));

    render(<DesktopIslandSyncHost />);
    await waitFor(() => expect(island.syncSnapshot).toHaveBeenCalled());
    expect(island.syncSnapshot.mock.calls[0][0].tasks.items[0]).toMatchObject({
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
    const persisted = JSON.parse(localStorage.getItem(HOME_STORAGE_KEY) || "null");
    expect(persisted.plans[0].done).toBe(true);
  });
});
