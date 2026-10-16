"use client";

import { useEffect, type RefObject } from "react";
import {
  findNotesScrollContainer,
  getNotesScrollOffset,
  getNotesScrollNavigationVersion,
  restoreNotesScroll,
  trackNotesScroll,
  type NotesScrollSurface,
} from "@/features/notes/editor/notes-scroll-memory";

type UseNotesScrollMemoryOptions = {
  enabled: boolean;
  hostRef: RefObject<HTMLElement | null>;
  path: string | null | undefined;
  surface: NotesScrollSurface;
};

/**
 * Makes an editor surface resume the reader's place after a tab, mode, or
 * component remount. Each caller supplies the physical surface it owns so
 * source, WYSIWYG and preview positions never overwrite one another.
 */
export function useNotesScrollMemory({
  enabled,
  hostRef,
  path,
  surface,
}: UseNotesScrollMemoryOptions): void {
  useEffect(() => {
    if (!enabled || !path) {
      return;
    }

    let stopTracking: (() => void) | undefined;
    const navigationVersion = getNotesScrollNavigationVersion();
    const frame = requestAnimationFrame(() => {
      const container = findNotesScrollContainer(hostRef.current);
      if (!container) {
        return;
      }
      // A bridge jump can happen before this first layout frame. Do not let
      // mount-time reading memory reclaim its viewport (VMark #1561).
      if (getNotesScrollNavigationVersion() === navigationVersion) {
        restoreNotesScroll(container, getNotesScrollOffset(path, surface));
      }
      stopTracking = trackNotesScroll(container, path, surface);
    });

    return () => {
      cancelAnimationFrame(frame);
      stopTracking?.();
    };
  }, [enabled, hostRef, path, surface]);
}
