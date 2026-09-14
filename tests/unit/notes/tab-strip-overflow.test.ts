import { describe, expect, it } from "vitest";
import {
  getTabStripOverflowState,
  TAB_OVERFLOW_EPSILON,
} from "@/features/notes/workspace/tab-strip-overflow";

describe("tab strip overflow", () => {
  it("does not report overflow before layout", () => {
    expect(
      getTabStripOverflowState({ scrollLeft: 0, clientWidth: 0, scrollWidth: 500 }),
    ).toEqual({ canScrollLeft: false, canScrollRight: false });
  });

  it("reports both directions in the middle", () => {
    expect(
      getTabStripOverflowState({ scrollLeft: 80, clientWidth: 200, scrollWidth: 500 }),
    ).toEqual({ canScrollLeft: true, canScrollRight: true });
  });

  it("absorbs rubber-band negatives and fractional end noise", () => {
    expect(
      getTabStripOverflowState({ scrollLeft: -12, clientWidth: 200, scrollWidth: 400 }),
    ).toEqual({ canScrollLeft: false, canScrollRight: true });
    expect(
      getTabStripOverflowState({
        scrollLeft: 200,
        clientWidth: 200,
        scrollWidth: 400 + TAB_OVERFLOW_EPSILON,
      }),
    ).toEqual({ canScrollLeft: true, canScrollRight: false });
  });
});
