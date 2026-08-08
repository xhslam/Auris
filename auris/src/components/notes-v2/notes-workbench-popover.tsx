"use client";

import { useEffect, useRef, type ReactNode } from "react";

type NotesWorkbenchPopoverProps = {
  anchor: "bottom-left" | "bottom-right";
  children: ReactNode;
  labelledBy?: string;
  onClose: () => void;
  open: boolean;
  size?: "sm" | "md" | "lg" | "terminal";
};

export function NotesWorkbenchPopover({
  anchor,
  children,
  labelledBy,
  onClose,
  open,
  size = "md",
}: NotesWorkbenchPopoverProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!popoverRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      aria-labelledby={labelledBy}
      className="notes-v2__corner-popover"
      data-anchor={anchor}
      data-size={size}
      ref={popoverRef}
      role="dialog"
    >
      {children}
    </div>
  );
}
