export const WORD_CARD_VIEWPORT_MARGIN = 12;
export const WORD_CARD_ANCHOR_GAP = 12;
/** Matches reading/video card CSS: min(560px, 100vw - 24px). */
export const WORD_CARD_DEFAULT_WIDTH = 560;
export const WORD_CARD_DEFAULT_HEIGHT = 360;

export type WordCardPoint = {
  x: number;
  y: number;
};

export type WordCardRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type WordCardViewport = {
  width: number;
  height: number;
};

/**
 * Clamp a card's top-left so the full card stays inside the viewport with a margin.
 */
export function clampWordCardPosition(
  left: number,
  top: number,
  cardWidth: number,
  cardHeight: number,
  viewport: WordCardViewport,
  margin = WORD_CARD_VIEWPORT_MARGIN,
): { left: number; top: number } {
  const maxLeft = Math.max(margin, viewport.width - cardWidth - margin);
  const maxTop = Math.max(margin, viewport.height - cardHeight - margin);

  return {
    left: Math.min(Math.max(left, margin), maxLeft),
    top: Math.min(Math.max(top, margin), maxTop),
  };
}

/**
 * Propose an initial card position near an anchor (prefer bottom-right),
 * flipping left/up when space is tight, then clamping into the viewport.
 */
export function proposeWordCardPosition(
  anchor: WordCardPoint,
  cardWidth: number,
  cardHeight: number,
  viewport: WordCardViewport,
  options?: {
    gap?: number;
    margin?: number;
  },
): { left: number; top: number } {
  const gap = options?.gap ?? WORD_CARD_ANCHOR_GAP;
  const margin = options?.margin ?? WORD_CARD_VIEWPORT_MARGIN;

  const preferRight = anchor.x + gap + cardWidth <= viewport.width - margin;
  const left = preferRight
    ? anchor.x + gap
    : anchor.x - gap - cardWidth;

  const preferBelow = anchor.y + gap + cardHeight <= viewport.height - margin;
  const top = preferBelow
    ? anchor.y + gap
    : anchor.y - gap - cardHeight;

  return clampWordCardPosition(
    left,
    top,
    cardWidth,
    cardHeight,
    viewport,
    margin,
  );
}

export function getWordCardMaxHeight(
  top: number,
  viewportHeight: number,
  margin = WORD_CARD_VIEWPORT_MARGIN,
) {
  return Math.max(160, viewportHeight - top - margin);
}
