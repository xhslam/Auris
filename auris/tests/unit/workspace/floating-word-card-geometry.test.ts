import { describe, expect, it } from "vitest";
import {
  WORD_CARD_VIEWPORT_MARGIN,
  centerWordCardPosition,
  clampWordCardPosition,
  proposeWordCardPosition,
} from "@/components/workspace/floating-word-card-geometry";

describe("centerWordCardPosition", () => {
  it("centers the card in the viewport", () => {
    expect(
      centerWordCardPosition(540, 560, { width: 1440, height: 900 }),
    ).toEqual({ left: 450, top: 170 });
  });

  it("keeps an oversized card within the viewport margin", () => {
    expect(
      centerWordCardPosition(900, 700, { width: 800, height: 600 }),
    ).toEqual({
      left: WORD_CARD_VIEWPORT_MARGIN,
      top: WORD_CARD_VIEWPORT_MARGIN,
    });
  });
});

describe("clampWordCardPosition", () => {
  it("keeps the card inside the viewport with a safety margin", () => {
    expect(
      clampWordCardPosition(2000, 2000, 560, 360, { width: 1200, height: 800 }),
    ).toEqual({
      left: 1200 - 560 - WORD_CARD_VIEWPORT_MARGIN,
      top: 800 - 360 - WORD_CARD_VIEWPORT_MARGIN,
    });

    expect(
      clampWordCardPosition(-40, -20, 560, 360, { width: 1200, height: 800 }),
    ).toEqual({
      left: WORD_CARD_VIEWPORT_MARGIN,
      top: WORD_CARD_VIEWPORT_MARGIN,
    });
  });
});

describe("proposeWordCardPosition", () => {
  it("prefers the bottom-right of the anchor when space allows", () => {
    expect(
      proposeWordCardPosition(
        { x: 100, y: 80 },
        560,
        360,
        { width: 1400, height: 900 },
      ),
    ).toEqual({
      left: 112,
      top: 92,
    });
  });

  it("flips to the left when the right edge is too close", () => {
    const position = proposeWordCardPosition(
      { x: 1100, y: 100 },
      560,
      360,
      { width: 1200, height: 800 },
    );

    expect(position.left).toBeLessThan(1100);
    expect(position.left).toBeGreaterThanOrEqual(WORD_CARD_VIEWPORT_MARGIN);
    expect(position.left + 560).toBeLessThanOrEqual(
      1200 - WORD_CARD_VIEWPORT_MARGIN,
    );
  });

  it("flips upward when the bottom edge is too close", () => {
    const position = proposeWordCardPosition(
      { x: 200, y: 760 },
      560,
      360,
      { width: 1200, height: 800 },
    );

    expect(position.top).toBeLessThan(760);
    expect(position.top).toBeGreaterThanOrEqual(WORD_CARD_VIEWPORT_MARGIN);
    expect(position.top + 360).toBeLessThanOrEqual(
      800 - WORD_CARD_VIEWPORT_MARGIN,
    );
  });
});
