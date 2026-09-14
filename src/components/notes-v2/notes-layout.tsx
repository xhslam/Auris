"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  clampRightSidebarWidth,
  getDefaultRightSidebarWidth,
  NOTES_CENTER_FALLBACK_WIDTH,
  NOTES_SPLITTER_KEYBOARD_STEP,
} from "@/components/notes-v2/notes-layout-resize";
import type { NotesRightSidebarMode } from "@/features/notes/workspace/workspace-types";

type NotesLayoutProps = {
  center: ReactNode;
  header: ReactNode;
  leftRail: ReactNode;
  leftSidebarCollapsed?: boolean;
  leftSidebar: ReactNode;
  rightSidebarMode?: NotesRightSidebarMode;
  rightSidebarCollapsed?: boolean;
  rightSidebar: ReactNode;
  rightSidebarWidth?: number;
  onRightSidebarWidthChange?: (width: number) => void;
};

export function NotesLayout({
  center,
  header,
  leftRail,
  leftSidebarCollapsed = false,
  leftSidebar,
  rightSidebarMode = "properties",
  rightSidebarCollapsed = false,
  rightSidebar,
  rightSidebarWidth,
  onRightSidebarWidthChange,
}: NotesLayoutProps) {
  const centerRef = useRef<HTMLElement | null>(null);
  const dragStateRef = useRef<{
    startWidth: number;
    startX: number;
  } | null>(null);
  const [centerWidth, setCenterWidth] = useState(NOTES_CENTER_FALLBACK_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const resolvedWidth = useMemo(
    () =>
      clampRightSidebarWidth(
        rightSidebarWidth ?? getDefaultRightSidebarWidth(rightSidebarMode),
        centerWidth,
        rightSidebarMode,
      ),
    [centerWidth, rightSidebarMode, rightSidebarWidth],
  );

  const updateWidth = useCallback(
    (nextWidth: number) => {
      onRightSidebarWidthChange?.(
        clampRightSidebarWidth(nextWidth, centerWidth, rightSidebarMode),
      );
    },
    [centerWidth, onRightSidebarWidthChange, rightSidebarMode],
  );

  useEffect(() => {
    const element = centerRef.current;

    if (!element || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      const nextWidth =
        entries[0]?.contentRect.width ?? element.clientWidth ?? centerWidth;

      if (nextWidth > 0) {
        setCenterWidth(nextWidth);
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [centerWidth]);

  useEffect(() => {
    if (rightSidebarCollapsed) {
      return;
    }

    if (resolvedWidth !== rightSidebarWidth) {
      onRightSidebarWidthChange?.(resolvedWidth);
    }
  }, [
    onRightSidebarWidthChange,
    resolvedWidth,
    rightSidebarCollapsed,
    rightSidebarWidth,
  ]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const dragState = dragStateRef.current;

      if (!dragState) {
        return;
      }

      updateWidth(dragState.startWidth + (dragState.startX - event.clientX));
    };

    const handleMouseUp = () => {
      if (!dragStateRef.current) {
        return;
      }

      dragStateRef.current = null;
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [updateWidth]);

  const handleResizeStart = useCallback(
    (clientX: number) => {
      if (rightSidebarCollapsed) {
        return;
      }

      dragStateRef.current = {
        startWidth: resolvedWidth,
        startX: clientX,
      };
      setIsResizing(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [resolvedWidth, rightSidebarCollapsed],
  );

  const handleSplitterKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (rightSidebarCollapsed) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        updateWidth(resolvedWidth + NOTES_SPLITTER_KEYBOARD_STEP);
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        updateWidth(resolvedWidth - NOTES_SPLITTER_KEYBOARD_STEP);
      }
    },
    [resolvedWidth, rightSidebarCollapsed, updateWidth],
  );

  return (
    <section
      className="notes-v2"
      data-left-collapsed={leftSidebarCollapsed ? "true" : "false"}
      data-right-collapsed={rightSidebarCollapsed ? "true" : "false"}
      data-right-mode={rightSidebarMode}
    >
      <header className="notes-v2__header">{header}</header>
      <aside className="notes-v2__rail notes-v2__rail--left">{leftRail}</aside>
      <aside className="notes-v2__sidebar notes-v2__sidebar--left">
        {leftSidebar}
      </aside>
      <main className="notes-v2__center" ref={centerRef}>
        {center}
        {!rightSidebarCollapsed ? (
          <div
            aria-label="Resize right panel"
            aria-orientation="vertical"
            className="notes-v2__splitter"
            data-active={isResizing ? "true" : "false"}
            onKeyDown={handleSplitterKeyDown}
            onMouseDown={(event) => {
              event.preventDefault();
              handleResizeStart(event.clientX);
            }}
            role="separator"
            tabIndex={0}
          />
        ) : null}
        <aside
          className="notes-v2__sidebar notes-v2__sidebar--right"
          data-collapsed={rightSidebarCollapsed ? "true" : "false"}
          data-mode={rightSidebarMode}
          data-terminal={
            !rightSidebarCollapsed && rightSidebarMode === "terminal"
              ? "true"
              : "false"
          }
          style={
            rightSidebarCollapsed ? { width: 0 } : { width: `${resolvedWidth}px` }
          }
        >
          {rightSidebar}
        </aside>
      </main>
    </section>
  );
}
