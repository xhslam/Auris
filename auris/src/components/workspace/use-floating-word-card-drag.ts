"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

type DragSession = {
  pointerId: number;
  originLeft: number;
  originTop: number;
  startX: number;
  startY: number;
};

type UseFloatingWordCardDragOptions = {
  cardRef: RefObject<HTMLElement | null>;
  draggingRef: RefObject<boolean>;
  getPosition: () => { left: number; top: number };
  onMove: (left: number, top: number) => void;
};

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(
    target.closest(
      "button, a, input, textarea, select, label, [data-word-card-no-drag]",
    ),
  );
}

/**
 * Title-bar drag via Pointer Events + setPointerCapture.
 * Only elements marked `[data-word-card-drag-handle]` start a drag.
 */
export function useFloatingWordCardDrag({
  cardRef,
  draggingRef,
  getPosition,
  onMove,
}: UseFloatingWordCardDragOptions) {
  const dragSessionRef = useRef<DragSession | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    return () => {
      document.body.style.userSelect = previousUserSelect;
    };
  }, [isDragging]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) {
        return;
      }
      if (isInteractiveTarget(event.target)) {
        return;
      }
      if (
        !(event.target instanceof Element) ||
        !event.target.closest("[data-word-card-drag-handle]")
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const node = cardRef.current;
      if (!node) {
        return;
      }

      const position = getPosition();
      if (typeof node.setPointerCapture === "function") {
        node.setPointerCapture(event.pointerId);
      }
      dragSessionRef.current = {
        pointerId: event.pointerId,
        originLeft: position.left,
        originTop: position.top,
        startX: event.clientX,
        startY: event.clientY,
      };
      draggingRef.current = true;
      setIsDragging(true);
    },
    [cardRef, draggingRef, getPosition],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const session = dragSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      onMove(
        session.originLeft + (event.clientX - session.startX),
        session.originTop + (event.clientY - session.startY),
      );
    },
    [onMove],
  );

  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const session = dragSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) {
        return;
      }

      dragSessionRef.current = null;
      draggingRef.current = false;
      setIsDragging(false);

      const node = cardRef.current;
      if (node && typeof node.releasePointerCapture === "function") {
        try {
          node.releasePointerCapture(event.pointerId);
        } catch {
          // Pointer may already be released.
        }
      }
    },
    [cardRef, draggingRef],
  );

  return {
    endDrag,
    handlePointerDown,
    handlePointerMove,
    isDragging,
  };
}
