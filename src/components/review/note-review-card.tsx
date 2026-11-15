"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRightIcon,
  CheckIcon,
  ChevronRightIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "@/components/auris-ui/auris-icons";
import type { NoteReviewItem, NoteReviewStatus } from "@/features/note-review/note-review-model";
import type { NotesStorage } from "@/features/notes/note-types";
import "./note-review.css";

export type NoteReviewCardProps = {
  item: NoteReviewItem;
  notesStorage: NotesStorage | null;
  onStatusChange: (itemId: string, status: NoteReviewStatus) => void;
  onPromoteToSpaced: (item: NoteReviewItem) => void;
  onRemoveFromToday: (itemId: string) => void;
  onDelete?: (itemId: string) => void;
};

export function NoteReviewCard({
  item,
  notesStorage,
  onStatusChange,
  onPromoteToSpaced,
  onRemoveFromToday,
  onDelete,
}: NoteReviewCardProps) {
  const router = useRouter();
  const [showPreview, setShowPreview] = useState(false);
  const [previewContent, setPreviewContent] = useState<string | null>(item.notePreview ?? null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const togglePreview = async () => {
    if (!showPreview && previewContent === null && notesStorage) {
      setLoadingPreview(true);
      try {
        const page = await notesStorage.getPage(item.noteId);
        setPreviewContent(page?.markdownBody ?? "（笔记正文为空）");
      } catch {
        setPreviewContent("（无法读取笔记内容，可能已被移动或删除）");
      } finally {
        setLoadingPreview(false);
      }
    }
    setShowPreview((prev) => !prev);
  };

  const handleJumpToNote = () => {
    onStatusChange(item.id, "needs_practice");
    const targetId = item.noteId || item.noteRelativePath;
    router.push(`/notes?resumeNoteId=${encodeURIComponent(targetId)}`);
  };

  const handleMaster = () => {
    onStatusChange(item.id, "reviewed");
  };

  const statusLabel = {
    pending: "今日待复习",
    needs_practice: "需强化",
    reviewed: "今日已回顾",
    mastered: "已掌握",
  }[item.status];

  return (
    <article
      aria-label={`复习笔记：${item.noteTitle}`}
      className="note-review-card"
      data-status={item.status}
    >
      <header className="note-review-card__header">
        <div className="note-review-card__title-area">
          <h3 className="note-review-card__title" title={item.noteTitle}>
            <span>📝</span>
            <span>{item.noteTitle}</span>
          </h3>
          <div className="note-review-card__path" title={item.noteRelativePath}>
            {item.noteRelativePath}
          </div>
        </div>
        <div className="note-review-card__badges">
          <span className="note-review-status-badge" data-status={item.status}>
            {statusLabel}
          </span>
          {item.inSpacedRepetition ? (
            <span
              className="note-review-status-badge"
              data-status="mastered"
              title="已纳入 1/2/4/7 艾宾浩斯复习"
            >
              1/2/4/7
            </span>
          ) : null}
        </div>
      </header>

      <button
        aria-expanded={showPreview}
        className="note-review-card__preview-toggle"
        onClick={togglePreview}
        type="button"
      >
        <span>{showPreview ? "收起正文预览" : "预览正文 ⌄"}</span>
        <ChevronRightIcon
          data-open={showPreview}
          size={13}
          style={{
            transform: showPreview ? "rotate(90deg)" : "none",
            transition: "transform 0.15s ease",
          }}
        />
      </button>

      {showPreview ? (
        <div className="note-review-card__preview-box" role="region" aria-label="笔记正文预览">
          {loadingPreview ? (
            <div style={{ color: "var(--app-text-muted)" }}>正在加载正文…</div>
          ) : (
            previewContent
          )}
        </div>
      ) : null}

      <footer className="note-review-card__actions">
        <div className="note-review-card__actions-left">
          <button
            className="note-review-btn-jump"
            onClick={handleJumpToNote}
            title="跳转至笔记工作台查看完整笔记"
            type="button"
          >
            <span>不会 / 打开笔记 ↗</span>
            <ArrowUpRightIcon size={14} />
          </button>
          <button
            className="note-review-btn-master"
            onClick={handleMaster}
            title="标记今日已复习"
            type="button"
          >
            <CheckIcon size={14} />
            <span>已掌握 ✓</span>
          </button>
        </div>

        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          {!item.inSpacedRepetition ? (
            <button
              className="note-review-btn-promote"
              onClick={() => onPromoteToSpaced(item)}
              title="纳入 1/2/4/7 艾宾浩斯长期间隔复习周期"
              type="button"
            >
              <RotateCcwIcon size={13} />
              <span>纳入 1/2/4/7</span>
            </button>
          ) : null}
          <button
            className="note-review-btn-remove"
            onClick={() => onRemoveFromToday(item.id)}
            title="移出今日复习（保留在库中）"
            type="button"
          >
            移出
          </button>
          {onDelete ? (
            <button
              className="note-review-btn-remove"
              onClick={() => onDelete(item.id)}
              title="从复习库彻底删除"
              type="button"
            >
              <Trash2Icon size={13} />
            </button>
          ) : null}
        </div>
      </footer>
    </article>
  );
}
