"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export type EditorContextMenuTarget = {
  text: string;
  from: number;
  to: number;
  x: number;
  y: number;
};

type NotesEditorContextMenuProps = {
  target: EditorContextMenuTarget;
  onAddWikiLink: (target: EditorContextMenuTarget) => void;
  onClose: () => void;
};

/**
 * Obsidian-style context menu for editor text selections. Exposes "新增反链",
 * which wraps the selected text into a `[[wiki link]]` and materialises the
 * target note when it does not yet exist.
 */
export function NotesEditorContextMenu({
  target,
  onAddWikiLink,
  onClose,
}: NotesEditorContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (typeof document === "undefined") {
    return null;
  }

  const MENU_WIDTH = 180;
  const MENU_APPROX_HEIGHT = 48;
  const x = Math.min(target.x, window.innerWidth - MENU_WIDTH - 8);
  const y = Math.min(target.y, window.innerHeight - MENU_APPROX_HEIGHT - 8);

  return createPortal(
    <div
      className="notes-v2__context-menu"
      data-testid="notes-editor-context-menu"
      onPointerDown={(event) => event.stopPropagation()}
      ref={menuRef}
      role="menu"
      style={{ left: x, top: y }}
    >
      <button
        className="notes-v2__context-menu-item"
        onClick={() => {
          onAddWikiLink(target);
          onClose();
        }}
        role="menuitem"
        type="button"
      >
        <span aria-hidden="true" className="notes-v2__context-menu-icon">
          🔗
        </span>
        新增反链
      </button>
    </div>,
    document.body,
  );
}
