"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  onAdd?: () => string;
  onAddTasks?: (titles: string[]) => void;
  onDelete: (id: string) => void;
  onExport: () => void;
  onRecord: () => void;
  onToggle: (id: string) => void;
  onUpdateTitle: (id: string, title: string) => void;
};

export function parseTaskDraft(draft: string): string[] {
  return draft
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => line.replace(/^[-*+\u2022]\s*\[[ xX]\]\s*/, ""))
    .map((line) => line.replace(/^[-*+\u2022]\s+/, ""))
    .map((line) => line.replace(/^\d+[.)\u3001]\s*/, ""))
    .map((line) => line.trim())
    .filter(Boolean);
}

export function PlanList({
  items,
  onAdd,
  onAddTasks,
  onDelete,
  onExport,
  onRecord,
  onToggle,
  onUpdateTitle,
}: PlanListProps) {
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const [draft, setDraft] = useState("");
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const parsedTasks = useMemo(() => parseTaskDraft(draft), [draft]);
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
    if (!isComposerOpen || !composerRef.current) {
      return;
    }

    composerRef.current.focus();
  }, [isComposerOpen]);

  function closeComposer() {
    setDraft("");
    setIsComposerOpen(false);
  }

  function submitTasks() {
    if (parsedTasks.length === 0) {
      return;
    }

    if (onAddTasks) {
      onAddTasks(parsedTasks);
    } else if (onAdd) {
      parsedTasks.forEach((title) => onUpdateTitle(onAdd(), title));
    }
    closeComposer();
  }

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

      <div
        className="home-v3-plan__list"
        data-composing={isComposerOpen}
        data-empty={items.length === 0 && !isComposerOpen}
      >
        {isComposerOpen ? (
          <div className="home-v3-plan__composer">
            <div className="home-v3-plan__composer-heading">
              <div>
                <strong>一次写下所有任务</strong>
                <span>每行一项，粘贴清单也会自动整理</span>
              </div>
              <span aria-live="polite">{parsedTasks.length} 项</span>
            </div>
            <textarea
              aria-label="批量添加任务"
              onChange={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeComposer();
                } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  submitTasks();
                }
              }}
              placeholder={"例如：\n完成 10 道真题\n整理阅读材料\n复习今天的单词"}
              ref={composerRef}
              value={draft}
            />
            <div className="home-v3-plan__composer-footer">
              <small>支持序号、项目符号和 Markdown 复选框</small>
              <div>
                <button className="home-v3-plan__cancel" onClick={closeComposer} type="button">
                  取消
                </button>
                <button
                  className="home-v3-plan__confirm"
                  disabled={parsedTasks.length === 0}
                  onClick={submitTasks}
                  type="button"
                >
                  {parsedTasks.length > 0 ? `添加 ${parsedTasks.length} 项任务` : "添加任务"}
                </button>
              </div>
            </div>
          </div>
        ) : items.length === 0 ? (
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

      {!isComposerOpen ? (
        <div className="home-v3-plan__footer">
          <button
            aria-label="添加计划"
            className="home-v3-plan__add"
            onClick={() => setIsComposerOpen(true)}
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
      ) : null}
    </section>
  );
}
