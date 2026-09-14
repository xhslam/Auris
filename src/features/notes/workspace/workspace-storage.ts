import { createWorkspaceState } from "@/features/notes/workspace/workspace-store";
import type { NotesEditorMode } from "@/features/notes/editor/editor-types";
import type { NotesWorkspaceState } from "@/features/notes/workspace/workspace-types";

const NOTES_WORKSPACE_STORAGE_KEY = "shadowing-notes-workspace-v2";

function sanitizePaths(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function sanitizeLeftSidebarMode(
  value: unknown,
): NotesWorkspaceState["leftSidebarMode"] {
  return value === "files" || value === "outline" || value === "search"
    ? value
    : "files";
}

function sanitizeRightSidebarMode(
  value: unknown,
): NotesWorkspaceState["rightSidebarMode"] {
  return value === "backlinks" ||
    value === "learning" ||
    value === "properties" ||
    value === "terminal"
    ? value
    : "properties";
}

function sanitizeEditorModesByPath(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, NotesEditorMode] =>
        typeof entry[0] === "string" &&
        (entry[1] === "source" || entry[1] === "split" || entry[1] === "wysiwyg"),
    ),
  );
}

export function loadWorkspaceState(
  storage: Storage | null,
): NotesWorkspaceState {
  const fallback = createWorkspaceState();

  if (!storage) {
    return fallback;
  }

  const raw = storage.getItem(NOTES_WORKSPACE_STORAGE_KEY);

  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<NotesWorkspaceState>;
    return sanitizeWorkspaceState(parsed);
  } catch {
    return fallback;
  }
}

export function sanitizeWorkspaceState(
  parsed: Partial<NotesWorkspaceState> | null | undefined,
): NotesWorkspaceState {
  if (!parsed || typeof parsed !== "object") {
    return createWorkspaceState();
  }
  return {
    activePath:
      typeof parsed.activePath === "string" ? parsed.activePath : null,
    commandHistory: sanitizePaths(parsed.commandHistory),
    editorModesByPath: sanitizeEditorModesByPath(parsed.editorModesByPath),
    leftSidebarCollapsed: Boolean(parsed.leftSidebarCollapsed),
    leftSidebarMode: sanitizeLeftSidebarMode(parsed.leftSidebarMode),
    openTabs: sanitizePaths(parsed.openTabs),
    pinnedTabs: sanitizePaths(parsed.pinnedTabs),
    recentFiles: sanitizePaths(parsed.recentFiles),
    rightSidebarCollapsed: Boolean(parsed.rightSidebarCollapsed),
    rightSidebarMode: sanitizeRightSidebarMode(parsed.rightSidebarMode),
  };
}

export function saveWorkspaceState(
  storage: Storage | null,
  state: NotesWorkspaceState,
) {
  if (!storage) {
    return;
  }

  storage.setItem(
    NOTES_WORKSPACE_STORAGE_KEY,
    JSON.stringify({
      ...state,
      commandHistory: state.commandHistory.slice(0, 12),
      openTabs: state.openTabs.slice(0, 12),
      recentFiles: state.recentFiles.slice(0, 20),
    }),
  );
}
