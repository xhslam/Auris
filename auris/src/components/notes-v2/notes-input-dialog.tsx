"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// ── Generic input dialog (replaces window.prompt in Electron) ──────────────

type NotesInputDialogProps = {
  title: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
};

export function NotesInputDialog({
  title,
  placeholder = "",
  defaultValue = "",
  confirmLabel = "OK",
  onConfirm,
  onCancel,
}: NotesInputDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onConfirm(trimmed);
  }

  const content = (
    <div
      className="notes-v2__dialog-backdrop"
      onPointerDown={(e) => {
        // Close on backdrop click, but not on dialog click
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="notes-v2__dialog"
        role="dialog"
        aria-modal="true"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="notes-v2__dialog-title">{title}</p>
        <form onSubmit={handleSubmit}>
          <input
            autoFocus
            className="notes-v2__dialog-input"
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            ref={inputRef}
            type="text"
            value={value}
          />
          <div className="notes-v2__dialog-actions">
            <button
              className="notes-v2__dialog-btn notes-v2__dialog-btn--cancel"
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>
            <button
              className="notes-v2__dialog-btn notes-v2__dialog-btn--confirm"
              disabled={!value.trim()}
              type="submit"
            >
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}

// ── Generic confirm dialog (replaces window.confirm in Electron) ────────────

type NotesConfirmDialogProps = {
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function NotesConfirmDialog({
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: NotesConfirmDialogProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const content = (
    <div
      className="notes-v2__dialog-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="notes-v2__dialog"
        role="alertdialog"
        aria-modal="true"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="notes-v2__dialog-title">{message}</p>
        <div className="notes-v2__dialog-actions">
          <button
            autoFocus
            className="notes-v2__dialog-btn notes-v2__dialog-btn--cancel"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="notes-v2__dialog-btn notes-v2__dialog-btn--danger"
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
