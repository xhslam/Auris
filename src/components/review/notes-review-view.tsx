"use client";

import { useMemo, useState } from "react";
import { PlusIcon, SearchIcon } from "@/components/auris-ui/auris-icons";
import { NoteReviewCard } from "./note-review-card";
import type { NoteReviewItem, NoteReviewState, NoteReviewStatus } from "@/features/note-review/note-review-model";
import type { NotesStorage } from "@/features/notes/note-types";
import "./note-review.css";

type FilterType = "all" | "today_pending" | "reviewed" | "spaced";

export type NotesReviewViewProps = {
  state: NoteReviewState;
  today: string;
  notesStorage: NotesStorage | null;
  onOpenPicker: () => void;
  onStatusChange: (itemId: string, status: NoteReviewStatus) => void;
  onPromoteToSpaced: (item: NoteReviewItem) => void;
  onRemoveFromToday: (itemId: string) => void;
  onDelete: (itemId: string) => void;
};

export function NotesReviewView({
  state,
  today,
  notesStorage,
  onOpenPicker,
  onStatusChange,
  onPromoteToSpaced,
  onRemoveFromToday,
  onDelete,
}: NotesReviewViewProps) {
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");

  const filteredItems = useMemo(() => {
    let list = state.items;

    if (filter === "today_pending") {
      list = list.filter(
        (item) =>
          item.scheduledDate &&
          (item.scheduledDate === today || item.scheduledDate < today) &&
          item.status !== "reviewed" &&
          item.status !== "mastered",
      );
    } else if (filter === "reviewed") {
      list = list.filter((item) => item.status === "reviewed" || item.status === "mastered");
    } else if (filter === "spaced") {
      list = list.filter((item) => item.inSpacedRepetition);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (item) =>
          item.noteTitle.toLowerCase().includes(q) ||
          item.noteRelativePath.toLowerCase().includes(q),
      );
    }

    return list;
  }, [state.items, filter, search, today]);

  const stats = useMemo(() => {
    const total = state.items.length;
    const reviewed = state.items.filter(
      (item) => item.status === "reviewed" || item.status === "mastered",
    ).length;
    const inSpaced = state.items.filter((item) => item.inSpacedRepetition).length;
    return { total, reviewed, inSpaced };
  }, [state.items]);

  return (
    <section aria-label="笔记回顾工作台" className="output-review-view notes-review-view">
      <div className="output-review-view__heading">
        <div>
          <h2>笔记回顾工作台</h2>
          <p>
            从本地 Note 库挑选笔记进行主动自测。遇到盲区时一键跳回笔记看原文，亦可纳入 1/2/4/7
            艾宾浩斯复习。
          </p>
        </div>
        <button className="output-review-primary" onClick={onOpenPicker} type="button">
          <PlusIcon size={16} />
          <span>选择笔记入队</span>
        </button>
      </div>

      <div className="notes-review-view__toolbar">
        <label className="output-review-search" style={{ minWidth: "260px" }}>
          <SearchIcon size={16} />
          <span className="sr-only">搜索复习笔记</span>
          <input
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索笔记标题或路径…"
            type="text"
            value={search}
          />
        </label>

        <div aria-label="笔记复习筛选" className="notes-review-view__filters">
          <button
            data-active={filter === "all"}
            onClick={() => setFilter("all")}
            type="button"
          >
            全部 ({stats.total})
          </button>
          <button
            data-active={filter === "today_pending"}
            onClick={() => setFilter("today_pending")}
            type="button"
          >
            今日待复习
          </button>
          <button
            data-active={filter === "reviewed"}
            onClick={() => setFilter("reviewed")}
            type="button"
          >
            已回顾
          </button>
          <button
            data-active={filter === "spaced"}
            onClick={() => setFilter("spaced")}
            type="button"
          >
            长期周期中 ({stats.inSpaced})
          </button>
        </div>
      </div>

      <div className="output-review-list" style={{ marginTop: "12px" }}>
        {filteredItems.length === 0 ? (
          <div className="output-review-list__empty">
            {state.items.length === 0
              ? "暂未添加任何复习笔记。点击右上角「选择笔记入队」开始吧！"
              : "没有符合当前筛选条件的笔记。"}
          </div>
        ) : (
          filteredItems.map((item) => (
            <NoteReviewCard
              item={item}
              key={item.id}
              notesStorage={notesStorage}
              onDelete={onDelete}
              onPromoteToSpaced={onPromoteToSpaced}
              onRemoveFromToday={onRemoveFromToday}
              onStatusChange={onStatusChange}
            />
          ))
        )}
      </div>
    </section>
  );
}
