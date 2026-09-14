"use client";

import { useEffect, useState, type RefObject } from "react";
import {
  getTabStripOverflowState,
  type TabStripOverflowState,
} from "@/features/notes/workspace/tab-strip-overflow";

const NONE: TabStripOverflowState = {
  canScrollLeft: false,
  canScrollRight: false,
};

export function useNotesTabOverflow(
  ref: RefObject<HTMLElement | null>,
): TabStripOverflowState {
  const [state, setState] = useState<TabStripOverflowState>(NONE);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const read = () => {
      const next = getTabStripOverflowState({
        scrollLeft: node.scrollLeft,
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
      });
      setState((current) =>
        current.canScrollLeft === next.canScrollLeft &&
        current.canScrollRight === next.canScrollRight
          ? current
          : next,
      );
    };

    const resize =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(read);
    resize?.observe(node);
    if (node.firstElementChild) resize?.observe(node.firstElementChild);
    const mutation =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(read);
    mutation?.observe(node, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    node.addEventListener("scroll", read, { passive: true });
    read();

    return () => {
      resize?.disconnect();
      mutation?.disconnect();
      node.removeEventListener("scroll", read);
    };
  }, [ref]);

  return state;
}
