"use client";

import { useCallback, useEffect, useRef } from "react";
import { buildDesktopIslandContentSnapshot } from "@/features/desktop-island/desktop-island-projection";
import type { DesktopIslandRendererIntent } from "@/features/desktop-island/desktop-island.types";
import {
  HOME_STORAGE_EVENT,
  HOME_STORAGE_KEY,
  readHomeData,
  writeHomeData,
} from "@/features/home/home-store";
import { EMPTY_OUTPUT_REVIEW_STATE } from "@/features/output-review/output-review-model";
import {
  OUTPUT_REVIEW_STORAGE_EVENT,
  OUTPUT_REVIEW_STORAGE_KEY,
  readOutputReviewStateResult,
} from "@/features/output-review/output-review-storage";
import { useHydratedDesktopBridge } from "@/platform/desktop/use-hydrated-desktop-bridge";

const MINUTE = 60_000;

function millisecondsUntilNextLocalDay(now = new Date()) {
  const tomorrow = new Date(now);
  tomorrow.setHours(24, 0, 1, 0);
  return Math.max(MINUTE, tomorrow.getTime() - now.getTime());
}

export function DesktopIslandSyncHost() {
  const { desktopBridge, hasHydratedDesktopBridge } = useHydratedDesktopBridge();
  const handledIntentIds = useRef(new Set<string>());
  const intentChain = useRef(Promise.resolve());

  const syncSnapshot = useCallback(async () => {
    const island = desktopBridge?.desktopIsland;
    if (!island) return;
    const reviewResult = readOutputReviewStateResult(window.localStorage);
    const reviewState = reviewResult.state ?? EMPTY_OUTPUT_REVIEW_STATE;
    const snapshot = buildDesktopIslandContentSnapshot(
      readHomeData(window.localStorage),
      reviewState,
    );
    await island.syncSnapshot(snapshot);
  }, [desktopBridge]);

  const processIntent = useCallback(async (intent: DesktopIslandRendererIntent) => {
    const island = desktopBridge?.desktopIsland;
    if (!island || handledIntentIds.current.has(intent.actionId)) return;
    handledIntentIds.current.add(intent.actionId);

    try {
      if (intent.name === "set-task-done") {
        const current = readHomeData(window.localStorage);
        const task = current.plans.find((item) => item.id === intent.taskId);
        if (task && task.done !== intent.done) {
          writeHomeData(window.localStorage, {
            ...current,
            plans: current.plans.map((item) => item.id === intent.taskId
              ? { ...item, done: intent.done, updatedAt: new Date().toISOString() }
              : item),
          });
        }
      }
      await island.acknowledgeIntent(intent.actionId);
      await syncSnapshot();
    } catch {
      handledIntentIds.current.delete(intent.actionId);
    }
  }, [desktopBridge, syncSnapshot]);

  useEffect(() => {
    if (!hasHydratedDesktopBridge || !desktopBridge?.desktopIsland) return;
    const island = desktopBridge.desktopIsland;
    const enqueueIntent = (intent: DesktopIslandRendererIntent) => {
      intentChain.current = intentChain.current
        .then(() => processIntent(intent))
        .catch(() => undefined);
    };
    const unsubscribe = island.onIntent(enqueueIntent);
    void syncSnapshot()
      .then(() => island.listPendingIntents())
      .then((intents) => intents.forEach(enqueueIntent))
      .catch(() => undefined);

    const refresh = () => void syncSnapshot().catch(() => undefined);
    const onStorage = (event: StorageEvent) => {
      if (event.key === HOME_STORAGE_KEY || event.key === OUTPUT_REVIEW_STORAGE_KEY) refresh();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener(HOME_STORAGE_EVENT, refresh);
    window.addEventListener(OUTPUT_REVIEW_STORAGE_EVENT, refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);

    let midnightTimer = window.setTimeout(function scheduleNextDay() {
      refresh();
      midnightTimer = window.setTimeout(scheduleNextDay, millisecondsUntilNextLocalDay());
    }, millisecondsUntilNextLocalDay());

    return () => {
      unsubscribe();
      window.clearTimeout(midnightTimer);
      window.removeEventListener(HOME_STORAGE_EVENT, refresh);
      window.removeEventListener(OUTPUT_REVIEW_STORAGE_EVENT, refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [desktopBridge, hasHydratedDesktopBridge, processIntent, syncSnapshot]);

  return null;
}
