export const APP_USAGE_STORAGE_KEY = "auris:app-usage:v1";
export const MAX_ACTIVE_SEGMENT_MILLISECONDS = 60_000;

export type DailyUsageTotals = Record<string, number>;
export type UsageTone = "none" | "low" | "medium" | "high" | "peak";

export type UsageHeatmapDay = {
  date: string;
  tone: UsageTone;
  totalMilliseconds: number;
};

type RecordActiveElapsedInput = {
  maximumSegmentMilliseconds?: number;
  now: Date;
  startedAt: Date;
  totals: DailyUsageTotals;
};

type BuildUsageHeatmapInput = {
  now: Date;
  totals: DailyUsageTotals;
  weeks?: number;
};

function toLocalDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function startOfNextLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + 1);
}

function isValidTotal(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function normalizeTotals(value: unknown): DailyUsageTotals {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      ([date, total]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && isValidTotal(total),
    ),
  );
}

export function readUsageTotals(storage: Pick<Storage, "getItem">): DailyUsageTotals {
  try {
    const rawValue = storage.getItem(APP_USAGE_STORAGE_KEY);

    return rawValue ? normalizeTotals(JSON.parse(rawValue)) : {};
  } catch {
    return {};
  }
}

export function writeUsageTotals(storage: Pick<Storage, "setItem">, totals: DailyUsageTotals) {
  storage.setItem(APP_USAGE_STORAGE_KEY, JSON.stringify(normalizeTotals(totals)));
}

export function recordActiveElapsed({
  maximumSegmentMilliseconds = MAX_ACTIVE_SEGMENT_MILLISECONDS,
  now,
  startedAt,
  totals,
}: RecordActiveElapsedInput): DailyUsageTotals {
  const startMilliseconds = startedAt.getTime();
  const endMilliseconds = now.getTime();
  const elapsedMilliseconds = endMilliseconds - startMilliseconds;

  if (
    !Number.isFinite(startMilliseconds) ||
    !Number.isFinite(endMilliseconds) ||
    elapsedMilliseconds <= 0 ||
    elapsedMilliseconds > maximumSegmentMilliseconds
  ) {
    return { ...totals };
  }

  const nextTotals = { ...totals };
  let cursor = new Date(startMilliseconds);

  while (cursor.getTime() < endMilliseconds) {
    const nextDay = startOfNextLocalDay(cursor);
    const segmentEndMilliseconds = Math.min(nextDay.getTime(), endMilliseconds);
    const segmentMilliseconds = segmentEndMilliseconds - cursor.getTime();
    const dateKey = toLocalDateKey(cursor);

    nextTotals[dateKey] = (nextTotals[dateKey] ?? 0) + segmentMilliseconds;
    cursor = new Date(segmentEndMilliseconds);
  }

  return nextTotals;
}

export function usageToneForMilliseconds(totalMilliseconds: number): UsageTone {
  if (!Number.isFinite(totalMilliseconds) || totalMilliseconds <= 0) {
    return "none";
  }

  const totalMinutes = totalMilliseconds / 60_000;

  if (totalMinutes <= 15) {
    return "low";
  }

  if (totalMinutes <= 45) {
    return "medium";
  }

  if (totalMinutes <= 90) {
    return "high";
  }

  return "peak";
}

export function buildUsageHeatmap({
  now,
  totals,
  weeks = 12,
}: BuildUsageHeatmapInput): UsageHeatmapDay[] {
  const numberOfDays = weeks * 7;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return Array.from({ length: numberOfDays }, (_, index) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (numberOfDays - 1 - index));
    const date = toLocalDateKey(day);
    const totalMilliseconds = totals[date] ?? 0;

    return {
      date,
      tone: usageToneForMilliseconds(totalMilliseconds),
      totalMilliseconds,
    };
  });
}

export function formatUsageDuration(totalMilliseconds: number) {
  const totalMinutes = Math.max(0, Math.floor(totalMilliseconds / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} 分钟`;
  }

  return `${hours} 小时${minutes > 0 ? ` ${minutes} 分钟` : ""}`;
}
