"use client";

import { useEffect, useRef, type RefObject } from "react";

type UseFloatingWordCardDismissOptions = {
  cardRef: RefObject<HTMLElement | null>;
  /**
   * While true, outside pointerdowns are ignored (e.g. mid-drag).
   */
  isBlockedRef: RefObject<boolean>;
  /**
   * Right-clicks on these selectors replace the card instead of dismissing first.
   */
  keepOpenOnContextMenuSelector: string;
  onClose: () => void;
};

/**
 * Dismiss a floating word card on outside pointerdown (capture) or Escape.
 */
export function useFloatingWordCardDismiss({
  cardRef,
  isBlockedRef,
  keepOpenOnContextMenuSelector,
  onClose,
}: UseFloatingWordCardDismissOptions) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    function handlePointerDownCapture(event: PointerEvent) {
      if (isBlockedRef.current) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (cardRef.current?.contains(target)) {
        return;
      }

      if (
        event.button === 2 &&
        target instanceof Element &&
        target.closest(keepOpenOnContextMenuSelector)
      ) {
        return;
      }

      onCloseRef.current();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
      }
    }

    document.addEventListener("pointerdown", handlePointerDownCapture, true);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener(
        "pointerdown",
        handlePointerDownCapture,
        true,
      );
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [cardRef, isBlockedRef, keepOpenOnContextMenuSelector]);
}
