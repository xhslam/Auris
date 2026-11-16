"use client";

import { NotebookPenIcon, PlusIcon } from "@/components/auris-ui/auris-icons";
import { NoteReviewCard } from "./note-review-card";
import type { NoteReviewItem, NoteReviewStatus } from "@/features/note-review/note-review-model";
import type { NotesStorage } from "@/features/notes/note-types";
import "./note-review.css";

export type TodayNoteReviewSectionProps = {
  queue: NoteReviewItem[];
  notesStorage: NotesStorage | null;
  onOpenPicker: () => void;
  onStatusChange: (itemId: string, status: NoteReviewStatus) => void;
  onPromoteToSpaced: (item: NoteReviewItem) => void;
  onRemoveFromToday: (itemId: string) => void;
  onDelete?: (itemId: string) => void;
};

export function TodayNoteReviewSection({
  queue,
  notesStorage,
  onOpenPicker,
  onStatusChange,
  onPromoteToSpaced,
  onRemoveFromToday,
  onDelete,
}: TodayNoteReviewSectionProps) {
  const completed = queue.filter(
    (item) => item.status === "reviewed" || item.status === "mastered",
  ).length;
  const total = queue.length;

  return (
    <section aria-label="今日笔记自选回顾" className="today-note-review-section">
      <header className="review-today-module__header">
        <h2><NotebookPenIcon size={18} />今日笔记自选回顾</h2>
        <button className="review-today-link" onClick={onOpenPicker} type="button">
          <PlusIcon size={16} />
          {total > 0 ? "选择笔记" : "从笔记库选择笔记"}
        </button>
      </header>

      {total === 0 ? (
        <p className="review-today-module__empty">今天还没有选择回顾的笔记。</p>
      ) : (
        <>
          <div className="today-note-review-section__progress">
            <span>已回顾 {completed} / {total} 篇</span>
            <div className="review-today-meter" aria-label="今日笔记回顾进度" aria-valuemax={total} aria-valuemin={0} aria-valuenow={completed} role="progressbar">
              <i style={{ width: `${completed / total * 100}%` }} />
            </div>
          </div>
          <div className="today-note-review-section__list">
            {queue.map((item) => (
              <NoteReviewCard
                item={item}
                key={item.id}
                notesStorage={notesStorage}
                onDelete={onDelete}
                onPromoteToSpaced={onPromoteToSpaced}
                onRemoveFromToday={onRemoveFromToday}
                onStatusChange={onStatusChange}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
