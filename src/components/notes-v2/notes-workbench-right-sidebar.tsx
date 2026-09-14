"use client";

import { NotesBacklinksPanel } from "@/components/notes-v2/notes-backlinks-panel";
import { NotesLearningPanel } from "@/components/notes-v2/notes-learning-panel";
import { NotesPropertiesPanel } from "@/components/notes-v2/notes-properties-panel";
import { NotesTerminalPanel } from "@/components/notes-v2/notes-terminal-panel";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import type { NoteOpenStrategy } from "@/features/notes/documents/note-open-strategy";
import type { NotesEditorSelectionState } from "@/features/notes/editor/editor-types";
import type { NotesEditorMode } from "@/features/notes/editor/editor-types";
import type { LearningSnippet } from "@/features/notes/integrations/learning-snippets";
import type { NotesDirectoryInfo } from "@/features/notes/note-types";
import type { NotesRightSidebarMode } from "@/features/notes/workspace/workspace-types";
import type {
  DesktopCommandRecord,
  DesktopTerminalBridge,
} from "@/platform/desktop/desktop-bridge";

type NotesWorkbenchRightSidebarProps = {
  backlinks: NoteDocument[];
  desktopCommands: DesktopCommandRecord[];
  desktopTerminal: DesktopTerminalBridge | null;
  directoryInfo?: NotesDirectoryInfo;
  isDesktopBridgeAvailable: boolean;
  lastRunCommandTitle: string | null;
  learningQuery: string;
  learningSnippets: LearningSnippet[];
  editorMode: NotesEditorMode;
  noteOpenStrategy?: NoteOpenStrategy | null;
  onInsertSnippet?: (snippet: string) => void;
  onLearningQueryChange?: (value: string) => void;
  onOpenPath: (path: string) => void;
  onRefreshDesktopCommands?: () => void;
  onRunDesktopCommand?: (commandId: string) => void;
  rightSidebarCollapsed: boolean;
  rightSidebarMode: NotesRightSidebarMode;
  selectionState?: NotesEditorSelectionState | null;
  activeDocument: NoteDocument | null;
};

export function NotesWorkbenchRightSidebar({
  activeDocument,
  backlinks,
  desktopCommands,
  desktopTerminal,
  directoryInfo,
  isDesktopBridgeAvailable,
  lastRunCommandTitle,
  learningQuery,
  learningSnippets,
  editorMode,
  noteOpenStrategy = null,
  onInsertSnippet,
  onLearningQueryChange,
  onOpenPath,
  onRefreshDesktopCommands,
  onRunDesktopCommand,
  rightSidebarCollapsed,
  rightSidebarMode,
  selectionState = null,
}: NotesWorkbenchRightSidebarProps) {
  const isRightTerminalActive =
    !rightSidebarCollapsed && rightSidebarMode === "terminal";

  return (
    <div
      className="notes-v2__sidebar-pane notes-v2__sidebar-pane--right"
      data-collapsed={rightSidebarCollapsed ? "true" : "false"}
      data-mode={rightSidebarMode}
      data-terminal={isRightTerminalActive ? "true" : "false"}
    >
      {!rightSidebarCollapsed && rightSidebarMode === "properties" ? (
        <NotesPropertiesPanel
          document={activeDocument}
          editorMode={editorMode}
          openStrategy={noteOpenStrategy}
          selection={selectionState}
        />
      ) : null}
      {!rightSidebarCollapsed && rightSidebarMode === "backlinks" ? (
        <NotesBacklinksPanel backlinks={backlinks} onOpenPath={onOpenPath} />
      ) : null}
      {!rightSidebarCollapsed && rightSidebarMode === "learning" ? (
        <NotesLearningPanel
          onInsertSnippet={(snippet) => onInsertSnippet?.(snippet)}
          onQueryChange={(value) => onLearningQueryChange?.(value)}
          query={learningQuery}
          snippets={learningSnippets}
        />
      ) : null}
      {!rightSidebarCollapsed && rightSidebarMode === "terminal" ? (
        <NotesTerminalPanel
          commands={desktopCommands}
          isDesktopBridgeAvailable={isDesktopBridgeAvailable}
          lastRunCommandTitle={lastRunCommandTitle}
          onRefreshCommands={onRefreshDesktopCommands}
          onRunCommand={onRunDesktopCommand}
          terminalBridge={desktopTerminal}
          terminalCwd={directoryInfo?.vaultPath ?? null}
        />
      ) : null}
    </div>
  );
}
