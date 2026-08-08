"use client";

import { useEffect, useState } from "react";
import { createWorkspaceState } from "@/features/notes/workspace/workspace-store";
import {
  loadWorkspaceState,
  sanitizeWorkspaceState,
  saveWorkspaceState,
} from "@/features/notes/workspace/workspace-storage";
import {
  captureNotesHotExitWorkspace,
  loadNotesHotExitWorkspace,
} from "@/features/notes/persistence/notes-recovery-store";
import type { NotesWorkspaceState } from "@/features/notes/workspace/workspace-types";

export function useWorkspacePersistence(vaultRoot: string | null = null) {
  const [workspace, setWorkspace] = useState<NotesWorkspaceState>(() =>
    createWorkspaceState(),
  );
  const [hydratedVaultKey, setHydratedVaultKey] = useState<string | null>(null);
  const vaultKey = vaultRoot ?? "\0unconfigured";

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let cancelled = false;
    const localWorkspace = loadWorkspaceState(window.localStorage);
    setHydratedVaultKey(null);
    void loadNotesHotExitWorkspace(vaultRoot)
      .then((session) => {
        if (cancelled) return;
        setWorkspace(
          session ? sanitizeWorkspaceState(session.workspace) : localWorkspace,
        );
        setHydratedVaultKey(vaultKey);
      })
      .catch(() => {
        if (cancelled) return;
        setWorkspace(localWorkspace);
        setHydratedVaultKey(vaultKey);
      });
    return () => {
      cancelled = true;
    };
  }, [vaultKey, vaultRoot]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      hydratedVaultKey !== vaultKey
    ) {
      return;
    }

    saveWorkspaceState(window.localStorage, workspace);
    void captureNotesHotExitWorkspace(vaultRoot, workspace).catch(
      () => undefined,
    );
  }, [hydratedVaultKey, vaultKey, vaultRoot, workspace]);

  return [workspace, setWorkspace] as const;
}
