"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildUsageHeatmap,
  type DailyUsageTotals,
  type UsageHeatmapDay,
  readUsageTotals,
  recordActiveElapsed,
  writeUsageTotals,
} from "@/features/app-activity/usage-tracker";

const DEFAULT_FLUSH_INTERVAL_MILLISECONDS = 15_000;

type UseAppUsageTrackerOptions = {
  flushIntervalMilliseconds?: number;
  storage?: Storage | null;
};

type AppUsageTracker = {
  heatmap: UsageHeatmapDay[];
  todayMilliseconds: number;
  totals: DailyUsageTotals;
};

function localDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function resolveStorage(storage: Storage | null | undefined) {
  if (storage !== undefined) {
    return storage;
  }

  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export function useAppUsageTracker({
  flushIntervalMilliseconds = DEFAULT_FLUSH_INTERVAL_MILLISECONDS,
  storage: storageOption,
}: UseAppUsageTrackerOptions = {}): AppUsageTracker {
  const storage = resolveStorage(storageOption);
  const [totals, setTotals] = useState<DailyUsageTotals>({});
  const totalsRef = useRef(totals);
  const activeStartedAtRef = useRef<Date | null>(null);

  useEffect(() => {
    totalsRef.current = totals;
  }, [totals]);

  useEffect(() => {
    if (!storage) {
      return;
    }

    const nextTotals = readUsageTotals(storage);
    totalsRef.current = nextTotals;
    setTotals(nextTotals);
  }, [storage]);

  const isActiveWindow = useCallback(
    () =>
      typeof document !== "undefined" &&
      document.visibilityState === "visible" &&
      document.hasFocus(),
    [],
  );

  const flush = useCallback(() => {
    if (!storage || !activeStartedAtRef.current) {
      return;
    }

    const now = new Date();
    const nextTotals = recordActiveElapsed({
      now,
      startedAt: activeStartedAtRef.current,
      totals: totalsRef.current,
    });

    activeStartedAtRef.current = now;

    if (nextTotals === totalsRef.current) {
      return;
    }

    totalsRef.current = nextTotals;
    setTotals(nextTotals);

    try {
      writeUsageTotals(storage, nextTotals);
    } catch {
      // Usage insight is best-effort and must not block the desktop shell.
    }
  }, [storage]);

  const begin = useCallback(() => {
    if (!storage || activeStartedAtRef.current || !isActiveWindow()) {
      return;
    }

    activeStartedAtRef.current = new Date();
  }, [isActiveWindow, storage]);

  const pause = useCallback(() => {
    flush();
    activeStartedAtRef.current = null;
  }, [flush]);

  useEffect(() => {
    if (!storage || typeof window === "undefined") {
      return;
    }

    const handleVisibilityChange = () => {
      if (isActiveWindow()) {
        begin();
        return;
      }

      pause();
    };

    begin();
    window.addEventListener("blur", pause);
    window.addEventListener("focus", begin);
    window.addEventListener("pagehide", pause);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const intervalId = window.setInterval(flush, flushIntervalMilliseconds);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("blur", pause);
      window.removeEventListener("focus", begin);
      window.removeEventListener("pagehide", pause);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      pause();
    };
  }, [begin, flush, flushIntervalMilliseconds, isActiveWindow, pause, storage]);

  return useMemo(
    () => {
      const now = new Date();

      return {
        heatmap: buildUsageHeatmap({ now, totals }),
        todayMilliseconds: totals[localDateKey(now)] ?? 0,
        totals,
      };
    },
    [totals],
  );
}
