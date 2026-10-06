"use client";

import { useEffect, useState } from "react";
import { getDashboardMetrics } from "./output-review-model";
import {
  OUTPUT_REVIEW_STORAGE_EVENT,
  OUTPUT_REVIEW_STORAGE_KEY,
  readOutputReviewStateResult,
  type OutputReviewReadResult,
} from "./output-review-storage";

type ReviewMetricsResult = {
  status: OutputReviewReadResult["status"] | "loading";
  metrics: ReturnType<typeof getDashboardMetrics> | null;
};

/** Live Review metrics, without loading reading sources, videos or notes. */
export function useOutputReviewMetrics(): ReviewMetricsResult {
  const [result, setResult] = useState<ReviewMetricsResult>({ status: "loading", metrics: null });

  useEffect(() => {
    let midnightTimer: number;
    const refresh = () => {
      try {
        const stored = readOutputReviewStateResult(window.localStorage);
        setResult({ status: stored.status, metrics: stored.state ? getDashboardMetrics(stored.state) : null });
      } catch {
        setResult({ status: "unavailable", metrics: null });
      }
    };
    const scheduleMidnightRefresh = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 250);
      midnightTimer = window.setTimeout(() => {
        refresh();
        scheduleMidnightRefresh();
      }, Math.max(500, midnight.getTime() - now.getTime()));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === OUTPUT_REVIEW_STORAGE_KEY) refresh();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };

    refresh();
    scheduleMidnightRefresh();
    window.addEventListener(OUTPUT_REVIEW_STORAGE_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(midnightTimer);
      window.removeEventListener(OUTPUT_REVIEW_STORAGE_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return result;
}
