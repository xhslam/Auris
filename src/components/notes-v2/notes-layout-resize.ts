import type { NotesRightSidebarMode } from "@/features/notes/workspace/workspace-types";

export const NOTES_CENTER_FALLBACK_WIDTH = 1200;
export const NOTES_MAIN_PANEL_MIN_WIDTH = 320;
export const NOTES_RIGHT_SIDEBAR_DEFAULT_WIDTH = 280;
export const NOTES_RIGHT_SIDEBAR_MIN_WIDTH = 220;
export const NOTES_RIGHT_TERMINAL_DEFAULT_WIDTH = 620;
export const NOTES_RIGHT_TERMINAL_MIN_WIDTH = 360;
export const NOTES_BROWSER_SIDEPANE_DEFAULT_WIDTH = 520;
/** 浏览器 chrome 在此宽度以下会挤压地址栏与新建模式选择。 */
export const NOTES_BROWSER_SIDEPANE_MIN_WIDTH = 400;
/** 防止浏览器拖得过宽而让笔记退化为窄栏。 */
export const NOTES_BROWSER_SIDEPANE_MAX_WIDTH = 640;
/** SidePane 分隔条的实际视觉宽度；与 globals.css 保持一致。 */
export const NOTES_BROWSER_SIDEPANE_SPLITTER_WIDTH = 8;
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

/**
 * 受管浏览器作为笔记画布的并排 SidePane 时，保留可编辑的最小笔记宽度。
 * 它不与终端同时展开，因此可复用与现有右侧面板相同的空间预算。
 */
export function clampBrowserSidePaneWidth(
  requestedWidth: number,
  containerWidth: number,
) {
  const safeContainerWidth =
    containerWidth > 0 ? containerWidth : NOTES_CENTER_FALLBACK_WIDTH;
  const structuralMaximum =
    safeContainerWidth -
    NOTES_MAIN_PANEL_MIN_WIDTH -
    NOTES_BROWSER_SIDEPANE_SPLITTER_WIDTH;
  const maximumWidth = Math.max(
    NOTES_BROWSER_SIDEPANE_MIN_WIDTH,
    Math.min(NOTES_BROWSER_SIDEPANE_MAX_WIDTH, structuralMaximum),
  );

  return Math.min(
    Math.max(Math.round(requestedWidth), NOTES_BROWSER_SIDEPANE_MIN_WIDTH),
    maximumWidth,
  );
}
