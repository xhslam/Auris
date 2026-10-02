"use client";

import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import { createNoteDocument } from "@/features/notes/documents/document-repository";
import { buildRenameNotePlan } from "@/features/notes/documents/rename-note-plan";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import { getFormatDescriptor } from "@/features/notes/formats/format-registry";
import { searchDocuments } from "@/features/notes/documents/document-search";
import {
  captureNotesRecoveryDraft,
  clearNotesRecoveryDraft,
  listNotesRecoveryDrafts,
  recordNotesHistoryVersion,
} from "@/features/notes/persistence/notes-recovery-store";
import type { NotesRuntimeClient } from "@/features/notes/workbench/use-notes-runtime";
import {
  applyBacklinksToDocuments,
  buildLiveBacklinksIndex,
  createLiveNoteDocument,
  createLiveNoteDraft,
  mergeLiveNoteDocuments,
  type LiveNoteDocuments,
} from "@/features/notes/workspace/workbench-documents";
import {
  selectActiveDocument,
  selectDocumentBacklinks,
} from "@/features/notes/workspace/workspace-selectors";
import {
  openWorkspacePath,
} from "@/features/notes/workspace/workspace-store";
import type { NotesWorkspaceState } from "@/features/notes/workspace/workspace-types";
import {
  buildVaultWriteConflictDiff,
  getVaultWriteConflictStaleReason,
  type VaultWriteConflict,
} from "@/features/notes/vault/vault-write-conflict";
import { normalizeVaultPath } from "@/features/notes/vault/vault-path";
import type { VaultSnapshot } from "@/features/notes/vault/vault-types";
import {
  hasPendingNoteSave,
  matchesPendingNoteSave,
} from "@/features/notes/workbench/notes-pending-saves";
import {
  saveNoteToVault,
  type NotesSaveType,
} from "@/features/notes/workbench/notes-save-to-vault";
import {
  claimSaveTarget,
  isCurrentSaveTarget,
} from "@/features/notes/persistence/save-target-claim";

// VMark-style save model: typing updates the local working copy immediately,
// while persistence follows once typing settles. The settle window stays above
// the editor derivation debounce so file IO remains off the keystroke path.
const AUTO_SAVE_SETTLE_MS = 2_000;
const DERIVED_DOCUMENT_DEBOUNCE_MS = 180;
const DERIVED_INDEX_DEBOUNCE_MS = 180;
const RECOVERY_CAPTURE_WINDOW_MS = 400;
const SELF_WRITE_HISTORY_LIMIT = 8;

type UseNotesDocumentsInput = {
  client: NotesRuntimeClient;
  ensureDocuments?: (paths: readonly string[]) => Promise<VaultSnapshot | null>;
  resumeNoteId?: string | null;
  searchQuery: string;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
  setWorkspace: Dispatch<SetStateAction<NotesWorkspaceState>>;
  refreshSnapshot: (options?: {
    eagerPaths?: readonly string[];
    showLoading?: boolean;
  }) => Promise<VaultSnapshot | null>;
  snapshot: VaultSnapshot;
  workspace: NotesWorkspaceState;
};

type NoteSaveMeta = {
  isDivergent: boolean;
  isMissing: boolean;
  lastAutoSave: number | null;
  lastDiskContent: string | null;
  savedContent: string | null;
};

export type NotesPersistenceResult =
  | {
      persistedSource: string;
      status: "saved";
    }
  | {
      currentRawSource: string | null;
      status: "conflict";
    }
  | {
      message: string;
      status: "failed";
    }
  | {
      status: "missing";
    };

function findDocumentByPath(documents: NoteDocument[], path: string) {
  return documents.find((document) => document.path === path) ?? null;
}

function rememberSelfWrittenContent(
  history: Map<string, string[]>,
  path: string,
  content: string,
) {
  const normalizedPath = normalizeVaultPath(path);
  const previous = history.get(normalizedPath) ?? [];
  history.set(
    normalizedPath,
    [content, ...previous.filter((entry) => entry !== content)].slice(
      0,
      SELF_WRITE_HISTORY_LIMIT,
    ),
  );
}

function isSelfWrittenContent(
  history: Map<string, string[]>,
  path: string,
  content: string | null,
) {
  if (content === null) {
    return false;
  }

  return (history.get(normalizeVaultPath(path)) ?? []).includes(content);
}

function resolveResumePath(
  documents: NoteDocument[],
  resumeNoteId: string | null | undefined,
) {
  if (!resumeNoteId) {
    return null;
  }

  return (
    documents.find(
      (document) =>
        document.path === resumeNoteId ||
        document.fileName === resumeNoteId ||
        document.basename === resumeNoteId ||
        document.path.includes(resumeNoteId),
    )?.path ?? null
  );
}

export function useNotesDocuments(input: UseNotesDocumentsInput) {
  const {
    client,
    ensureDocuments,
    refreshSnapshot,
    resumeNoteId,
    searchQuery,
    setErrorMessage,
    setWorkspace,
    snapshot,
    workspace,
  } = input;
  const deriveTimerRef = useRef<Map<string, number>>(new Map());
  const saveBaselineRef = useRef<Map<string, string | null>>(new Map());
  const saveMetaRef = useRef<Map<string, NoteSaveMeta>>(new Map());
  const dirtyPathsRef = useRef<Record<string, boolean>>({});
  const documentsRef = useRef<NoteDocument[]>([]);
  const selfWriteHistoryRef = useRef<Map<string, string[]>>(new Map());
  const recoveryCaptureTimerRef = useRef<Map<string, number>>(new Map());
  const recoveryPendingDraftRef = useRef<
    Map<
      string,
      Parameters<typeof captureNotesRecoveryDraft>[0]
    >
  >(new Map());
  // Serializes in-flight writes per path so overlapping autosaves cannot run
  // concurrently. Concurrent writes were reading a stale baseline and falsely
  // reporting an "external editor conflict" while the user was simply typing.
  const saveChainRef =
    useRef<Map<string, Promise<NotesPersistenceResult>>>(new Map());
  const mutationPathsRef = useRef(new Set<string>());
  const backlinksTimerRef = useRef<number | null>(null);
  const liveDocumentsRef = useRef<LiveNoteDocuments>({});
  // The resume target (?resumeNoteId=…) must only seed the *initial* active
  // note. Once honored, it must never win again, otherwise every later click /
  // newly created note gets yanked back to the resume note on the next render.
  const resumeConsumedRef = useRef(false);
  const restoredRecoveryPathsRef = useRef<Set<string>>(new Set());

  const [liveDocuments, setLiveDocuments] = useState<LiveNoteDocuments>({});
  const [backlinksIndex, setBacklinksIndex] = useState<
    Record<string, string[]>
  >({});
  const [dirtyPaths, setDirtyPaths] = useState<Record<string, boolean>>({});
  const [writeConflict, setWriteConflict] = useState<VaultWriteConflict | null>(
    null,
  );

  useEffect(() => {
    const resumePath =
      resumeNoteId &&
      snapshot.entries.find(
        (entry) =>
          entry.kind === "file" &&
          (entry.path === resumeNoteId ||
            entry.name === resumeNoteId ||
            entry.path.includes(resumeNoteId)),
      )?.path;
    const paths = Array.from(
      new Set([
        ...workspace.openTabs,
        ...(workspace.activePath ? [workspace.activePath] : []),
        ...workspace.recentFiles.slice(0, 8),
        ...(resumePath ? [resumePath] : []),
      ]),
    );

    if (ensureDocuments && paths.length > 0) {
      void ensureDocuments(paths);
    }
  }, [
    ensureDocuments,
    resumeNoteId,
    snapshot.entries,
    workspace.activePath,
    workspace.openTabs,
    workspace.recentFiles,
  ]);

  useEffect(() => {
    if (!ensureDocuments || !searchQuery.trim()) {
      return;
    }

    const searchablePaths = snapshot.entries
      .filter(
        (entry) =>
          entry.kind === "file" && getFormatDescriptor(entry.path).canEdit,
      )
      .map((entry) => entry.path);

    void ensureDocuments(searchablePaths);
  }, [ensureDocuments, searchQuery, snapshot.entries]);

  useEffect(() => {
    startTransition(() => {
      setBacklinksIndex(snapshot.backlinks);
    });
  }, [snapshot.backlinks]);

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const documents = useMemo(
    () => {
      const snapshotPaths = new Set(snapshot.documents.map((document) => document.path));
      const renamedLiveDocuments = Object.values(liveDocuments).filter(
        (document) => !snapshotPaths.has(document.path),
      );

      return applyBacklinksToDocuments(
        [
          ...mergeLiveNoteDocuments(snapshot.documents, liveDocuments),
          ...renamedLiveDocuments,
        ],
        backlinksIndex,
      );
    },
    [backlinksIndex, liveDocuments, snapshot.documents],
  );
  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);
  const deferredDocuments = useDeferredValue(documents);
  const activeDocument = useMemo(
    () => selectActiveDocument(documents, workspace),
    [documents, workspace],
  );
  const backlinks = useMemo(
    () => selectDocumentBacklinks(documents, workspace),
    [documents, workspace],
  );
  const searchResults = useMemo(
    () =>
      deferredSearchQuery
        ? searchDocuments(deferredDocuments, deferredSearchQuery)
        : deferredDocuments,
    [deferredDocuments, deferredSearchQuery],
  );

  useEffect(() => {
    if (documents.length === 0) {
      return;
    }

    // Only consult the resume target the first time documents are available;
    // after that the user's own activePath is the source of truth so navigation
    // and freshly created notes actually stick.
    const resumePath = resumeConsumedRef.current
      ? null
      : resolveResumePath(documents, resumeNoteId);
    const nextPath = resumePath ?? workspace.activePath ?? documents[0]?.path ?? null;

    if (!nextPath) {
      return;
    }

    resumeConsumedRef.current = true;

    if (
      workspace.activePath === nextPath &&
      workspace.openTabs.includes(nextPath)
    ) {
      return;
    }

    setWorkspace((current) => openWorkspacePath(current, nextPath));
  }, [
    documents,
    resumeNoteId,
    setWorkspace,
    workspace.activePath,
    workspace.openTabs,
  ]);

  useEffect(() => {
    const deriveTimers = deriveTimerRef.current;
    const recoveryCaptureTimers = recoveryCaptureTimerRef.current;
    const recoveryPendingDrafts = recoveryPendingDraftRef.current;

    return () => {
      if (backlinksTimerRef.current) {
        window.clearTimeout(backlinksTimerRef.current);
      }

      deriveTimers.forEach((timerId) => window.clearTimeout(timerId));
      deriveTimers.clear();
      recoveryCaptureTimers.forEach((timerId) =>
        window.clearTimeout(timerId),
      );
      recoveryCaptureTimers.clear();
      // Leaving Notes cancels autosave/derivation timers, but must durably
      // capture the LAST input in the recovery window before discarding it.
      recoveryPendingDrafts.forEach((draft) => {
        void captureNotesRecoveryDraft(draft).then((captured) => {
          if (captured === false) setErrorMessage(NOTES_UI_COPY.errors.recovery);
        }).catch(() => setErrorMessage(NOTES_UI_COPY.errors.recovery));
      });
      recoveryPendingDrafts.clear();
    };
  }, [setErrorMessage]);

  useEffect(() => {
    if (snapshot.rootPath !== client.rootPath || snapshot.generatedAt === new Date(0).toISOString()) return;
    const currentDirtyPaths = dirtyPathsRef.current;

    snapshot.documents.forEach((document) => {
      const existing = saveMetaRef.current.get(document.path);

      if (!existing) {
        saveMetaRef.current.set(document.path, {
          isDivergent: false,
          isMissing: false,
          lastAutoSave: null,
          lastDiskContent: document.rawSource,
          savedContent: document.rawSource,
        });
        return;
      }

      const isDirty = currentDirtyPaths[document.path] === true;
      // A successful read proves presence even when an earlier snapshot was
      // missing or unloaded; this must not leave autosave permanently disabled.
      if (existing.isMissing) {
        saveMetaRef.current.set(document.path, { ...existing, isMissing: false });
      }

      if (!isDirty) {
        saveMetaRef.current.set(document.path, {
          ...existing,
          isMissing: false,
          lastDiskContent: document.rawSource,
          savedContent: document.rawSource,
        });
        return;
      }

      if (
        hasPendingNoteSave(document.path) ||
        matchesPendingNoteSave(document.path, document.rawSource)
      ) {
        return;
      }

      if (
        existing.lastDiskContent !== null &&
        document.rawSource !== existing.lastDiskContent
      ) {
        if (
          isSelfWrittenContent(
            selfWriteHistoryRef.current,
            document.path,
            document.rawSource,
          )
        ) {
          saveBaselineRef.current.set(document.path, document.rawSource);
          saveMetaRef.current.set(document.path, {
            ...existing,
            isMissing: false,
            lastDiskContent: document.rawSource,
            savedContent: document.rawSource,
          });
          return;
        }

        const localDocument = liveDocumentsRef.current[document.path];

        setWriteConflict({
          expectedRawSource: existing.lastDiskContent,
          localRawSource: localDocument?.rawSource ?? document.rawSource,
          path: document.path,
          remoteRawSource: document.rawSource,
        });
      }
    });

    const snapshotPaths = new Set(
      snapshot.entries.filter((entry) => entry.kind === "file").map((entry) => entry.path),
    );

    saveMetaRef.current.forEach((meta, path) => {
      if (snapshotPaths.has(path) || !currentDirtyPaths[path]) {
        return;
      }

      saveMetaRef.current.set(path, {
        ...meta,
        isMissing: true,
      });
    });
  }, [client.rootPath, dirtyPaths, snapshot.documents, snapshot.entries, snapshot.generatedAt, snapshot.rootPath]);

  const scheduleDerivedBacklinksRefresh = useCallback(
    (nextLiveDocuments: LiveNoteDocuments) => {
      if (backlinksTimerRef.current) {
        window.clearTimeout(backlinksTimerRef.current);
      }

      backlinksTimerRef.current = window.setTimeout(() => {
        startTransition(() => {
          setBacklinksIndex(
            buildLiveBacklinksIndex(snapshot.documents, nextLiveDocuments),
          );
        });
        backlinksTimerRef.current = null;
      }, DERIVED_INDEX_DEBOUNCE_MS);
    },
    [snapshot.documents],
  );

  const saveDocumentNow = useCallback(
    async (
      path: string,
      rawSource: string,
      saveType: NotesSaveType,
    ): Promise<NotesPersistenceResult> => {
      const saveClaim = claimSaveTarget(path);
      const meta = saveMetaRef.current.get(path);

      if (meta?.isMissing && saveType === "auto") {
        return { status: "missing" };
      }
      if (meta?.isDivergent) {
        return {
          currentRawSource: meta.lastDiskContent,
          status: "conflict",
        };
      }

      const runWrite = async (): Promise<NotesPersistenceResult> => {
        const latestMeta = saveMetaRef.current.get(path) ?? meta;
        const baselineExpected = saveBaselineRef.current.has(path)
          ? (saveBaselineRef.current.get(path) ?? null)
          : (latestMeta?.lastDiskContent ?? rawSource);

        try {
          if (baselineExpected !== null) {
            await recordNotesHistoryVersion({
              path,
              rawSource: baselineExpected,
              vaultRoot: client.rootPath,
            }).catch(() => undefined);
          }
          let result = await saveNoteToVault(client, {
            expectedRawSource: baselineExpected,
            path,
            rawSource,
            saveType,
          });

          if (
            result.status === "conflict" &&
            isSelfWrittenContent(
              selfWriteHistoryRef.current,
              path,
              result.currentRawSource,
            )
          ) {
            const selfWrittenBaseline = result.currentRawSource;

            saveBaselineRef.current.set(path, selfWrittenBaseline);
            saveMetaRef.current.set(path, {
              ...(latestMeta ?? {
                isDivergent: false,
                isMissing: false,
                lastAutoSave: null,
                savedContent: selfWrittenBaseline,
              }),
              isDivergent: false,
              isMissing: false,
              lastDiskContent: selfWrittenBaseline,
              savedContent: selfWrittenBaseline,
            });

            result = await saveNoteToVault(client, {
              expectedRawSource: selfWrittenBaseline,
              path,
              rawSource,
              saveType,
            });
          }

          if (result.status === "conflict") {
            if (saveType === "auto") {
              void refreshSnapshot({
                showLoading: false,
              });
              return {
                currentRawSource: result.currentRawSource,
                status: "conflict",
              };
            }

            saveMetaRef.current.set(path, {
              ...(latestMeta ?? {
                isDivergent: false,
                isMissing: false,
                lastAutoSave: null,
                lastDiskContent: baselineExpected,
                savedContent: baselineExpected,
              }),
              isDivergent: true,
            });
            setWriteConflict({
              expectedRawSource: baselineExpected,
              localRawSource: result.normalizedSource,
              path,
              remoteRawSource: result.currentRawSource,
            });
            setErrorMessage(null);
            return {
              currentRawSource: result.currentRawSource,
              status: "conflict",
            };
          }

          saveBaselineRef.current.set(path, result.normalizedSource);
          await recordNotesHistoryVersion({
            path,
            rawSource: result.normalizedSource,
            vaultRoot: client.rootPath,
          }).catch(() => undefined);
          rememberSelfWrittenContent(
            selfWriteHistoryRef.current,
            path,
            result.normalizedSource,
          );

          // If a newer save or a rename has occurred for this document path,
          // the write landed on disk safely, but we must not overwrite the
          // document's active identity or revive superseded in-memory state (F3).
          if (!isCurrentSaveTarget(saveClaim)) {
            return {
              persistedSource: result.normalizedSource,
              status: "saved",
            };
          }

          saveMetaRef.current.set(path, {
            isDivergent: false,
            isMissing: false,
            lastAutoSave:
              saveType === "auto"
                ? Date.now()
                : (latestMeta?.lastAutoSave ?? null),
            lastDiskContent: result.normalizedSource,
            savedContent: result.normalizedSource,
          });

          // Cleanup also awaits disk IO. A new edit can arrive while it is
          // running, so only clear the source actually saved and re-check the
          // live buffer AFTER that await before clearing its dirty flag.
          const hasNewerSource = () => dirtyPathsRef.current[path] === true &&
            (liveDocumentsRef.current[path]?.rawSource ?? rawSource) !== rawSource;
          if (!hasNewerSource()) {
            await clearNotesRecoveryDraft(path, client.rootPath, rawSource).catch(() => undefined);
          }
          if (!isCurrentSaveTarget(saveClaim)) {
            return { persistedSource: result.normalizedSource, status: "saved" };
          }
          const hasNewerLocalSource = hasNewerSource();
          dirtyPathsRef.current = { ...dirtyPathsRef.current };
          if (hasNewerLocalSource) dirtyPathsRef.current[path] = true;
          else delete dirtyPathsRef.current[path];
          setDirtyPaths({ ...dirtyPathsRef.current });

          void refreshSnapshot({
            showLoading: false,
          });

          return {
            persistedSource: result.normalizedSource,
            status: "saved",
          };
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : NOTES_UI_COPY.errors.saveNote;
          if (saveType === "manual") {
            setErrorMessage(message);
          }
          return { message, status: "failed" };
        }
      };

      const previous =
        saveChainRef.current.get(path) ??
        Promise.resolve<NotesPersistenceResult>({
          persistedSource: rawSource,
          status: "saved",
        });
      const next = previous.then(runWrite, runWrite);
      saveChainRef.current.set(path, next);

      try {
        return await next;
      } finally {
        if (saveChainRef.current.get(path) === next) {
          saveChainRef.current.delete(path);
        }
      }
    },
    [client, refreshSnapshot, setErrorMessage],
  );

  const clearPendingDerivation = useCallback((path: string) => {
    const pendingTimer = deriveTimerRef.current.get(path);

    if (!pendingTimer) {
      return;
    }

    window.clearTimeout(pendingTimer);
    deriveTimerRef.current.delete(path);
  }, []);

  const clearPendingSave = useCallback((path: string) => {
    saveChainRef.current.delete(path);
  }, []);

  const scheduleLiveDocumentDerivation = useCallback(
    (path: string, document: NoteDocument, rawSource: string) => {
      clearPendingDerivation(path);

      const timerId = window.setTimeout(() => {
        const baseDocument =
          findDocumentByPath(snapshot.documents, path) ?? document;
        const nextLiveDocuments = {
          ...liveDocumentsRef.current,
          [path]: createLiveNoteDocument(baseDocument, rawSource),
        };

        liveDocumentsRef.current = nextLiveDocuments;

        startTransition(() => {
          setLiveDocuments(nextLiveDocuments);
        });

        scheduleDerivedBacklinksRefresh(nextLiveDocuments);
        deriveTimerRef.current.delete(path);
      }, DERIVED_DOCUMENT_DEBOUNCE_MS);

      deriveTimerRef.current.set(path, timerId);
    },
    [clearPendingDerivation, scheduleDerivedBacklinksRefresh, snapshot.documents],
  );

  const clearLocalDocumentState = useCallback(
    (paths: string[]) => {
      if (paths.length === 0) {
        return;
      }

      const pathSet = new Set(paths);
      pathSet.forEach((path) => {
        clearPendingDerivation(path);
        const recoveryTimer = recoveryCaptureTimerRef.current.get(path);
        if (recoveryTimer) window.clearTimeout(recoveryTimer);
        recoveryCaptureTimerRef.current.delete(path);
        recoveryPendingDraftRef.current.delete(path);
        void clearNotesRecoveryDraft(path, client.rootPath);
        saveBaselineRef.current.delete(path);
        saveMetaRef.current.delete(path);
        delete dirtyPathsRef.current[path];
      });
      const nextLiveDocuments = Object.fromEntries(
        Object.entries(liveDocumentsRef.current).filter(
          ([path]) => !pathSet.has(path),
        ),
      );

      liveDocumentsRef.current = nextLiveDocuments;

      startTransition(() => {
        setLiveDocuments(nextLiveDocuments);
      });
      setDirtyPaths((current) => {
        const next = { ...current };
        pathSet.forEach((path) => {
          delete next[path];
        });
        return next;
      });
    },
    [clearPendingDerivation, client.rootPath],
  );

  const scheduleRecoveryCapture = useCallback(
    (draft: Parameters<typeof captureNotesRecoveryDraft>[0]) => {
      recoveryPendingDraftRef.current.set(draft.path, draft);
      if (recoveryCaptureTimerRef.current.has(draft.path)) {
        return;
      }

      const capturedSource = draft.rawSource;
      void captureNotesRecoveryDraft(draft).then((captured) => {
        if (captured === false) throw new Error(NOTES_UI_COPY.errors.recovery);
      }).catch(() => {
        setErrorMessage(NOTES_UI_COPY.errors.recovery);
      });
      const timerId = window.setTimeout(() => {
        recoveryCaptureTimerRef.current.delete(draft.path);
        const pendingDraft = recoveryPendingDraftRef.current.get(draft.path);
        recoveryPendingDraftRef.current.delete(draft.path);
        if (pendingDraft && pendingDraft.rawSource !== capturedSource) {
          void captureNotesRecoveryDraft(pendingDraft).then((captured) => {
            if (captured === false) throw new Error(NOTES_UI_COPY.errors.recovery);
          }).catch(() => {
            setErrorMessage(NOTES_UI_COPY.errors.recovery);
          });
        }
      }, RECOVERY_CAPTURE_WINDOW_MS);
      recoveryCaptureTimerRef.current.set(draft.path, timerId);
    },
    [setErrorMessage],
  );

  const handleDocumentChange = useCallback(
    (path: string, rawSource: string) => {
      const currentDocument = findDocumentByPath(documents, path);
      const snapshotDocument = findDocumentByPath(snapshot.documents, path);

      if (!currentDocument) {
        return;
      }

      const expectedRawSource = saveBaselineRef.current.has(path)
        ? (saveBaselineRef.current.get(path) ?? null)
        : (snapshotDocument?.rawSource ?? currentDocument.rawSource);
      saveBaselineRef.current.set(path, expectedRawSource);
      saveMetaRef.current.set(path, {
        ...(saveMetaRef.current.get(path) ?? {
          isDivergent: false,
          isMissing: false,
          lastAutoSave: null,
          lastDiskContent: expectedRawSource,
          savedContent: expectedRawSource,
        }),
        savedContent: expectedRawSource,
      });

      const nextLiveDocuments = {
        ...liveDocumentsRef.current,
        [path]: createLiveNoteDraft(currentDocument, rawSource),
      };

      liveDocumentsRef.current = nextLiveDocuments;
      dirtyPathsRef.current = {
        ...dirtyPathsRef.current,
        [path]: true,
      };
      scheduleRecoveryCapture({
        baseRawSource: expectedRawSource,
        path,
        rawSource,
        vaultRoot: client.rootPath,
      });

      startTransition(() => {
        setLiveDocuments(nextLiveDocuments);
      });
      setDirtyPaths((current) => ({
        ...current,
        [path]: true,
      }));

      scheduleLiveDocumentDerivation(path, currentDocument, rawSource);
    },
    [
      client.rootPath,
      documents,
      scheduleLiveDocumentDerivation,
      scheduleRecoveryCapture,
      snapshot.documents,
    ],
  );

  useEffect(() => {
    restoredRecoveryPathsRef.current.clear();
  }, [client.rootPath]);

  useEffect(() => {
    // An empty initial snapshot is not evidence that a file is missing. The
    // runtime learns the vault root before its asynchronous listing completes.
    // Classifying recovery here used to latch isMissing and disable autosave
    // even when the next snapshot contained the exact recovered file.
    if (
      snapshot.rootPath !== client.rootPath ||
      snapshot.generatedAt === new Date(0).toISOString()
    ) return;
    let cancelled = false;
    void listNotesRecoveryDrafts(client.rootPath)
      .then(async (drafts) => {
        if (cancelled || snapshot.rootPath !== client.rootPath) return;
        const loadedPaths = new Set(
          snapshot.documents.map((document) => document.path),
        );
        const entryPaths = new Set(
          snapshot.entries
            .filter((entry) => entry.kind === "file")
            .map((entry) => entry.path),
        );
        const recoveryPathsToLoad = drafts
          .map((draft) => draft.path)
          .filter(
            (path) => entryPaths.has(path) && !loadedPaths.has(path),
          );
        const shouldPreloadRecovery =
          Boolean(ensureDocuments) && recoveryPathsToLoad.length > 0;
        const ensuredSnapshot = shouldPreloadRecovery
          ? await ensureDocuments!(recoveryPathsToLoad)
          : null;
        if (cancelled) return;
        if (shouldPreloadRecovery && !ensuredSnapshot) {
          return;
        }
        const availableDocuments =
          ensuredSnapshot?.documents ?? snapshot.documents;

        drafts.forEach((draft) => {
          if (restoredRecoveryPathsRef.current.has(draft.path)) return;
          const diskDocument = findDocumentByPath(
            availableDocuments,
            draft.path,
          );
          // Presence comes from the listing; an unloaded/failed read is not a
          // missing file. Keep its recovery entry until a real read is ready.
          if (!diskDocument && entryPaths.has(draft.path)) return;
          if (diskDocument?.rawSource === draft.rawSource) {
            void clearNotesRecoveryDraft(draft.path, client.rootPath, draft.rawSource);
            return;
          }

          restoredRecoveryPathsRef.current.add(draft.path);
          const baseRawSource =
            draft.baseRawSource === undefined
              ? (diskDocument?.rawSource ?? null)
              : draft.baseRawSource;
          const isMissing = !diskDocument;
          const isDivergent =
            !isMissing &&
            baseRawSource !== null &&
            diskDocument.rawSource !== baseRawSource;
          const recoveredDocument = diskDocument
            ? createLiveNoteDocument(diskDocument, draft.rawSource)
            : createNoteDocument({
                mtime: null,
                path: draft.path,
                rawSource: draft.rawSource,
              });
          const nextLiveDocuments = {
            ...liveDocumentsRef.current,
            [draft.path]: recoveredDocument,
          };
          liveDocumentsRef.current = nextLiveDocuments;
          saveBaselineRef.current.set(
            draft.path,
            isMissing ? null : baseRawSource,
          );
          saveMetaRef.current.set(draft.path, {
            isDivergent,
            isMissing,
            lastAutoSave: null,
            lastDiskContent: diskDocument?.rawSource ?? null,
            savedContent: baseRawSource,
          });
          dirtyPathsRef.current = {
            ...dirtyPathsRef.current,
            [draft.path]: true,
          };
          startTransition(() => {
            setLiveDocuments(nextLiveDocuments);
          });
          setDirtyPaths((current) => ({
            ...current,
            [draft.path]: true,
          }));
          setWorkspace((current) => openWorkspacePath(current, draft.path));
          scheduleLiveDocumentDerivation(
            draft.path,
            recoveredDocument,
            draft.rawSource,
          );
          if (isDivergent && diskDocument) {
            setWriteConflict((current) =>
              current ?? {
                expectedRawSource: baseRawSource,
                localRawSource: draft.rawSource,
                path: draft.path,
                remoteRawSource: diskDocument.rawSource,
              },
            );
          }
        });
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMessage(NOTES_UI_COPY.errors.recovery);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    client.rootPath,
    ensureDocuments,
    scheduleLiveDocumentDerivation,
    setErrorMessage,
    setWorkspace,
    snapshot.documents,
    snapshot.entries,
    snapshot.generatedAt,
    snapshot.rootPath,
  ]);

  const persistDirtyDocument = useCallback(
    async (
      path: string,
      saveType: NotesSaveType,
    ): Promise<NotesPersistenceResult> => {
      if (mutationPathsRef.current.has(path)) {
        return { message: "笔记正在重命名，请稍后保存。", status: "failed" };
      }
      const document =
        liveDocumentsRef.current[path] ??
        findDocumentByPath(documentsRef.current, path);

      if (!document) {
        return { message: NOTES_UI_COPY.errors.saveNote, status: "failed" };
      }
      if (!dirtyPathsRef.current[path]) {
        return { persistedSource: document.rawSource, status: "saved" };
      }

      return saveDocumentNow(path, document.rawSource, saveType);
    },
    [saveDocumentNow],
  );

  const saveDirtyDocument = useCallback(
    async (path: string, saveType: NotesSaveType) =>
      (await persistDirtyDocument(path, saveType)).status === "saved",
    [persistDirtyDocument],
  );

  const handleSaveDocument = useCallback(
    (path: string) => persistDirtyDocument(path, "manual"),
    [persistDirtyDocument],
  );

  // A rename must share the save queue and disk baseline, rather than deleting
  // queue tracking while its writes are still running. Edits remain enabled;
  // reconciliation below carries edits made during IO to the new identity.
  const runDocumentMutation = useCallback(async (
    paths: string[], run: () => Promise<boolean>,
  ): Promise<boolean> => {
    const targets = [...new Set(paths)];
    if (targets.some((path) => mutationPathsRef.current.has(path))) return false;
    targets.forEach((path) => mutationPathsRef.current.add(path));
    try {
      for (const path of targets) {
        const pending = saveChainRef.current.get(path);
        if (pending && (await pending).status !== "saved") return false;
        if (!dirtyPathsRef.current[path]) continue;
        const document = liveDocumentsRef.current[path];
        if (!document || (await saveDocumentNow(path, document.rawSource, "manual")).status !== "saved") return false;
        if (dirtyPathsRef.current[path]) {
          setErrorMessage("正文仍在编辑，已保留草稿，请停止输入后重试重命名。");
          return false;
        }
      }
      return await run();
    } finally {
      targets.forEach((path) => mutationPathsRef.current.delete(path));
      setDirtyPaths((current) => ({ ...current }));
    }
  }, [saveDocumentNow, setErrorMessage]);

  const reconcileDocumentRename = useCallback(async (input: {
    path: string; nextPath: string; nextTitle?: string;
    documents: NoteDocument[];
    persistedSources: Map<string, string>;
  }) => {
    const currentDocuments = input.documents.map((doc) => liveDocumentsRef.current[doc.path] ?? doc);
    const writes = input.nextTitle !== undefined
      ? buildRenameNotePlan(currentDocuments, { path: input.path, nextTitle: input.nextTitle }).writes
      : currentDocuments.filter((doc) => doc.path === input.path || doc.path.startsWith(`${input.path}/`))
        .map((doc) => ({ path: input.nextPath + doc.path.slice(input.path.length), rawSource: doc.rawSource }));
    const recoveryUpdates: Promise<unknown>[] = [];
    const nextLive = { ...liveDocumentsRef.current };
    const nextDirty = { ...dirtyPathsRef.current };
    for (const write of writes) {
      const oldPath = input.nextTitle !== undefined
        ? (write.path === input.nextPath ? input.path : write.path)
        : input.path + write.path.slice(input.nextPath.length);
      const oldRawSource = currentDocuments.find((doc) => doc.path === oldPath)?.rawSource;
      clearPendingDerivation(oldPath);
      const timer = recoveryCaptureTimerRef.current.get(oldPath);
      if (timer) window.clearTimeout(timer);
      recoveryCaptureTimerRef.current.delete(oldPath);
      recoveryPendingDraftRef.current.delete(oldPath);
      const baseline = input.persistedSources.get(write.path);
      if (baseline === undefined) continue;
      const currentMeta = saveMetaRef.current.get(oldPath);
      delete nextLive[oldPath];
      delete nextDirty[oldPath];
      saveBaselineRef.current.delete(oldPath);
      saveMetaRef.current.delete(oldPath);
      nextLive[write.path] = createNoteDocument({ path: write.path, rawSource: write.rawSource, mtime: null });
      saveBaselineRef.current.set(write.path, baseline);
      saveMetaRef.current.set(write.path, { isDivergent: false, isMissing: false,
        lastAutoSave: currentMeta?.lastAutoSave ?? null, lastDiskContent: baseline, savedContent: baseline });
      rememberSelfWrittenContent(selfWriteHistoryRef.current, write.path, baseline);
      if (write.rawSource !== baseline) {
        nextDirty[write.path] = true;
        // Capture the new identity before removing the old recovery entry.
        recoveryUpdates.push(captureNotesRecoveryDraft({ path: write.path, rawSource: write.rawSource,
          baseRawSource: baseline, vaultRoot: client.rootPath }).then((captured) => {
          if (captured === false) throw new Error(NOTES_UI_COPY.errors.recovery);
          if (oldPath !== write.path) return clearNotesRecoveryDraft(oldPath, client.rootPath, oldRawSource);
        }));
      } else {
        recoveryUpdates.push(clearNotesRecoveryDraft(oldPath, client.rootPath, oldRawSource));
        if (oldPath !== write.path) recoveryUpdates.push(clearNotesRecoveryDraft(write.path, client.rootPath, write.rawSource));
      }
    }
    liveDocumentsRef.current = nextLive;
    dirtyPathsRef.current = nextDirty;
    setLiveDocuments(nextLive);
    setDirtyPaths(nextDirty);
    const results = await Promise.allSettled(recoveryUpdates);
    if (results.some((result) => result.status === "rejected")) {
      setErrorMessage(NOTES_UI_COPY.errors.recovery);
      throw new Error(NOTES_UI_COPY.errors.recovery);
    }
  }, [clearPendingDerivation, client.rootPath, setErrorMessage]);

  const handleSaveActiveDocument = useCallback(async () => {
    if (!workspace.activePath) {
      return false;
    }

    return saveDirtyDocument(workspace.activePath, "manual");
  }, [saveDirtyDocument, workspace.activePath]);

  const handleSaveAllDocuments = useCallback(async () => {
    const currentDirtyPaths = dirtyPathsRef.current;
    const dirtyOpenPaths = workspace.openTabs.filter(
      (path) => currentDirtyPaths[path],
    );
    const dirtyPathsSet = new Set([
      ...dirtyOpenPaths,
      ...Object.keys(currentDirtyPaths),
    ]);
    const results = await Promise.all(
      [...dirtyPathsSet].map((path) => saveDirtyDocument(path, "manual")),
    );

    return results.every(Boolean);
  }, [saveDirtyDocument, workspace.openTabs]);

  useEffect(() => {
    const dirtyDocumentPaths = Object.keys(dirtyPaths).filter(
      (path) => dirtyPaths[path],
    );

    if (dirtyDocumentPaths.length === 0) {
      return;
    }

    const timerId = window.setTimeout(() => {
      dirtyDocumentPaths.forEach((path) => {
        const meta = saveMetaRef.current.get(path);

        if (meta?.isMissing || meta?.isDivergent) {
          return;
        }

        void saveDirtyDocument(path, "auto");
      });
    }, AUTO_SAVE_SETTLE_MS);

    return () => window.clearTimeout(timerId);
  }, [dirtyPaths, saveDirtyDocument]);

  const clearConflictState = useCallback(
    async (path: string, nextRawSource: string | null) => {
      clearPendingDerivation(path);
      clearPendingSave(path);
      saveBaselineRef.current.delete(path);
      clearLocalDocumentState([path]);
      setWriteConflict(null);

      if (nextRawSource !== null) {
        saveBaselineRef.current.set(path, nextRawSource);
        saveMetaRef.current.set(path, {
          isDivergent: false,
          isMissing: false,
          lastAutoSave: null,
          lastDiskContent: nextRawSource,
          savedContent: nextRawSource,
        });
      }

      await refreshSnapshot({
        showLoading: false,
      });
    },
    [
      clearLocalDocumentState,
      clearPendingDerivation,
      clearPendingSave,
      refreshSnapshot,
    ],
  );

  const revalidateWriteConflict = useCallback(
    async (conflict: VaultWriteConflict) => {
      const latestSnapshot = await refreshSnapshot({
        eagerPaths: [conflict.path],
        showLoading: false,
      });
      const currentDiskContent =
        latestSnapshot?.documents.find(({ path }) => path === conflict.path)
          ?.rawSource ?? null;
      const staleReason = getVaultWriteConflictStaleReason(conflict, {
        currentDiskContent,
        dirty: dirtyPathsRef.current[conflict.path] === true,
        documentPath: liveDocumentsRef.current[conflict.path]?.path ?? null,
      });

      if (!staleReason) {
        return true;
      }

      if (
        staleReason === "disk-changed" &&
        dirtyPathsRef.current[conflict.path] === true &&
        liveDocumentsRef.current[conflict.path]?.path === conflict.path
      ) {
        setWriteConflict({
          ...conflict,
          localRawSource:
            liveDocumentsRef.current[conflict.path]?.rawSource ??
            conflict.localRawSource,
          remoteRawSource: currentDiskContent,
        });
      } else {
        setWriteConflict(null);
      }
      setErrorMessage("文件状态已再次变化，已重新读取磁盘内容，请按最新状态处理冲突。");
      return false;
    },
    [refreshSnapshot, setErrorMessage],
  );

  const handleReloadWriteConflict = useCallback(async () => {
    if (!writeConflict) {
      return;
    }

    if (!(await revalidateWriteConflict(writeConflict))) {
      return;
    }

    await clearConflictState(writeConflict.path, null);
  }, [clearConflictState, revalidateWriteConflict, writeConflict]);

  const handleKeepWriteConflict = useCallback(async () => {
    if (!writeConflict) {
      return;
    }

    if (!(await revalidateWriteConflict(writeConflict))) {
      return;
    }

    saveMetaRef.current.set(writeConflict.path, {
      ...(saveMetaRef.current.get(writeConflict.path) ?? {
        isMissing: false,
        lastAutoSave: null,
        savedContent: writeConflict.expectedRawSource,
      }),
      isDivergent: true,
      isMissing: false,
      lastDiskContent: writeConflict.remoteRawSource,
    });
    saveBaselineRef.current.set(
      writeConflict.path,
      writeConflict.remoteRawSource,
    );
    setWriteConflict(null);
    setErrorMessage(null);
  }, [revalidateWriteConflict, setErrorMessage, writeConflict]);

  const handleCopyWriteConflictDiff = useCallback(async () => {
    if (!writeConflict) {
      return;
    }

    const diff = buildVaultWriteConflictDiff(writeConflict);

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }

      await navigator.clipboard.writeText(diff);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : NOTES_UI_COPY.errors.saveNote,
      );
    }
  }, [setErrorMessage, writeConflict]);

  return {
    activeDocument,
    backlinks,
    clearLocalDocumentState,
    clearPendingDerivation,
    clearPendingSave,
    runDocumentMutation,
    reconcileDocumentRename,
    dirtyPaths,
    documents,
    handleDocumentChange,
    handleSaveActiveDocument,
    handleSaveAllDocuments,
    handleSaveDocument,
    handleCopyWriteConflictDiff,
    handleKeepWriteConflict,
    handleReloadWriteConflict,
    searchResults,
    writeConflict,
  };
}
