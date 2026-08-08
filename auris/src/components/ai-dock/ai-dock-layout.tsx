"use client";

import type {
  CSSProperties,
  FocusEventHandler,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEventHandler,
  ReactNode,
} from "react";
import { DESKTOP_AI_DOCK_SPLITTER_KEYBOARD_STEP } from "@/features/ai-dock/ai-dock-layout";

type DesktopAiDockLayoutProps = {
  children: ReactNode;
  isOpen: boolean;
  isResizing: boolean;
  isVisible: boolean;
  onBlurCapture?: FocusEventHandler<HTMLElement>;
  onFocusCapture?: FocusEventHandler<HTMLElement>;
  onMouseEnter?: MouseEventHandler<HTMLElement>;
  onMouseLeave?: MouseEventHandler<HTMLElement>;
  onResizeByStep: (delta: number) => void;
  onResizeStart: (clientX: number) => void;
  onToggleOpen: () => void;
  shellWidth: number;
};

export function DesktopAiDockLayout({
  children,
  isOpen,
  isResizing,
  isVisible,
  onBlurCapture,
  onFocusCapture,
  onMouseEnter,
  onMouseLeave,
  onResizeByStep,
  onResizeStart,
  onToggleOpen,
  shellWidth,
}: DesktopAiDockLayoutProps) {
  const style = {
    "--desktop-ai-dock-shell-width": `${shellWidth}px`,
  } as CSSProperties;

  const handleSplitterKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!isOpen) {
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onResizeByStep(DESKTOP_AI_DOCK_SPLITTER_KEYBOARD_STEP);
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      onResizeByStep(-DESKTOP_AI_DOCK_SPLITTER_KEYBOARD_STEP);
    }
  };

  return (
    <aside
      aria-hidden={isVisible ? undefined : true}
      className="desktop-ai-dock"
      data-open={isOpen ? "true" : "false"}
      data-visible={isVisible ? "true" : "false"}
      data-testid="desktop-ai-dock"
      onBlurCapture={onBlurCapture}
      onFocusCapture={onFocusCapture}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={style}
    >
      <button
        aria-label={isOpen ? "Close AI sidebar" : "Open AI sidebar"}
        className="desktop-ai-dock__edge-toggle"
        data-open={isOpen ? "true" : "false"}
        onClick={onToggleOpen}
        type="button"
      >
        <span>AI</span>
      </button>

      {isOpen ? (
        <>
          <div
            aria-label="Resize AI dock"
            aria-orientation="vertical"
            className="desktop-ai-dock__splitter"
            data-active={isResizing ? "true" : "false"}
            onKeyDown={handleSplitterKeyDown}
            onMouseDown={(event) => {
              event.preventDefault();
              onResizeStart(event.clientX);
            }}
            role="separator"
            tabIndex={0}
          />
          <div className="desktop-ai-dock__panel">{children}</div>
        </>
      ) : null}
    </aside>
  );
}
