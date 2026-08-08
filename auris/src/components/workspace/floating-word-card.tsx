"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { applyThemeVarsFromScope } from "@/components/workspace/floating-word-card-theme";
import { useFloatingWordCardDismiss } from "@/components/workspace/use-floating-word-card-dismiss";
import { useFloatingWordCardDrag } from "@/components/workspace/use-floating-word-card-drag";
import { useFloatingWordCardPosition } from "@/components/workspace/use-floating-word-card-position";

type FloatingWordCardProps = {
  anchor: { x: number; y: number };
  "aria-label"?: string;
  children: ReactNode;
  /**
   * Visual surface class (background / border / shadow). Applied to the inner
   * card, not the fixed positioner.
   */
  className?: string;
  /**
   * When this changes, reposition near the new anchor (e.g. term + coords).
   * Keeps a single card instance while updating placement.
   */
  placementKey: string;
  /**
   * Selectors for elements that should not dismiss the card on right-click
   * (so a new lookup can replace the card cleanly).
   */
  keepOpenOnContextMenuSelector?: string;
  onClose: () => void;
  /**
   * Optional portal owner for top-layer contexts such as HTML fullscreen.
   * Defaults to document.body.
   */
  portalTarget?: Element | null;
  style?: CSSProperties;
  /**
   * Page root that owns theme CSS variables. Values are copied onto the
   * portaled surface so backgrounds stay opaque outside the page tree.
   */
  themeScopeSelector?: string;
  themeVarNames?: readonly string[];
};

export function FloatingWordCard({
  anchor,
  "aria-label": ariaLabel = "Word definition",
  children,
  className,
  keepOpenOnContextMenuSelector = ".reading-minimal-word, .video-study__word, .reading-pdf-viewer__text-layer",
  onClose,
  placementKey,
  portalTarget,
  style,
  themeScopeSelector,
  themeVarNames,
}: FloatingWordCardProps) {
  const cardRef = useRef<HTMLElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const handleClose = useCallback(() => {
    onCloseRef.current();
  }, []);

  const { applyClampedPosition, getPosition, maxHeight, position } =
    useFloatingWordCardPosition({
      anchor,
      cardRef,
      draggingRef,
      placementKey,
    });

  const { endDrag, handlePointerDown, handlePointerMove, isDragging } =
    useFloatingWordCardDrag({
      cardRef,
      draggingRef,
      getPosition,
      onMove: applyClampedPosition,
    });

  useFloatingWordCardDismiss({
    cardRef,
    isBlockedRef: draggingRef,
    keepOpenOnContextMenuSelector,
    onClose: handleClose,
  });

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || !themeScopeSelector || !themeVarNames?.length) {
      return;
    }
    applyThemeVarsFromScope(surface, themeScopeSelector, themeVarNames);
  }, [placementKey, themeScopeSelector, themeVarNames]);

  const card = (
    <aside
      aria-label={ariaLabel}
      className="floating-word-card"
      data-dragging={isDragging ? "true" : "false"}
      data-open="true"
      onPointerCancel={endDrag}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      ref={cardRef}
      style={{
        left: position.left,
        maxHeight,
        position: "fixed",
        top: position.top,
        zIndex: style?.zIndex ?? 10000,
      }}
    >
      <div
        className={["floating-word-card__surface", className]
          .filter(Boolean)
          .join(" ")}
        ref={surfaceRef}
        style={{
          ...style,
          maxHeight: style?.maxHeight ?? maxHeight,
        }}
      >
        {children}
      </div>
    </aside>
  );

  if (typeof document === "undefined") {
    return card;
  }

  return createPortal(card, portalTarget ?? document.body);
}
