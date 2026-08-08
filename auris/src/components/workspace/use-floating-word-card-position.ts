"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  WORD_CARD_DEFAULT_HEIGHT,
  WORD_CARD_DEFAULT_WIDTH,
  clampWordCardPosition,
  getWordCardMaxHeight,
  proposeWordCardPosition,
} from "@/components/workspace/floating-word-card-geometry";

const WORD_CARD_VIEWPORT_FALLBACK_LEFT = 12;
const WORD_CARD_VIEWPORT_FALLBACK_TOP = 12;

type UseFloatingWordCardPositionOptions = {
  anchor: { x: number; y: number };
  cardRef: RefObject<HTMLElement | null>;
  /**
   * When true, resize-driven reclamps are skipped so drag stays smooth.
   */
  draggingRef: RefObject<boolean>;
  placementKey: string;
};

function getViewport() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

/**
 * Viewport-fixed placement: propose near anchor, then clamp using measured size.
 * Also reclamps on card resize and window resize.
 */
export function useFloatingWordCardPosition({
  anchor,
  cardRef,
  draggingRef,
  placementKey,
}: UseFloatingWordCardPositionOptions) {
  const positionRef = useRef({
    left: WORD_CARD_VIEWPORT_FALLBACK_LEFT,
    top: WORD_CARD_VIEWPORT_FALLBACK_TOP,
  });
  const [position, setPosition] = useState(() => {
    if (typeof window === "undefined") {
      return {
        left: WORD_CARD_VIEWPORT_FALLBACK_LEFT,
        top: WORD_CARD_VIEWPORT_FALLBACK_TOP,
      };
    }

    return proposeWordCardPosition(
      anchor,
      WORD_CARD_DEFAULT_WIDTH,
      WORD_CARD_DEFAULT_HEIGHT,
      getViewport(),
    );
  });
  const [maxHeight, setMaxHeight] = useState(() =>
    getWordCardMaxHeight(
      typeof window === "undefined"
        ? WORD_CARD_VIEWPORT_FALLBACK_TOP
        : position.top,
      typeof window === "undefined" ? 800 : window.innerHeight,
    ),
  );

  const applyClampedPosition = useCallback(
    (left: number, top: number) => {
      const node = cardRef.current;
      const viewport = getViewport();
      const width = node?.offsetWidth || WORD_CARD_DEFAULT_WIDTH;
      const height = node?.offsetHeight || WORD_CARD_DEFAULT_HEIGHT;
      const next = clampWordCardPosition(left, top, width, height, viewport);
      const nextMaxHeight = getWordCardMaxHeight(next.top, viewport.height);

      if (
        next.left !== positionRef.current.left ||
        next.top !== positionRef.current.top
      ) {
        positionRef.current = next;
        setPosition(next);
      }
      setMaxHeight((current) =>
        current === nextMaxHeight ? current : nextMaxHeight,
      );
    },
    [cardRef],
  );

  const reseatNearAnchor = useCallback(() => {
    const viewport = getViewport();
    const next = proposeWordCardPosition(
      { x: anchor.x, y: anchor.y },
      cardRef.current?.offsetWidth || WORD_CARD_DEFAULT_WIDTH,
      cardRef.current?.offsetHeight || WORD_CARD_DEFAULT_HEIGHT,
      viewport,
    );
    positionRef.current = next;
    setPosition(next);
    setMaxHeight(getWordCardMaxHeight(next.top, viewport.height));
  }, [anchor.x, anchor.y, cardRef]);

  useLayoutEffect(() => {
    positionRef.current = position;
  }, [position]);

  // Re-seed near the new anchor whenever the active lookup changes.
  useLayoutEffect(() => {
    reseatNearAnchor();
  }, [placementKey, reseatNearAnchor]);

  // After paint, re-measure real card size and correct placement/flip.
  useLayoutEffect(() => {
    const node = cardRef.current;
    if (!node) {
      return;
    }

    reseatNearAnchor();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (draggingRef.current) {
        return;
      }
      applyClampedPosition(positionRef.current.left, positionRef.current.top);
    });
    observer.observe(node);

    return () => observer.disconnect();
  }, [applyClampedPosition, cardRef, draggingRef, placementKey, reseatNearAnchor]);

  useLayoutEffect(() => {
    function reclampToViewport() {
      applyClampedPosition(positionRef.current.left, positionRef.current.top);
    }

    window.addEventListener("resize", reclampToViewport);
    return () => window.removeEventListener("resize", reclampToViewport);
  }, [applyClampedPosition]);

  const getPosition = useCallback(() => positionRef.current, []);

  return {
    applyClampedPosition,
    getPosition,
    maxHeight,
    position,
  };
}
