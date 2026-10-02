import type { NotesWorkspaceState } from "@/features/notes/workspace/workspace-types";
import type { NotesEditorMode } from "@/features/notes/editor/editor-types";

export function createWorkspaceState(): NotesWorkspaceState {
  return {
    activePath: null,
    commandHistory: [],
    editorModesByPath: {},
    leftSidebarCollapsed: false,
    leftSidebarMode: "files",
    openTabs: [],
    pinnedTabs: [],
    recentFiles: [],
    rightSidebarCollapsed: false,
    rightSidebarMode: "properties",
  };
}

function pushUnique(values: string[], nextValue: string, limit: number) {
  return [nextValue, ...values.filter((value) => value !== nextValue)].slice(
    0,
    limit,
  );
}

/** Resolve the most recently active tab other than the current one. */
export function getLastUsedOpenTab(
  state: Pick<NotesWorkspaceState, "activePath" | "openTabs" | "recentFiles">,
): string | null {
  return (
    state.recentFiles.find(
      (path) => path !== state.activePath && state.openTabs.includes(path),
    ) ?? null
  );
}

export function openWorkspacePath(
  state: NotesWorkspaceState,
  path: string,
): NotesWorkspaceState {
  return {
    ...state,
    activePath: path,
    openTabs: state.openTabs.includes(path)
      ? state.openTabs
      : [...state.openTabs, path],
    recentFiles: pushUnique(state.recentFiles, path, 20),
  };
}

export function closeWorkspacePath(
  state: NotesWorkspaceState,
  path: string,
): NotesWorkspaceState {
  const nextTabs = state.openTabs.filter((tabPath) => tabPath !== path);

  return {
    ...state,
    activePath:
      state.activePath === path
        ? (nextTabs.at(-1) ??
          state.recentFiles.find((item) => item !== path) ??
          null)
        : state.activePath,
    openTabs: nextTabs,
    pinnedTabs: state.pinnedTabs.filter((tabPath) => tabPath !== path),
  };
}

export function setRightSidebarMode(
  state: NotesWorkspaceState,
  mode: NotesWorkspaceState["rightSidebarMode"],
): NotesWorkspaceState {
  return {
    ...state,
    rightSidebarCollapsed: false,
    rightSidebarMode: mode,
  };
}

export function setEditorMode(
  state: NotesWorkspaceState,
  path: string,
  mode: NotesEditorMode,
): NotesWorkspaceState {
  return {
    ...state,
    editorModesByPath: {
      ...state.editorModesByPath,
      [path]: mode,
    },
  };
}

export function getEditorMode(
  state: NotesWorkspaceState,
  path: string | null,
): NotesEditorMode {
  return path ? (state.editorModesByPath[path] ?? "wysiwyg") : "wysiwyg";
}

export function setRightSidebarCollapsed(
  state: NotesWorkspaceState,
  collapsed: boolean,
): NotesWorkspaceState {
  return {
    ...state,
    rightSidebarCollapsed: collapsed,
  };
}

export function setLeftSidebarCollapsed(
  state: NotesWorkspaceState,
  collapsed: boolean,
): NotesWorkspaceState {
  return {
    ...state,
    leftSidebarCollapsed: collapsed,
  };
}

export function setLeftSidebarMode(
  state: NotesWorkspaceState,
  mode: NotesWorkspaceState["leftSidebarMode"],
): NotesWorkspaceState {
  return {
    ...state,
    leftSidebarMode: mode,
  };
}

export function recordWorkspaceCommand(
  state: NotesWorkspaceState,
  commandId: string,
): NotesWorkspaceState {
  return {
    ...state,
    commandHistory: pushUnique(state.commandHistory, commandId, 12),
  };
}

function isPathOrChild(path: string, targetPath: string) {
  return path === targetPath || path.startsWith(`${targetPath}/`);
}

function replacePath(value: string, fromPath: string, toPath: string) {
  if (value === fromPath) {
    return toPath;
  }

  if (value.startsWith(`${fromPath}/`)) {
    return `${toPath}/${value.slice(fromPath.length + 1)}`;
  }

  return value;
}

function renameEditorModes(
  editorModesByPath: Record<string, NotesEditorMode>,
  fromPath: string,
  toPath: string,
) {
  return Object.fromEntries(
    Object.entries(editorModesByPath).map(([path, mode]) => [
      replacePath(path, fromPath, toPath),
      mode,
    ]),
  );
}

export function renameWorkspacePath(
  state: NotesWorkspaceState,
  fromPath: string,
  toPath: string,
): NotesWorkspaceState {
  return {
    ...state,
    activePath: state.activePath
      ? replacePath(state.activePath, fromPath, toPath)
      : state.activePath,
    editorModesByPath: renameEditorModes(
      state.editorModesByPath,
      fromPath,
      toPath,
    ),
    openTabs: [...new Set(state.openTabs.map((path) => replacePath(path, fromPath, toPath)))],
    pinnedTabs: [...new Set(state.pinnedTabs.map((path) => replacePath(path, fromPath, toPath)))],
    recentFiles: [...new Set(state.recentFiles.map((path) => replacePath(path, fromPath, toPath)))],
  };
}

export function removeWorkspacePath(
  state: NotesWorkspaceState,
  path: string,
): NotesWorkspaceState {
  const nextTabs = state.openTabs.filter((tabPath) => !isPathOrChild(tabPath, path));
  const nextRecentFiles = state.recentFiles.filter(
    (recentPath) => !isPathOrChild(recentPath, path),
  );

  return {
    ...state,
    activePath:
      state.activePath !== null && isPathOrChild(state.activePath, path)
        ? (nextTabs.at(-1) ?? nextRecentFiles[0] ?? null)
        : state.activePath,
    editorModesByPath: Object.fromEntries(
      Object.entries(state.editorModesByPath).filter(([editorPath]) =>
        !isPathOrChild(editorPath, path),
      ),
    ),
    openTabs: nextTabs,
    pinnedTabs: state.pinnedTabs.filter((tabPath) => !isPathOrChild(tabPath, path)),
    recentFiles: nextRecentFiles,
  };
}
