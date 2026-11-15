"use client";

import { PlusIcon } from "@/components/auris-ui/auris-icons";
import { NoteReviewCard } from "./note-review-card";
import type { NoteReviewItem, NoteReviewStatus } from "@/features/note-review/note-review-model";
import type { NotesStorage } from "@/features/notes/note-types";
import "./note-review.css";

export type TodayNoteReviewSectionProps = {
  queue: NoteReviewItem[];
  today: string;
  notesStorage: NotesStorage | null;
  onOpenPicker: () => void;
  onStatusChange: (itemId: string, status: NoteReviewStatus) => void;
  onPromoteToSpaced: (item: NoteReviewItem) => void;
  onRemoveFromToday: (itemId: string) => void;
  onDelete?: (itemId: string) => void;
};

export function TodayNoteReviewSection({
  queue,
  today: _today,
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
      <header className="today-note-review-section__header">
        <div className="today-note-review-section__title">
          <span>📝</span>
          <span>今日笔记自选回顾</span>
          <span className="today-note-review-section__badge">
            已回顾 {completed} / {total} 篇
          </span>
        </div>
        <button
          className="output-review-secondary"
          onClick={onOpenPicker}
          style={{ padding: "5px 10px", fontSize: "12px", height: "auto" }}
          type="button"
        >
          <PlusIcon size={14} />
          <span>选择笔记</span>
        </button>
      </header>

      {queue.length === 0 ? (
        <div className="today-note-review-section__empty">
          <p>今天还没有选择回顾的笔记。可以从笔记库中自选笔记进行主动回忆。</p>
          <button
            className="output-review-primary"
            onClick={onOpenPicker}
            style={{ fontSize: "12px", padding: "6px 14px" }}
            type="button"
          >
            从笔记库选择笔记
          </button>
        </div>
      ) : (
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
      )}
    </section>
  );
}
