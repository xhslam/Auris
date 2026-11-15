"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckIcon, SearchIcon } from "@/components/auris-ui/auris-icons";
import type { NotesStorage, NotePageSummary } from "@/features/notes/note-types";
import "./note-review.css";

export type NotePickerItem = {
  id: string;
  title: string;
  relativePath: string;
};

export type NotePickerModalProps = {
  existingNoteIds: Set<string>;
  notesStorage: NotesStorage | null;
  onCancel: () => void;
  onConfirm: (selectedNotes: NotePickerItem[]) => void;
};

export function NotePickerModal({
  existingNoteIds,
  notesStorage,
  onCancel,
  onConfirm,
}: NotePickerModalProps) {
  const [notes, setNotes] = useState<NotePageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    if (!notesStorage) {
      setLoading(false);
      return;
    }
    notesStorage
      .listPages()
      .then((pages) => {
        if (!active) return;
        setNotes(pages);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [notesStorage]);

  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (note) =>
        note.title.toLowerCase().includes(q) ||
        note.relativePath.toLowerCase().includes(q) ||
        note.fileName.toLowerCase().includes(q),
    );
  }, [notes, search]);

  const toggleSelect = (note: NotePageSummary) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(note.id)) {
        next.delete(note.id);
      } else {
        next.add(note.id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const next = new Set(selectedIds);
    for (const note of filteredNotes) {
      next.add(note.id);
    }
    setSelectedIds(next);
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleConfirm = () => {
    const selectedList: NotePickerItem[] = notes
      .filter((n) => selectedIds.has(n.id))
      .map((n) => ({
        id: n.id,
        title: n.title,
        relativePath: n.relativePath,
      }));
    onConfirm(selectedList);
  };

  return (
    <div className="output-review-overlay" role="presentation">
      <div
        aria-modal="true"
        className="output-review-modal note-picker-modal"
        role="dialog"
        aria-label="从笔记库选择复习笔记"
      >
        <header className="output-review-modal__header">
          <div>
            <span>VAULT NOTES</span>
            <h2>从笔记库选择复习笔记</h2>
          </div>
          <button aria-label="关闭" onClick={onCancel} type="button">
            ×
          </button>
        </header>

        <div className="note-picker-modal__search">
          <SearchIcon size={16} />
          <input
            autoFocus
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索笔记标题或文件夹路径…"
            type="text"
            value={search}
          />
        </div>

        <div className="note-picker-modal__controls">
          <span className="note-picker-modal__count">
            共 {filteredNotes.length} 篇笔记 · 已选 {selectedIds.size} 篇
          </span>
          <div className="note-picker-modal__bulk">
            <button onClick={handleSelectAll} type="button">
              全选
            </button>
            <button onClick={handleDeselectAll} type="button">
              取消全选
            </button>
          </div>
        </div>

        <div className="note-picker-modal__list" role="list">
          {loading ? (
            <div className="note-picker-modal__empty">正在读取本地笔记库…</div>
          ) : filteredNotes.length === 0 ? (
            <div className="note-picker-modal__empty">
              {notes.length === 0
                ? "暂无可选择的笔记。请先在 Notes 页面中创建笔记或连接本地 Vault。"
                : "没有匹配搜索条件的笔记。"}
            </div>
          ) : (
            filteredNotes.map((note) => {
              const isSelected = selectedIds.has(note.id);
              const isAlreadyInReview = existingNoteIds.has(note.id);
              return (
                <label
                  className="note-picker-modal__item"
                  data-selected={isSelected}
                  key={note.id}
                >
                  <input
                    aria-label={`选择 ${note.title}`}
                    checked={isSelected}
                    onChange={() => toggleSelect(note)}
                    type="checkbox"
                  />
                  <span className="note-picker-modal__icon">{note.icon || "📝"}</span>
                  <div className="note-picker-modal__info">
                    <strong>{note.title}</strong>
                    <small>{note.relativePath}</small>
                  </div>
                  {isAlreadyInReview ? (
                    <span className="note-picker-modal__badge">已在复习中</span>
                  ) : null}
                </label>
              );
            })
          )}
        </div>

        <footer>
          <button className="output-review-secondary" onClick={onCancel} type="button">
            取消
          </button>
          <button
            className="output-review-primary"
            disabled={selectedIds.size === 0}
            onClick={handleConfirm}
            type="button"
          >
            <CheckIcon size={16} />
            加入今日回顾 ({selectedIds.size})
          </button>
        </footer>
      </div>
    </div>
  );
}
