"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import { NEW_NOTE_BODY_PLACEHOLDER } from "@/features/notes/documents/note-editing-source";
import { buildMoveEntryPlan } from "@/features/notes/documents/move-entry-plan";
import { buildRenameNotePlan } from "@/features/notes/documents/rename-note-plan";
import { safeWriteVaultFile } from "@/features/notes/vault/vault-safe-write";
import { recordNotesHistoryVersion } from "@/features/notes/persistence/notes-recovery-store";
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
import {
  forgetSaveTarget,
  invalidateSaveTarget,
} from "@/features/notes/persistence/save-target-claim";
import type { NotesWorkspaceState } from "@/features/notes/workspace/workspace-types";
import type { VaultSnapshot } from "@/features/notes/vault/vault-types";
import {
  getVaultEntryDisplayKind,
  getVaultParentPath,
} from "@/features/notes/vault/vault-path";
import type { DesktopBridge, DesktopCommandRecord } from "@/platform/desktop/desktop-bridge";

type RefreshSnapshot = (
  options?: { eagerPaths?: readonly string[]; showLoading?: boolean },
) => Promise<VaultSnapshot | null>;

type VaultStoreLike = {
  getSnapshot: () => VaultSnapshot;
  rebuildIndex: () => Promise<VaultSnapshot>;
};

type UseNotesActionsInput = {
  activeDocument: NoteDocument | null;
  clearLocalDocumentState: (paths: string[]) => void;
  clearPendingDerivation: (path: string) => void;
  clearPendingSave: (path: string) => void;
  runDocumentMutation: (paths: string[], run: () => Promise<boolean>) => Promise<boolean>;
  reconcileDocumentRename: (input: {
    path: string; nextPath: string; nextTitle?: string; documents: NoteDocument[];
    persistedSources: Map<string, string>;
  }) => Promise<void>;
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

function getCopyPath(path: string, existingPaths: string[]) {
  const dot = path.lastIndexOf(".");
  const slash = path.lastIndexOf("/");
  const hasExtension = dot > slash;
  const stem = hasExtension ? path.slice(0, dot) : path;
  const extension = hasExtension ? path.slice(dot) : "";
  let index = 1;
  let candidate = `${stem} copy${extension}`;
  const occupied = new Set(existingPaths.map((entry) => entry.toLowerCase()));

  while (occupied.has(candidate.toLowerCase())) {
    index += 1;
    candidate = `${stem} copy ${index}${extension}`;
  }
  return candidate;
}

export function useNotesActions(input: UseNotesActionsInput) {
  const {
    activeDocument,
    clearLocalDocumentState,
    clearPendingDerivation,
    clearPendingSave,
    runDocumentMutation,
    reconcileDocumentRename,
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
    // The document collection is intentionally lazy. Collision checks must use
    // the complete entry listing so unopened notes cannot be overwritten.
    const existingPaths = new Set(
      vaultStore
        .getSnapshot()
        .entries.filter((entry) => entry.kind === "file")
        .map((entry) => entry.path.toLowerCase()),
    );
    const buildPath = (fileName: string) =>
      folderPath ? `${folderPath}/${fileName}.md` : `${fileName}.md`;

    let counter = existingPaths.size + 1;
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
      await refreshSnapshot({ eagerPaths: [nextPath] });
      setWorkspace((current) => openWorkspacePath(current, nextPath));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : NOTES_UI_COPY.errors.createNote,
      );
    }
  }, [client, refreshSnapshot, setErrorMessage, setWorkspace, vaultStore]);

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
        await refreshSnapshot({ eagerPaths: [path] });
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
      const allDocuments = (await vaultStore.rebuildIndex()).documents;
      const plan = planWikiLinkNavigation(
        target,
        sourcePath ?? activeDocument?.path ?? "",
        allDocuments,
      );

      if (!plan) {
        return;
      }

      if (plan.type === "create" && !(await createWikiLinkNote(plan.path, plan.title))) {
        return;
      }

      setWorkspace((current) => openWorkspacePath(current, plan.path));
    },
    [activeDocument, createWikiLinkNote, setWorkspace, vaultStore],
  );

  // ── Ensure a wiki-link target note exists (create, but do NOT navigate) ──
  // Used by the right-click "新增反链" action: wrapping a selection in
  // `[[...]]` should also materialise the target file when it is missing,
  // while keeping the user on the current note.
  const handleEnsureWikiLinkNote = useCallback(
    async (target: string, sourcePath?: string) => {
      const allDocuments = (await vaultStore.rebuildIndex()).documents;
      const plan = planWikiLinkNavigation(
        target,
        sourcePath ?? activeDocument?.path ?? "",
        allDocuments,
      );

      if (plan?.type === "create") {
        await createWikiLinkNote(plan.path, plan.title);
      }
    },
    [activeDocument, createWikiLinkNote, vaultStore],
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
      try {
        const diskDocuments = (await vaultStore.rebuildIndex()).documents;
        const previewDocuments = [...new Map([...diskDocuments, ...documents].map((doc) => [doc.path, doc])).values()];
        const preview = buildRenameNotePlan(previewDocuments, { path, nextTitle });
        if (preview.nextPath !== path && previewDocuments.some((doc) => doc.path.toLowerCase() === preview.nextPath.toLowerCase())) {
          setErrorMessage(NOTES_UI_COPY.errors.renameNoteCollision);
          return false;
        }
        const affectedPaths = [path, preview.nextPath, ...preview.writes.map((write) => write.path === preview.nextPath ? path : write.path)];
        return await runDocumentMutation(affectedPaths, async () => {
          // Rebuild after draining saves: the first index can contain only the
          // disk placeholder while the editor holds the entire unsaved body.
          const allDocuments = (await vaultStore.rebuildIndex()).documents;
          const original = allDocuments.find((doc) => doc.path === path);
          if (!original) throw new Error("原文件已不存在，已保留草稿，请先保存或恢复笔记。");
          const plan = buildRenameNotePlan(allDocuments, { nextTitle, path });
          if (plan.nextPath !== path && allDocuments.some((doc) => doc.path.toLowerCase() === plan.nextPath.toLowerCase())) {
            setErrorMessage(NOTES_UI_COPY.errors.renameNoteCollision);
            return false;
          }
          // Verify every planned baseline before moving or rewriting anything.
          for (const write of plan.writes) {
            const sourcePath = write.path === plan.nextPath ? path : write.path;
            const expected = allDocuments.find((doc) => doc.path === sourcePath)?.rawSource;
            if (await client.readFile(sourcePath) !== expected) {
              throw new Error("文件内容已变化，已停止重命名并保留草稿，请刷新后重试。");
            }
          }
          const persistedSources = new Map(plan.writes.map((write) => [write.path,
            allDocuments.find((doc) => doc.path === (write.path === plan.nextPath ? path : write.path))!.rawSource]));
          let moved = false;
          let wrote = false;
          try {
            if (plan.nextPath !== path) {
              invalidateSaveTarget(path);
              await client.renameEntry(path, plan.nextPath);
              moved = true;
            }
            for (const write of plan.writes) {
              const expectedRawSource = persistedSources.get(write.path)!;
              await recordNotesHistoryVersion({ path: write.path, rawSource: expectedRawSource, vaultRoot: client.rootPath });
              const saved = await safeWriteVaultFile(client, { path: write.path,
                expectedRawSource, nextRawSource: write.rawSource });
              if (saved.status === "conflict") throw new Error("文件内容已变化，已停止改写并保留草稿，请检查冲突。");
              persistedSources.set(write.path, write.rawSource);
              wrote = true;
              await recordNotesHistoryVersion({ path: write.path, rawSource: write.rawSource, vaultRoot: client.rootPath });
            }
            return moved;
          } finally {
            if (moved || wrote) {
              // VMark's path reconciliation keeps the live document. Clearing
              // it would discard edits that arrived while rename IO awaited.
              const reconciliation = reconcileDocumentRename({ path, nextPath: plan.nextPath, nextTitle, documents: allDocuments, persistedSources });
              setWorkspace((current) => renameWorkspacePath(current, path, plan.nextPath));
              try { await reconciliation; }
              finally { await refreshSnapshot({ eagerPaths: [plan.nextPath] }); }
            }
          }
        });
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : NOTES_UI_COPY.errors.renameNote,
        );
        return false;
      }
    },
    [
      client,
      documents,
      runDocumentMutation,
      reconcileDocumentRename,
      refreshSnapshot,
      setErrorMessage,
      setWorkspace,
      vaultStore,
    ],
  );

  const relocateEntry = useCallback(async (path: string, nextPath: string, move: boolean) => {
    const initial = await vaultStore.rebuildIndex();
    const affectedPaths = [...new Set([...initial.documents, ...documents]
      .filter((doc) => doc.path === path || doc.path.startsWith(`${path}/`)).map((doc) => doc.path))];
    return runDocumentMutation([...affectedPaths, ...affectedPaths.map((old) => nextPath + old.slice(path.length))], async () => {
      const latest = await vaultStore.rebuildIndex();
      if (latest.entries.some((entry) => entry.path.toLowerCase() === nextPath.toLowerCase())) {
        throw new Error(NOTES_UI_COPY.errors.moveEntryCollision);
      }
      const affected = latest.documents.filter((doc) => doc.path === path || doc.path.startsWith(`${path}/`));
      const persistedSources = new Map<string, string>();
      for (const doc of affected) {
        if (await client.readFile(doc.path) !== doc.rawSource) throw new Error("文件内容已变化，已停止移动并保留草稿。");
        persistedSources.set(nextPath + doc.path.slice(path.length), doc.rawSource);
      }
      affected.forEach((doc) => invalidateSaveTarget(doc.path));
      if (move) await client.moveEntry(path, nextPath);
      else await client.renameEntry(path, nextPath);
      const reconciliation = reconcileDocumentRename({ path, nextPath, documents: latest.documents, persistedSources });
      setWorkspace((current) => renameWorkspacePath(current, path, nextPath));
      try { await reconciliation; }
      finally { await refreshSnapshot({ eagerPaths: [...persistedSources.keys()] }); }
      return true;
    });
  }, [client, documents, reconcileDocumentRename, refreshSnapshot, runDocumentMutation, setWorkspace, vaultStore]);

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
      if (!nextTitle) return;

      await handleRenameNoteToTitle(path, nextTitle);
    } else {
      // Directory or other file: simple name prompt
      const segments = path.split("/");
      const currentName = segments.at(-1) ?? path;
      const nextName = (await promptFn("重命名", currentName))?.trim();
      if (!nextName || nextName === currentName) return;

      const nextPath = [...segments.slice(0, -1), nextName].join("/");

      try {
        if (/[/\\\0]/.test(nextName) || nextName === "." || nextName === "..") throw new Error("请输入文件或文件夹名称，不要包含路径。");
        await relocateEntry(path, nextPath, false);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to rename",
        );
      }
    }
  }, [
    documents,
    handleRenameNoteToTitle,
    relocateEntry,
    promptFn,
    setErrorMessage,
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
        if (await relocateEntry(sourcePath, plan.nextPath, true)) setErrorMessage(null);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : NOTES_UI_COPY.errors.moveEntry,
        );
      }
    },
    [relocateEntry, setErrorMessage, vaultStore],
  );

  const handleCopyPath = useCallback(async (path: string) => {
    if (!client.copyEntry) {
      setErrorMessage("当前运行环境不支持复制文件。");
      return;
    }
    const nextPath = getCopyPath(
      path,
      vaultStore.getSnapshot().entries.map((entry) => entry.path),
    );
    try {
      await client.copyEntry(path, nextPath);
      await refreshSnapshot({
        eagerPaths: [nextPath],
        showLoading: false,
      });
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "复制失败");
    }
  }, [client, refreshSnapshot, setErrorMessage, vaultStore]);

  const handleRevealPath = useCallback(async (path: string) => {
    try {
      await client.revealEntry?.(path);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "无法在文件管理器中显示",
      );
    }
  }, [client, setErrorMessage]);

  const handleRestoreLastDeleted = useCallback(async () => {
    try {
      const restoredPath = await client.restoreLastDeletedEntry?.();
      if (!restoredPath) {
        setErrorMessage("回收站中没有可恢复的项目。");
        return;
      }
      await refreshSnapshot({
        eagerPaths: [restoredPath],
        showLoading: false,
      });
      setWorkspace((current) => openWorkspacePath(current, restoredPath));
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "恢复失败");
    }
  }, [client, refreshSnapshot, setErrorMessage, setWorkspace]);

  // ── Delete any path ───────────────────────────────────────────────────────
  const handleDeletePath = useCallback(async (
    path: string,
    kind: "directory" | "file",
  ) => {
    const label = kind === "directory" ? `文件夹 "${path}"` : `"${path}"`;
    const confirmed = await confirmFn(`将 ${label} 移到 Auris 回收站？`, "删除");
    if (!confirmed) return;

    const displayKind = kind === "file" ? getVaultEntryDisplayKind(path) : null;
    const isEditableFile =
      displayKind === "markdown" ||
      displayKind === "structured-data" ||
      displayKind === "text";

    try {
      if (isEditableFile) {
        clearPendingSave(path);
        clearPendingDerivation(path);
        clearLocalDocumentState([path]);
        invalidateSaveTarget(path);
        forgetSaveTarget(path);
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
      await refreshSnapshot({
        eagerPaths: selection.selectedFilePath
          ? [selection.selectedFilePath]
          : undefined,
      });
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
    handleCopyPath,
    handleCreateNote,
    handleCreateNoteInPath,
    handleCreateFolderInPath,
    handleDeleteActiveNote,
    handleDeletePath,
    handleEnsureWikiLinkNote,
    handleMovePath,
    handleRevealPath,
    handleRestoreLastDeleted,
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
