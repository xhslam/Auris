"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import { NEW_NOTE_BODY_PLACEHOLDER } from "@/features/notes/documents/note-editing-source";
import { buildMoveEntryPlan } from "@/features/notes/documents/move-entry-plan";
import { buildRenameNotePlan } from "@/features/notes/documents/rename-note-plan";
import {
  buildWikiLinkNoteSource,
  planWikiLinkNavigation,
} from "@/features/notes/documents/wiki-link-navigation";
import type { NotesDirectoryInfo } from "@/features/notes/note-types";
import type { NotesRuntimeClient } from "@/features/notes/workbench/use-notes-runtime";
import {
  openWorkspacePath,
  removeWorkspacePath,
  renameWorkspacePath,
} from "@/features/notes/workspace/workspace-store";
import type { NotesWorkspaceState } from "@/features/notes/workspace/workspace-types";
import type { VaultSnapshot } from "@/features/notes/vault/vault-types";
import {
  getVaultEntryDisplayKind,
  getVaultParentPath,
} from "@/features/notes/vault/vault-path";
import type { DesktopBridge, DesktopCommandRecord } from "@/platform/desktop/desktop-bridge";

type RefreshSnapshot = (
  options?: { showLoading?: boolean },
) => Promise<VaultSnapshot | null>;

type VaultStoreLike = {
  getSnapshot: () => VaultSnapshot;
};

type UseNotesActionsInput = {
  activeDocument: NoteDocument | null;
  clearLocalDocumentState: (paths: string[]) => void;
  clearPendingDerivation: (path: string) => void;
  clearPendingSave: (path: string) => void;
  client: NotesRuntimeClient;
  desktopBridge: DesktopBridge | null;
  desktopCommands: DesktopCommandRecord[];
  documents: NoteDocument[];
  promptFn: (
    title: string,
    defaultValue?: string,
    placeholder?: string,
  ) => Promise<string | null>;
  confirmFn: (message: string, confirmLabel?: string) => Promise<boolean>;
  refreshSnapshot: RefreshSnapshot;
  setDirectoryInfo: Dispatch<SetStateAction<NotesDirectoryInfo>>;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
  setWorkspace: Dispatch<SetStateAction<NotesWorkspaceState>>;
  vaultStore: VaultStoreLike;
};

function slugifyFileName(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "untitled-note"
  );
}

function buildNewNoteSource() {
  return `${NEW_NOTE_BODY_PLACEHOLDER}\n`;
}

export function useNotesActions(input: UseNotesActionsInput) {
  const {
    activeDocument,
    clearLocalDocumentState,
    clearPendingDerivation,
    clearPendingSave,
    client,
    desktopBridge,
    desktopCommands,
    documents,
    promptFn,
    confirmFn,
    refreshSnapshot,
    setDirectoryInfo,
    setErrorMessage,
    setWorkspace,
    vaultStore,
  } = input;
  const [lastRunCommandTitle, setLastRunCommandTitle] = useState<string | null>(null);

  // ── Create note in a specific folder ──────────────────────────────────────
  const handleCreateNoteInPath = useCallback(async (folderPath: string) => {
    // Guard against silently overwriting an existing note: `documents.length`
    // can collide with a file that already exists (e.g. after some notes were
    // deleted), so probe for a free "Study Note N" name before writing.
    const existingPaths = new Set(documents.map((d) => d.path.toLowerCase()));
    const buildPath = (fileName: string) =>
      folderPath ? `${folderPath}/${fileName}.md` : `${fileName}.md`;

    let counter = documents.length + 1;
    let baseTitle = `Study Note ${counter}`;
    let nextPath = buildPath(slugifyFileName(baseTitle));

    while (existingPaths.has(nextPath.toLowerCase())) {
      counter += 1;
      baseTitle = `Study Note ${counter}`;
      nextPath = buildPath(slugifyFileName(baseTitle));
    }

    try {
      if (folderPath) await client.createDirectory(folderPath);
      await client.writeFile(nextPath, buildNewNoteSource());
      await refreshSnapshot();
      setWorkspace((current) => openWorkspacePath(current, nextPath));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : NOTES_UI_COPY.errors.createNote,
      );
    }
  }, [client, documents, refreshSnapshot, setErrorMessage, setWorkspace]);

  // ── + button: create in active document's folder, Inbox as fallback ──────
  const handleCreateNote = useCallback(async () => {
    const folderPath = activeDocument
      ? getVaultParentPath(activeDocument.path)
      : "Inbox";
    await handleCreateNoteInPath(folderPath);
  }, [activeDocument, handleCreateNoteInPath]);

  // Materialise a "create" wiki-link plan on disk (parent dir + note file +
  // refresh). Returns whether the note was written, so callers can decide
  // whether to navigate to it. Shared by the open and ensure handlers.
  const createWikiLinkNote = useCallback(
    async (path: string, title: string) => {
      try {
        const parentPath = getVaultParentPath(path);

        if (parentPath) {
          await client.createDirectory(parentPath);
        }

        await client.writeFile(path, buildWikiLinkNoteSource(title));
        await refreshSnapshot();
        return true;
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : NOTES_UI_COPY.errors.createNote,
        );
        return false;
      }
    },
    [client, refreshSnapshot, setErrorMessage],
  );

  // ── Wiki-link navigation: open the target, creating it when missing ──────
  const handleOpenWikiLink = useCallback(
    async (target: string, sourcePath?: string) => {
      const plan = planWikiLinkNavigation(
        target,
        sourcePath ?? activeDocument?.path ?? "",
        documents,
      );

      if (!plan) {
        return;
      }

      if (plan.type === "create" && !(await createWikiLinkNote(plan.path, plan.title))) {
        return;
      }

      setWorkspace((current) => openWorkspacePath(current, plan.path));
    },
    [activeDocument, createWikiLinkNote, documents, setWorkspace],
  );

  // ── Ensure a wiki-link target note exists (create, but do NOT navigate) ──
  // Used by the right-click "新增反链" action: wrapping a selection in
  // `[[...]]` should also materialise the target file when it is missing,
  // while keeping the user on the current note.
  const handleEnsureWikiLinkNote = useCallback(
    async (target: string, sourcePath?: string) => {
      const plan = planWikiLinkNavigation(
        target,
        sourcePath ?? activeDocument?.path ?? "",
        documents,
      );

      if (plan?.type === "create") {
        await createWikiLinkNote(plan.path, plan.title);
      }
    },
    [activeDocument, createWikiLinkNote, documents],
  );

  // ── Create folder via prompt ──────────────────────────────────────────────
  const handleCreateFolderInPath = useCallback(async (parentPath: string) => {
    const name = (await promptFn("文件夹名称", "", "如：Inbox / 语法笔记"))?.trim();
    if (!name) return;

    const folderPath = parentPath ? `${parentPath}/${name}` : name;

    try {
      await client.createDirectory(folderPath);
      await refreshSnapshot();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to create folder",
      );
    }
  }, [client, promptFn, refreshSnapshot, setErrorMessage]);

  // ── Rename a markdown note's file to match a title (wiki-link aware) ───────
  // Shared by the manual rename prompt and the automatic title→filename sync.
  // Returns true when the file was actually moved on disk. Refuses to clobber a
  // different existing note, and rewrites every wiki link that pointed at it.
  const handleRenameNoteToTitle = useCallback(
    async (path: string, nextTitle: string): Promise<boolean> => {
      const plan = buildRenameNotePlan(documents, { nextTitle, path });

      // Refuse to rename onto an existing different note — fs.rename would
      // silently overwrite (and destroy) that file.
      if (
        plan.nextPath !== path &&
        documents.some(
          (d) => d.path.toLowerCase() === plan.nextPath.toLowerCase(),
        )
      ) {
        setErrorMessage(NOTES_UI_COPY.errors.renameNoteCollision);
        return false;
      }

      try {
        clearPendingSave(path);
        clearPendingDerivation(path);
        plan.writes.forEach((w) => clearPendingSave(w.path));
        plan.writes.forEach((w) => clearPendingDerivation(w.path));

        if (plan.nextPath !== path) {
          await client.renameEntry(path, plan.nextPath);
        }

        await Promise.all(
          plan.writes.map((w) => client.writeFile(w.path, w.rawSource)),
        );

        clearLocalDocumentState([path, ...plan.writes.map((w) => w.path)]);
        await refreshSnapshot();

        setWorkspace((current) =>
          openWorkspacePath(
            renameWorkspacePath(current, path, plan.nextPath),
            plan.nextPath,
          ),
        );
        return plan.nextPath !== path;
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : NOTES_UI_COPY.errors.renameNote,
        );
        return false;
      }
    },
    [
      clearLocalDocumentState,
      clearPendingDerivation,
      clearPendingSave,
      client,
      documents,
      refreshSnapshot,
      setErrorMessage,
      setWorkspace,
    ],
  );

  // ── Rename any path (wiki-link aware for markdown) ────────────────────────
  const handleRenamePath = useCallback(async (
    path: string,
    kind: "directory" | "file",
  ) => {
    const isMarkdown = kind === "file" && getVaultEntryDisplayKind(path) === "markdown";

    if (isMarkdown) {
      const doc = documents.find((d) => d.path === path);
      const suggestedTitle = doc?.parsed.title ?? doc?.basename ?? path;
      const nextTitle = (await promptFn(NOTES_UI_COPY.dialogs.renameNote, suggestedTitle))?.trim();
      if (!nextTitle || nextTitle === suggestedTitle) return;

      await handleRenameNoteToTitle(path, nextTitle);
    } else {
      // Directory or other file: simple name prompt
      const segments = path.split("/");
      const currentName = segments.at(-1) ?? path;
      const nextName = (await promptFn("重命名", currentName))?.trim();
      if (!nextName || nextName === currentName) return;

      const nextPath = [...segments.slice(0, -1), nextName].join("/");

      try {
        await client.renameEntry(path, nextPath);
        await refreshSnapshot();
        setWorkspace((current) => renameWorkspacePath(current, path, nextPath));
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to rename",
        );
      }
    }
  }, [
    client,
    documents,
    handleRenameNoteToTitle,
    promptFn,
    refreshSnapshot,
    setErrorMessage,
    setWorkspace,
  ]);

  // ── Move a file/folder into another folder (drag & drop) ─────────────────
  // Performs a real filesystem move and keeps open tabs / active note pointing
  // at the new path. Wiki links keep resolving because the target's basename
  // is unchanged (the resolver matches by basename), so no link rewrite is
  // needed for a relocation.
  const handleMovePath = useCallback(
    async (sourcePath: string, targetFolderPath: string) => {
      const snapshot = vaultStore.getSnapshot();
      const plan = buildMoveEntryPlan({
        existingPaths: snapshot.entries.map((entry) => entry.path),
        sourcePath,
        targetFolderPath,
      });

      if (plan.type === "noop") {
        return;
      }

      if (plan.type === "invalid") {
        setErrorMessage(
          plan.reason === "collision"
            ? NOTES_UI_COPY.errors.moveEntryCollision
            : NOTES_UI_COPY.errors.moveEntryIntoSelf,
        );
        return;
      }

      try {
        await client.moveEntry(sourcePath, plan.nextPath);
        await refreshSnapshot();
        setWorkspace((current) =>
          renameWorkspacePath(current, sourcePath, plan.nextPath),
        );
        setErrorMessage(null);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : NOTES_UI_COPY.errors.moveEntry,
        );
      }
    },
    [client, refreshSnapshot, setErrorMessage, setWorkspace, vaultStore],
  );

  // ── Delete any path ───────────────────────────────────────────────────────
  const handleDeletePath = useCallback(async (
    path: string,
    kind: "directory" | "file",
  ) => {
    const label = kind === "directory" ? `文件夹 "${path}"` : `"${path}"`;
    const confirmed = await confirmFn(`删除 ${label}？此操作无法撤销。`, "删除");
    if (!confirmed) return;

    const isMarkdown = kind === "file" && getVaultEntryDisplayKind(path) === "markdown";

    try {
      if (isMarkdown) {
        clearPendingSave(path);
        clearPendingDerivation(path);
        clearLocalDocumentState([path]);
      }

      await client.deleteEntry(path);
      const nextSnapshot = await refreshSnapshot({ showLoading: false });
      const fallbackSnapshot = nextSnapshot ?? vaultStore.getSnapshot();

      setWorkspace((current) => {
        const nextWorkspace = removeWorkspacePath(current, path);
        const fallbackPath = fallbackSnapshot.documents[0]?.path ?? null;

        if (nextWorkspace.activePath || !fallbackPath) {
          return nextWorkspace;
        }

        return openWorkspacePath(nextWorkspace, fallbackPath);
      });

      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : NOTES_UI_COPY.errors.deleteNote,
      );
    }
  }, [
    clearLocalDocumentState,
    clearPendingDerivation,
    clearPendingSave,
    client,
    confirmFn,
    refreshSnapshot,
    setErrorMessage,
    setWorkspace,
    vaultStore,
  ]);

  // ── Convenience wrappers for the active document ──────────────────────────
  const handleRenameActiveNote = useCallback(async () => {
    if (!activeDocument) return;
    await handleRenamePath(activeDocument.path, "file");
  }, [activeDocument, handleRenamePath]);

  const handleDeleteActiveNote = useCallback(async () => {
    if (!activeDocument) return;
    await handleDeletePath(activeDocument.path, "file");
  }, [activeDocument, handleDeletePath]);

  // ── Directory picker ──────────────────────────────────────────────────────
  const handlePickDirectory = useCallback(async () => {
    if (!client.pickDirectory) return null;

    try {
      const nextInfo = await client.pickDirectory();
      setDirectoryInfo(nextInfo);
      await refreshSnapshot();
      return nextInfo;
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : NOTES_UI_COPY.errors.chooseDirectory,
      );
      return null;
    }
  }, [client, refreshSnapshot, setDirectoryInfo, setErrorMessage]);

  const handlePickFile = useCallback(async () => {
    if (!client.pickFile) return null;

    try {
      const selection = await client.pickFile();
      setDirectoryInfo(selection.directoryInfo);
      await refreshSnapshot();
      if (selection.selectedFilePath) {
        setWorkspace((current) => openWorkspacePath(current, selection.selectedFilePath!));
      }
      return selection.selectedFilePath;
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to open note file",
      );
      return null;
    }
  }, [client, refreshSnapshot, setDirectoryInfo, setErrorMessage, setWorkspace]);

  // ── Desktop commands ──────────────────────────────────────────────────────
  const handleRunDesktopCommand = useCallback(
    async (commandId: string) => {
      if (!desktopBridge) return;

      try {
        const result = await desktopBridge.commands.run(commandId);

        if (result.executed) {
          setLastRunCommandTitle(
            desktopCommands.find((c) => c.id === commandId)?.title ?? commandId,
          );
        }
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : NOTES_UI_COPY.errors.runDesktopCommand,
        );
      }
    },
    [desktopBridge, desktopCommands, setErrorMessage],
  );

  return {
    handleCreateNote,
    handleCreateNoteInPath,
    handleCreateFolderInPath,
    handleDeleteActiveNote,
    handleDeletePath,
    handleEnsureWikiLinkNote,
    handleMovePath,
    handleOpenWikiLink,
    handlePickDirectory,
    handlePickFile,
    handleRenameActiveNote,
    handleRenameNoteToTitle,
    handleRenamePath,
    handleRunDesktopCommand,
    lastRunCommandTitle,
  };
}
