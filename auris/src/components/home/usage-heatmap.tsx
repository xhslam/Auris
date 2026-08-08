"use client";

import { ActivityIcon } from "@/components/auris-ui/auris-icons";
import {
  formatUsageDuration,
  type UsageHeatmapDay,
} from "@/features/app-activity/usage-tracker";

type UsageHeatmapProps = {
  days: UsageHeatmapDay[];
  todayMilliseconds: number;
};

export function UsageHeatmap({ days, todayMilliseconds }: UsageHeatmapProps) {
  return (
    <section className="home-v3-card home-v3-usage" aria-label="使用情况">
      <header className="home-v3-card__head">
        <div>
          <h2>
            <ActivityIcon size={16} />
            使用情况
          </h2>
        </div>
        <span className="home-v3-usage__today">
          今日 {formatUsageDuration(todayMilliseconds)}
        </span>
      </header>

      <div className="home-v3-usage__grid" role="list" aria-label="最近 84 天使用时长">
        {days.map((day) => (
          <span
            aria-label={`${day.date} · ${formatUsageDuration(day.totalMilliseconds)}`}
            className="home-v3-usage__cell"
            data-tone={day.tone}
            key={day.date}
            role="listitem"
            title={`${day.date} · ${formatUsageDuration(day.totalMilliseconds)}`}
          />
        ))}
      </div>

      <div className="home-v3-usage__legend" aria-hidden="true">
        <span>Less</span>
        {(["none", "low", "medium", "high", "peak"] as const).map((tone) => (
          <i data-tone={tone} key={tone} />
        ))}
        <span>More</span>
      </div>
    </section>
  );
}
