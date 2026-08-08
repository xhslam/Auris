"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRightIcon,
  CheckIcon,
  NotebookPenIcon,
  PlusIcon,
  Trash2Icon,
} from "@/components/auris-ui/auris-icons";
import type { PlanItem } from "@/features/home/home-store";

type PlanListProps = {
  items: PlanItem[];
  onAdd: () => string;
  onDelete: (id: string) => void;
  onExport: () => void;
  onRecord: () => void;
  onToggle: (id: string) => void;
  onUpdateTitle: (id: string, title: string) => void;
};

export function PlanList({
  items,
  onAdd,
  onDelete,
  onExport,
  onRecord,
  onToggle,
  onUpdateTitle,
}: PlanListProps) {
  const newestInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const doneCount = items.filter((item) => item.done).length;

  useEffect(() => {
    if (!pendingFocusId || !newestInputRef.current) {
      return;
    }

    newestInputRef.current.focus();
    newestInputRef.current.select();
    setPendingFocusId(null);
  }, [items, pendingFocusId]);

  return (
    <section className="home-v3-card home-v3-plan" aria-label="计划">
      <header className="home-v3-card__head">
        <div>
          <h2>今日任务</h2>
        </div>
        <div className="home-v3-plan__head-actions">
          <strong className="home-v3-plan__count" aria-label="计划完成数量">
            {doneCount} / {items.length}
          </strong>
          <button
            aria-label="记录今日任务到 任务记录.md"
            className="home-v3-plan__icon-btn"
            onClick={onRecord}
            title="记录今日任务到 任务记录.md"
            type="button"
          >
            <NotebookPenIcon size={14} />
            记录
          </button>
        </div>
      </header>

      <div className="home-v3-plan__list">
        {items.length === 0 ? (
          <p className="home-v3-empty">今天还没有计划。</p>
        ) : (
          items.map((item) => (
            <div className="home-v3-plan__item" data-done={item.done} key={item.id}>
              <button
                aria-label={item.done ? `取消完成 ${item.title || "未命名计划"}` : `完成 ${item.title || "未命名计划"}`}
                className="home-v3-plan__check"
                onClick={() => onToggle(item.id)}
                type="button"
              >
                {item.done ? <CheckIcon size={13} /> : null}
              </button>
              <input
                aria-label="编辑计划"
                className="home-v3-plan__input"
                onChange={(event) => onUpdateTitle(item.id, event.currentTarget.value)}
                placeholder="写下一个可完成的计划"
                ref={pendingFocusId === item.id ? newestInputRef : undefined}
                value={item.title}
              />
              <button
                aria-label={`删除 ${item.title || "未命名计划"}`}
                className="home-v3-plan__delete"
                onClick={() => onDelete(item.id)}
                type="button"
              >
                <Trash2Icon size={15} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="home-v3-plan__footer">
        <button
          className="home-v3-plan__add"
          onClick={() => {
            setPendingFocusId(onAdd());
          }}
          type="button"
        >
          <PlusIcon size={15} />
          添加计划
        </button>
        <button
          aria-label="导出每日计划"
          className="home-v3-plan__icon-btn"
          onClick={onExport}
          title="导出今日计划为新的 markdown 文件"
          type="button"
        >
          <ArrowUpRightIcon size={14} />
          导出每日计划
        </button>
      </div>
    </section>
  );
}
