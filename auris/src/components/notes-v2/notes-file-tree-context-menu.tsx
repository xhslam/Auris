"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { VaultEntryDisplayKind } from "@/features/notes/vault/vault-path";

export type ContextMenuTarget = {
  path: string;
  kind: "directory" | "file";
  displayKind: VaultEntryDisplayKind | null;
  x: number;
  y: number;
};

type NotesFileTreeContextMenuProps = {
  target: ContextMenuTarget;
  onClose: () => void;
  onCreateNote: (folderPath: string) => void;
  onCreateFolder: (parentPath: string) => void;
  onRename: (path: string, kind: "directory" | "file") => void;
  onDelete: (path: string, kind: "directory" | "file") => void;
};

export function NotesFileTreeContextMenu({
  target,
  onClose,
  onCreateNote,
  onCreateFolder,
  onRename,
  onDelete,
}: NotesFileTreeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Close on outside click (pointerdown to match the popover's listener)
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

  const isDirectory = target.kind === "directory";
  const isRoot = target.path === "";
  const isMarkdown = target.displayKind === "markdown";

  // Clamp to viewport
  const MENU_WIDTH = 180;
  const MENU_APPROX_HEIGHT = isRoot ? 88 : isDirectory ? 160 : 96;
  const x = Math.min(target.x, window.innerWidth - MENU_WIDTH - 8);
  const y = Math.min(target.y, window.innerHeight - MENU_APPROX_HEIGHT - 8);

  function handle(fn: () => void) {
    return () => {
      fn();
      onClose();
    };
  }

  const menu = (
    <div
      className="notes-v2__context-menu"
      ref={menuRef}
      role="menu"
      style={{ left: x, top: y }}
      // Stop pointerdown from bubbling to document so the popover's
      // click-outside handler doesn't close the popover while menu is open
      onPointerDown={(e) => e.stopPropagation()}
    >
      {isDirectory && (
        <>
          <button
            className="notes-v2__context-menu-item"
            onClick={handle(() => onCreateNote(target.path))}
            role="menuitem"
            type="button"
          >
            <span aria-hidden="true" className="notes-v2__context-menu-icon">
              <svg viewBox="0 0 16 16" fill="none">
                <path d="M4 4h5l3 3v5H4V4Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                <path d="M9 4v3h3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                <path d="M6 9h4M8 7v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            </span>
            New Note
          </button>
          <button
            className="notes-v2__context-menu-item"
            onClick={handle(() => onCreateFolder(target.path))}
            role="menuitem"
            type="button"
          >
            <span aria-hidden="true" className="notes-v2__context-menu-icon">
              <svg viewBox="0 0 16 16" fill="none">
                <path d="M2 5h5l1.5 2H14v5H2V5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                <path d="M8 8.5v3M6.5 10h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            </span>
            New Folder
          </button>
          <div className="notes-v2__context-menu-separator" role="separator" />
        </>
      )}

      {!isRoot && (isDirectory || isMarkdown) && (
        <button
          className="notes-v2__context-menu-item"
          onClick={handle(() => onRename(target.path, target.kind))}
          role="menuitem"
          type="button"
        >
          <span aria-hidden="true" className="notes-v2__context-menu-icon">
            <svg viewBox="0 0 16 16" fill="none">
              <path d="M10.5 3.5 12.5 5.5l-7 7H3.5v-2l7-7Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            </svg>
          </span>
          Rename
        </button>
      )}

      {!isRoot && (
        <button
          className="notes-v2__context-menu-item notes-v2__context-menu-item--danger"
          onClick={handle(() => onDelete(target.path, target.kind))}
          role="menuitem"
          type="button"
        >
          <span aria-hidden="true" className="notes-v2__context-menu-icon">
            <svg viewBox="0 0 16 16" fill="none">
              <path d="M3 5h10M6 5V3h4v2M5 5l.5 8h5L11 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          Delete
        </button>
      )}
    </div>
  );

  // Portal to document.body so backdrop-filter stacking context
  // on the popover parent doesn't break position:fixed positioning
  if (typeof document === "undefined") return null;
  return createPortal(menu, document.body);
}
