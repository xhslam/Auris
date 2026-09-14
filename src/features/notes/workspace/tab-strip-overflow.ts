export const TAB_OVERFLOW_EPSILON = 0.5;

export type TabStripOverflowState = {
  canScrollLeft: boolean;
  canScrollRight: boolean;
};

export function getTabStripOverflowState(input: {
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
}): TabStripOverflowState {
  if (!(input.clientWidth > 0)) {
    return { canScrollLeft: false, canScrollRight: false };
  }
  const left = Math.max(0, input.scrollLeft);
  return {
    canScrollLeft: left > TAB_OVERFLOW_EPSILON,
    canScrollRight:
      input.scrollWidth - input.clientWidth - left > TAB_OVERFLOW_EPSILON,
  };
}
