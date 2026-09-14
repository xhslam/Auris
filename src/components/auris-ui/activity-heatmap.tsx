"use client";

import { useMemo } from "react";

type ActivityHeatmapProps = {
  /** Map of ISO date (YYYY-MM-DD) → activity count. */
  counts?: Record<string, number>;
  /** Number of weeks (columns) to render. Defaults to ~13 (≈3 months). */
  weeks?: number;
};

function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function levelFor(count: number): number {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  if (count <= 7) return 3;
  return 4;
}

/**
 * flomo-style dot activity calendar — more records → deeper Sunset shade.
 * 7 rows (weekdays) × N columns (weeks). The last cell is "today".
 */
export function ActivityHeatmap({ counts = {}, weeks = 13 }: ActivityHeatmapProps) {
  const { cells, monthLabels, todayKey } = useMemo(() => {
    const today = new Date();
    const todayIso = isoDate(today);
    const totalDays = weeks * 7;

    // Align so the last column ends on today's weekday row.
    const start = new Date(today);
    start.setDate(start.getDate() - (totalDays - 1));

    const built: { key: string; level: number }[] = [];
    const months = new Set<number>();
    const labels: string[] = [];

    for (let i = 0; i < totalDays; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = isoDate(d);
      built.push({ key, level: levelFor(counts[key] ?? 0) });

      if (!months.has(d.getMonth()) && d.getDate() <= 7) {
        months.add(d.getMonth());
        labels.push(`${d.getMonth() + 1}月`);
      }
    }

    return { cells: built, monthLabels: labels.slice(0, 3), todayKey: todayIso };
  }, [counts, weeks]);

  return (
    <div className="auris-heatmap">
      <div className="auris-heatmap__grid">
        {cells.map((cell) => (
          <span
            className="auris-heatmap__dot"
            data-level={cell.level}
            data-today={cell.key === todayKey ? "true" : undefined}
            key={cell.key}
            title={cell.key}
          />
        ))}
      </div>
      {monthLabels.length > 0 ? (
        <div className="auris-heatmap__months">
          {monthLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
