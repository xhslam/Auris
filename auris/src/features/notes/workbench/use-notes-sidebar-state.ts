"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspacePersistence } from "@/components/notes-v2/use-workspace-persistence";
import {
  closeWorkspacePath,
  getEditorMode,
  setEditorMode,
  openWorkspacePath,
  recordWorkspaceCommand,
  setLeftSidebarCollapsed,
  setLeftSidebarMode,
  setRightSidebarCollapsed,
  setRightSidebarMode,
} from "@/features/notes/workspace/workspace-store";
import type { NotesEditorMode } from "@/features/notes/editor/editor-types";
import type { NotesRightSidebarMode } from "@/features/notes/workspace/workspace-types";

export function useNotesSidebarState() {
  const [workspace, setWorkspace] = useWorkspacePersistence();
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [learningQuery, setLearningQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [editorActiveLine, setEditorActiveLine] = useState(0);
  const [historyStack, setHistoryStack] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const historyStackRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);

  const recordHistoryPath = useCallback((path: string) => {
    const currentStack = historyStackRef.current;
    const currentIndex = historyIndexRef.current;

    if (currentStack[currentIndex] === path) {
      return;
    }

    const nextStack = [...currentStack.slice(0, currentIndex + 1), path];
    const nextIndex = nextStack.length - 1;

    historyStackRef.current = nextStack;
    historyIndexRef.current = nextIndex;
    setHistoryStack(nextStack);
    setHistoryIndex(nextIndex);
  }, []);

  useEffect(() => {
    if (!workspace.activePath || historyStackRef.current.length > 0) {
      return;
    }

    recordHistoryPath(workspace.activePath);
  }, [recordHistoryPath, workspace.activePath]);

  const handleOpenPath = useCallback(
    (path: string) => {
      recordHistoryPath(path);
      setWorkspace((current) => openWorkspacePath(current, path));
    },
    [recordHistoryPath, setWorkspace],
  );

  const handleGoBack = useCallback(() => {
    const nextIndex = historyIndexRef.current - 1;
    const path = historyStackRef.current[nextIndex];

    if (!path) {
      return;
    }

    historyIndexRef.current = nextIndex;
    setHistoryIndex(nextIndex);
    setWorkspace((current) => openWorkspacePath(current, path));
  }, [setWorkspace]);

  const handleGoForward = useCallback(() => {
    const nextIndex = historyIndexRef.current + 1;
    const path = historyStackRef.current[nextIndex];

    if (!path) {
      return;
    }

    historyIndexRef.current = nextIndex;
    setHistoryIndex(nextIndex);
    setWorkspace((current) => openWorkspacePath(current, path));
  }, [setWorkspace]);

  const handleClosePath = useCallback(
    (path: string) => {
      setWorkspace((current) => closeWorkspacePath(current, path));
    },
    [setWorkspace],
  );

  const handleSetRightSidebarMode = useCallback(
    (mode: NotesRightSidebarMode) => {
      setWorkspace((current) => setRightSidebarMode(current, mode));
    },
    [setWorkspace],
  );

  const handleSetRightSidebarCollapsed = useCallback(
    (collapsed: boolean) => {
      setWorkspace((current) => setRightSidebarCollapsed(current, collapsed));
    },
    [setWorkspace],
  );

  const handleSetEditorMode = useCallback(
    (mode: NotesEditorMode) => {
      setWorkspace((current) =>
        current.activePath
          ? setEditorMode(current, current.activePath, mode)
          : current,
      );
    },
    [setWorkspace],
  );

  const handleSetLeftSidebarCollapsed = useCallback(
    (collapsed: boolean) => {
      setWorkspace((current) => setLeftSidebarCollapsed(current, collapsed));
    },
    [setWorkspace],
  );

  const handleSetLeftSidebarMode = useCallback(
    (mode: "files" | "outline" | "search") => {
      setWorkspace((current) =>
        setLeftSidebarCollapsed(setLeftSidebarMode(current, mode), false),
      );
    },
    [setWorkspace],
  );

  const handleCommand = useCallback(
    (commandId: string, action: () => void) => {
      setWorkspace((current) => recordWorkspaceCommand(current, commandId));
      action();
    },
    [setWorkspace],
  );

  return {
    editorActiveLine,
    handleClosePath,
    handleCommand,
    handleGoBack,
    handleGoForward,
    handleOpenPath,
    handleSetLeftSidebarCollapsed,
    handleSetLeftSidebarMode,
    handleSetEditorMode,
    handleSetRightSidebarCollapsed,
    handleSetRightSidebarMode,
    isCommandPaletteOpen,
    learningQuery,
    canGoBack: historyIndex > 0,
    canGoForward: historyIndex >= 0 && historyIndex < historyStack.length - 1,
    editorMode: getEditorMode(workspace, workspace.activePath),
    searchQuery,
    setCommandPaletteOpen,
    setEditorActiveLine,
    setLearningQuery,
    setSearchQuery,
    setWorkspace,
    workspace,
  };
}
