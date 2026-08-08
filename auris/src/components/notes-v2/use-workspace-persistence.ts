"use client";

import { useEffect, useState } from "react";
import { createWorkspaceState } from "@/features/notes/workspace/workspace-store";
import {
  loadWorkspaceState,
  saveWorkspaceState,
} from "@/features/notes/workspace/workspace-storage";
import type { NotesWorkspaceState } from "@/features/notes/workspace/workspace-types";

export function useWorkspacePersistence() {
  const [workspace, setWorkspace] = useState<NotesWorkspaceState>(() =>
    createWorkspaceState(),
  );
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setWorkspace(loadWorkspaceState(window.localStorage));
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !hasHydrated) {
      return;
    }

    saveWorkspaceState(window.localStorage, workspace);
  }, [hasHydrated, workspace]);

  return [workspace, setWorkspace] as const;
}
