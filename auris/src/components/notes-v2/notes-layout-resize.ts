import type { NotesRightSidebarMode } from "@/features/notes/workspace/workspace-types";

export const NOTES_CENTER_FALLBACK_WIDTH = 1200;
export const NOTES_MAIN_PANEL_MIN_WIDTH = 320;
export const NOTES_RIGHT_SIDEBAR_DEFAULT_WIDTH = 280;
export const NOTES_RIGHT_SIDEBAR_MIN_WIDTH = 220;
export const NOTES_RIGHT_TERMINAL_DEFAULT_WIDTH = 620;
export const NOTES_RIGHT_TERMINAL_MIN_WIDTH = 360;
export const NOTES_SPLITTER_KEYBOARD_STEP = 32;
export const NOTES_SPLITTER_WIDTH = 6;

export function getMinimumRightSidebarWidth(mode: NotesRightSidebarMode) {
  return mode === "terminal"
    ? NOTES_RIGHT_TERMINAL_MIN_WIDTH
    : NOTES_RIGHT_SIDEBAR_MIN_WIDTH;
}

export function getDefaultRightSidebarWidth(mode: NotesRightSidebarMode) {
  return mode === "terminal"
    ? NOTES_RIGHT_TERMINAL_DEFAULT_WIDTH
    : NOTES_RIGHT_SIDEBAR_DEFAULT_WIDTH;
}

export function clampRightSidebarWidth(
  requestedWidth: number,
  containerWidth: number,
  mode: NotesRightSidebarMode,
) {
  const minimumWidth = getMinimumRightSidebarWidth(mode);
  const safeContainerWidth =
    containerWidth > 0 ? containerWidth : NOTES_CENTER_FALLBACK_WIDTH;
  const maximumWidth = Math.max(
    minimumWidth,
    safeContainerWidth - NOTES_MAIN_PANEL_MIN_WIDTH - NOTES_SPLITTER_WIDTH,
  );

  return Math.min(
    Math.max(Math.round(requestedWidth), minimumWidth),
    maximumWidth,
  );
}
