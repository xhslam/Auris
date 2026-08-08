import { DEFAULT_DESKTOP_AI_DOCK_STATE } from "@/features/app-runtime/app-runtime-storage";

export const DESKTOP_AI_DOCK_COLLAPSED_WIDTH = 20;
export const DESKTOP_AI_DOCK_DEFAULT_WIDTH = DEFAULT_DESKTOP_AI_DOCK_STATE.panelWidth;
export const DESKTOP_AI_DOCK_FALLBACK_VIEWPORT_WIDTH = 1440;
export const DESKTOP_AI_DOCK_MAIN_PANEL_MIN_WIDTH = 480;
export const DESKTOP_AI_DOCK_MIN_WIDTH = 360;
export const DESKTOP_AI_DOCK_SPLITTER_KEYBOARD_STEP = 32;
export const DESKTOP_AI_DOCK_SPLITTER_WIDTH = 6;

export function clampDesktopAiDockWidth(
  requestedWidth: number,
  viewportWidth: number,
) {
  const safeViewportWidth =
    viewportWidth > 0 ? viewportWidth : DESKTOP_AI_DOCK_FALLBACK_VIEWPORT_WIDTH;
  const maximumWidth = Math.max(
    DESKTOP_AI_DOCK_MIN_WIDTH,
    safeViewportWidth -
      DESKTOP_AI_DOCK_MAIN_PANEL_MIN_WIDTH -
      DESKTOP_AI_DOCK_COLLAPSED_WIDTH -
      DESKTOP_AI_DOCK_SPLITTER_WIDTH,
  );

  return Math.min(
    Math.max(Math.round(requestedWidth), DESKTOP_AI_DOCK_MIN_WIDTH),
    maximumWidth,
  );
}

export function getDesktopAiDockShellWidth(
  isOpen: boolean,
  panelWidth: number,
  viewportWidth: number,
) {
  if (!isOpen) {
    return DESKTOP_AI_DOCK_COLLAPSED_WIDTH;
  }

  return (
    DESKTOP_AI_DOCK_COLLAPSED_WIDTH +
    DESKTOP_AI_DOCK_SPLITTER_WIDTH +
    clampDesktopAiDockWidth(panelWidth, viewportWidth)
  );
}
