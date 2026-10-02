"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
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
  const [workspace, setWorkspaceState] = useState<NotesWorkspaceState>(() =>
    createWorkspaceState(),
  );
  const vaultKey = vaultRoot ?? "\0unconfigured";
  const mountedRef = useRef(false);
  const sessionRef = useRef({ vaultKey, hydrated: false, workspace,
    pending: [] as SetStateAction<NotesWorkspaceState>[] });
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Filesystem operations can complete after the Notes route unmounts. Persist
  // their identity changes here instead of relying on a future React effect.
  const setWorkspace: Dispatch<SetStateAction<NotesWorkspaceState>> = useCallback((update) => {
    const session = sessionRef.current;
    if (session.vaultKey !== vaultKey) return;
    if (!session.hydrated) { session.pending.push(update); return; }
    const next = typeof update === "function" ? update(session.workspace) : update;
    session.workspace = next;
    void captureNotesHotExitWorkspace(vaultRoot, next).catch(() => undefined);
    try { saveWorkspaceState(window.localStorage, next); } catch { /* durable store remains available */ }
    if (mountedRef.current) setWorkspaceState(next);
  }, [vaultKey, vaultRoot]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let cancelled = false;
    if (sessionRef.current.vaultKey !== vaultKey) {
      sessionRef.current = { vaultKey, hydrated: false, workspace: createWorkspaceState(), pending: [] };
    }
    const localWorkspace = loadWorkspaceState(window.localStorage);
    const hydrate = (loaded: NotesWorkspaceState) => {
      if (cancelled) return;
      const next = sessionRef.current.pending.reduce<NotesWorkspaceState>((current, update) =>
        typeof update === "function" ? update(current) : update, loaded);
      sessionRef.current = { vaultKey, hydrated: true, workspace: next, pending: [] };
      setWorkspaceState(next);
      void captureNotesHotExitWorkspace(vaultRoot, next).catch(() => undefined);
      try { saveWorkspaceState(window.localStorage, next); } catch { /* durable store remains available */ }
    };
    void loadNotesHotExitWorkspace(vaultRoot)
      .then((session) => {
        if (cancelled) return;
        const next = session ? sanitizeWorkspaceState(session.workspace) : localWorkspace;
        hydrate(next);
      })
      .catch(() => {
        if (cancelled) return;
        hydrate(localWorkspace);
      });
    return () => {
      cancelled = true;
    };
  }, [vaultKey, vaultRoot]);

  return [workspace, setWorkspace] as const;
}
