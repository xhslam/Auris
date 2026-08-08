import type { NotesEditorMode } from "@/features/notes/editor/editor-types";

export type NotesLeftSidebarMode = "files" | "outline" | "search";

export type NotesRightSidebarMode =
  | "backlinks"
  | "learning"
  | "properties"
  | "terminal";

export type NotesWorkspaceState = {
  activePath: string | null;
  commandHistory: string[];
  editorModesByPath: Record<string, NotesEditorMode>;
  leftSidebarCollapsed: boolean;
  leftSidebarMode: NotesLeftSidebarMode;
  openTabs: string[];
  pinnedTabs: string[];
  recentFiles: string[];
  rightSidebarCollapsed: boolean;
  rightSidebarMode: NotesRightSidebarMode;
};
