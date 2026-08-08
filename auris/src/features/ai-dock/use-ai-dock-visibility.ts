"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
} from "react";

export const DESKTOP_AI_DOCK_HIDE_DELAY_MS = 200;
export const DESKTOP_AI_DOCK_REVEAL_ZONE_PX = 24;

type UseAiDockVisibilityInput = {
  isOpen: boolean;
};

export function useAiDockVisibility(input: UseAiDockVisibilityInput) {
  const hideDockTimeoutRef = useRef<number | null>(null);
  const isDockFocusLockedRef = useRef(false);
  const [isDockRevealed, setIsDockRevealed] = useState(input.isOpen);

  const clearHideDockTimeout = useCallback(() => {
    if (hideDockTimeoutRef.current === null || typeof window === "undefined") {
      return;
    }

    window.clearTimeout(hideDockTimeoutRef.current);
    hideDockTimeoutRef.current = null;
  }, []);

  const revealDock = useCallback(() => {
    clearHideDockTimeout();
    setIsDockRevealed(true);
  }, [clearHideDockTimeout]);

  const scheduleHideDock = useCallback(() => {
    if (
      typeof window === "undefined" ||
      input.isOpen ||
      isDockFocusLockedRef.current
    ) {
      return;
    }

    clearHideDockTimeout();
    hideDockTimeoutRef.current = window.setTimeout(() => {
      if (!input.isOpen && !isDockFocusLockedRef.current) {
        setIsDockRevealed(false);
      }

      hideDockTimeoutRef.current = null;
    }, DESKTOP_AI_DOCK_HIDE_DELAY_MS);
  }, [clearHideDockTimeout, input.isOpen]);

  const handleDockFocusCapture = useCallback(() => {
    isDockFocusLockedRef.current = true;
    revealDock();
  }, [revealDock]);

  const handleDockBlurCapture = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      const nextFocusedElement = event.relatedTarget;

      if (
        nextFocusedElement &&
        event.currentTarget.contains(nextFocusedElement as Node)
      ) {
        return;
      }

      isDockFocusLockedRef.current = false;
      scheduleHideDock();
    },
    [scheduleHideDock],
  );

  useEffect(() => {
    if (input.isOpen) {
      revealDock();
    }
  }, [input.isOpen, revealDock]);

  useEffect(() => {
    if (typeof window === "undefined" || input.isOpen) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const viewportWidth = window.innerWidth;

      if (viewportWidth <= 0) {
        return;
      }

      if (event.clientX >= viewportWidth - DESKTOP_AI_DOCK_REVEAL_ZONE_PX) {
        revealDock();
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [input.isOpen, revealDock]);

  useEffect(() => {
    return () => {
      clearHideDockTimeout();
    };
  }, [clearHideDockTimeout]);

  return {
    handleDockBlurCapture,
    handleDockFocusCapture,
    isDockRevealed,
    isDockVisible: input.isOpen || isDockRevealed,
    revealDock,
    scheduleHideDock,
  };
}
