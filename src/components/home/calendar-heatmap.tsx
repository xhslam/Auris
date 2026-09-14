"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDaysIcon } from "@/components/auris-ui/auris-icons";
import { toLocalDateKey } from "@/features/home/home-store";
import type { NotePageSummary } from "@/features/notes/note-types";
import { getNotesStorage } from "@/platform/notes/get-notes-storage";

type CalendarTone = "blank" | "none" | "low" | "medium" | "high" | "peak";

type CalendarCell = {
  key: string;
  label: string;
  count: number;
  tone: CalendarTone;
  isToday: boolean;
  title?: string;
};

const FLASH_STORAGE_KEY = "auris-flash-items";

/** 棕色深浅分级：0 条 → none，越多越深。 */
function toneFor(count: number): CalendarTone {
  if (count <= 0) return "none";
  if (count === 1) return "low";
  if (count <= 3) return "medium";
  if (count <= 5) return "high";
  return "peak";
}

/** 读取闪念创建日期（localStorage）。 */
function loadFlashDates(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(FLASH_STORAGE_KEY);
    if (!raw) return [];

    const items = JSON.parse(raw) as Array<{ createdAt?: string }>;
    return items
      .map((item) => item.createdAt)
      .filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

export function CalendarHeatmap() {
  const now = useMemo(() => new Date(), []);
  const [noteDates, setNoteDates] = useState<string[]>([]);
  const [flashDates, setFlashDates] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setFlashDates(loadFlashDates());

      const storage = getNotesStorage();
      if (!storage) return;

      try {
        const pages: NotePageSummary[] = await storage.listPages();
        if (!cancelled) {
          setNoteDates(pages.map((page) => page.updatedAt));
        }
      } catch {
        if (!cancelled) setNoteDates([]);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const { cells, monthTotal, todayCount } = useMemo(() => {
    // 每天的计数：笔记（按最后修改日）+ 闪念（按创建日）。
    const counts = new Map<string, number>();
    const bump = (iso: string) => {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return;
      const key = toLocalDateKey(date);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    };

    noteDates.forEach(bump);
    flashDates.forEach(bump);

    const year = now.getFullYear();
    const month = now.getMonth();
    const todayKey = toLocalDateKey(now);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1);
    // 周一为一周起点，前面补空格。
    const mondayFirstOffset = (firstDay.getDay() + 6) % 7;

    const blanks: CalendarCell[] = Array.from(
      { length: mondayFirstOffset },
      (_, index) => ({
        key: `blank-${index}`,
        label: "",
        count: 0,
        tone: "blank",
        isToday: false,
      }),
    );

    const days: CalendarCell[] = Array.from(
      { length: daysInMonth },
      (_, index) => {
        const day = index + 1;
        const key = toLocalDateKey(new Date(year, month, day));
        const count = counts.get(key) ?? 0;

        return {
          key,
          label: String(day),
          count,
          tone: toneFor(count),
          isToday: key === todayKey,
          title: `${key} · ${count} 条`,
        };
      },
    );

    return {
      cells: [...blanks, ...days],
      monthTotal: days.reduce((sum, cell) => sum + cell.count, 0),
      todayCount: counts.get(todayKey) ?? 0,
    };
  }, [noteDates, flashDates, now]);

  return (
    <section className="home-v3-card home-v3-calheat" aria-label="记录日历">
      <header className="home-v3-card__head">
        <h2>
          <CalendarDaysIcon size={17} />
          记录日历
        </h2>
        <span>
          {now.getFullYear()}年{now.getMonth() + 1}月 · 今日 {todayCount} 条
        </span>
      </header>

      <div className="home-v3-calheat__weekdays" aria-hidden="true">
        {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div
        className="home-v3-calheat__grid"
        role="list"
        aria-label="本月记录热力日历"
      >
        {cells.map((cell) => (
          <span
            aria-label={cell.title}
            data-today={cell.isToday ? "true" : undefined}
            data-tone={cell.tone}
            key={cell.key}
            role={cell.tone === "blank" ? undefined : "listitem"}
            title={cell.title}
          >
            {cell.label}
          </span>
        ))}
      </div>

      <footer className="home-v3-calheat__foot">
        <span className="home-v3-calheat__total">本月累计 {monthTotal} 条</span>
        <div className="home-v3-calheat__legend" aria-hidden="true">
          <span>少</span>
          {(["none", "low", "medium", "high", "peak"] as const).map((tone) => (
            <i data-tone={tone} key={tone} />
          ))}
          <span>多</span>
        </div>
      </footer>
    </section>
  );
}
