"use client";

import { useState, type KeyboardEvent } from "react";

type NotesTagEditorProps = {
  disabled?: boolean;
  onChange: (tags: string[]) => void;
  tags: string[];
};

export function NotesTagEditor({
  disabled = false,
  onChange,
  tags,
}: NotesTagEditorProps) {
  const [draft, setDraft] = useState("");

  const commitDraft = () => {
    const value = draft.trim().replace(/^#+/, "").trim();
    setDraft("");
    if (!value || tags.includes(value)) {
      return;
    }
    onChange([...tags, value]);
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter((item) => item !== tag));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitDraft();
      return;
    }
    if (event.key === "Backspace" && draft === "" && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <div className="notes-v2__tag-editor">
      <p className="notes-v2__tag-hint">仅用于检索，不会出现在笔记正文里。</p>
      <div className="notes-v2__tag-chips">
        {tags.length === 0 ? (
          <span className="notes-v2__tag-empty">还没有标签</span>
        ) : (
          tags.map((tag) => (
            <span className="notes-v2__tag-chip" key={tag}>
              <span>{tag}</span>
              <button
                aria-label={`移除标签 ${tag}`}
                disabled={disabled}
                onClick={() => removeTag(tag)}
                type="button"
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>
      <input
        className="notes-v2__tag-input"
        disabled={disabled}
        onBlur={commitDraft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入标签后回车…"
        value={draft}
      />
    </div>
  );
}
