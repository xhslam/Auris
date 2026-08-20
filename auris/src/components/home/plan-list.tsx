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
  const remainingCount = items.length - doneCount;
  const progress = items.length === 0 ? 0 : Math.round((doneCount / items.length) * 100);
  const progressMessage =
    items.length === 0
      ? "从一件小事开始"
      : remainingCount === 0
        ? "今天的清单已完成"
        : doneCount === 0
          ? "先完成最重要的一项"
          : `再完成 ${remainingCount} 项`;

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
      <header className="home-v3-plan__summary">
        <div className="home-v3-plan__summary-copy">
          <span>今日进度</span>
          <p>{progressMessage}</p>
        </div>
        <div className="home-v3-plan__head-actions">
          <strong className="home-v3-plan__count" aria-label="计划完成数量">
            <b>{doneCount}</b>{" "}
            <span>/</span>
            {" "}<span>{items.length}</span>
          </strong>
          <button
            aria-label="记录今日任务到 任务记录.md"
            className="home-v3-plan__icon-btn home-v3-plan__record"
            onClick={onRecord}
            title="记录今日任务到 任务记录.md"
            type="button"
          >
            <NotebookPenIcon size={14} />
            <span className="home-v3-plan__record-label">记录</span>
          </button>
        </div>
      </header>

      <div
        aria-label={`今日任务完成度 ${progress}%`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={progress}
        className="home-v3-plan__progress"
        role="progressbar"
      >
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="home-v3-plan__list" data-empty={items.length === 0}>
        {items.length === 0 ? (
          <div className="home-v3-plan__empty">
            <span><CheckIcon size={16} /></span>
            <p>今天还没有任务</p>
            <small>把下一个可完成的动作写下来。</small>
          </div>
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
          aria-label="添加计划"
          className="home-v3-plan__add"
          onClick={() => {
            setPendingFocusId(onAdd());
          }}
          type="button"
        >
          <PlusIcon size={15} />
          添加任务
        </button>
        <button
          aria-label="导出每日计划"
          className="home-v3-plan__icon-btn home-v3-plan__export"
          onClick={onExport}
          title="导出今日计划为新的 markdown 文件"
          type="button"
        >
          <ArrowUpRightIcon size={14} />
          <span className="home-v3-plan__export-label">导出</span>
        </button>
      </div>
    </section>
  );
}
