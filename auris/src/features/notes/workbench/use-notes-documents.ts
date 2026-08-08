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
import type { NoteDocument } from "@/features/notes/documents/document-types";
import { searchDocuments } from "@/features/notes/documents/document-search";
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

// VMark-style save model: typing updates the local working copy immediately,
// while persistence follows once typing settles. The settle window stays above
// the editor derivation debounce so file IO remains off the keystroke path.
const AUTO_SAVE_SETTLE_MS = 2_000;
const DERIVED_DOCUMENT_DEBOUNCE_MS = 180;
const DERIVED_INDEX_DEBOUNCE_MS = 180;
const SELF_WRITE_HISTORY_LIMIT = 8;

type UseNotesDocumentsInput = {
  client: NotesRuntimeClient;
  resumeNoteId?: string | null;
  searchQuery: string;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
  setWorkspace: Dispatch<SetStateAction<NotesWorkspaceState>>;
  refreshSnapshot: (options?: { showLoading?: boolean }) => Promise<VaultSnapshot | null>;
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
  // Serializes in-flight writes per path so overlapping autosaves cannot run
  // concurrently. Concurrent writes were reading a stale baseline and falsely
  // reporting an "external editor conflict" while the user was simply typing.
  const saveChainRef = useRef<Map<string, Promise<boolean>>>(new Map());
  const backlinksTimerRef = useRef<number | null>(null);
  const liveDocumentsRef = useRef<LiveNoteDocuments>({});
  // The resume target (?resumeNoteId=…) must only seed the *initial* active
  // note. Once honored, it must never win again, otherwise every later click /
  // newly created note gets yanked back to the resume note on the next render.
  const resumeConsumedRef = useRef(false);

  const [liveDocuments, setLiveDocuments] = useState<LiveNoteDocuments>({});
  const [backlinksIndex, setBacklinksIndex] = useState<
    Record<string, string[]>
  >({});
  const [dirtyPaths, setDirtyPaths] = useState<Record<string, boolean>>({});
  const [writeConflict, setWriteConflict] = useState<VaultWriteConflict | null>(
    null,
  );

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

    return () => {
      if (backlinksTimerRef.current) {
        window.clearTimeout(backlinksTimerRef.current);
      }

      deriveTimers.forEach((timerId) => window.clearTimeout(timerId));
      deriveTimers.clear();
    };
  }, []);

  useEffect(() => {
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
      snapshot.documents.map((document) => document.path),
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
  }, [dirtyPaths, snapshot.documents]);

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
    ): Promise<boolean> => {
      const meta = saveMetaRef.current.get(path);

      if (meta?.isMissing || meta?.isDivergent) {
        return false;
      }

      const runWrite = async () => {
        const latestMeta = saveMetaRef.current.get(path) ?? meta;
        const baselineExpected = saveBaselineRef.current.has(path)
          ? (saveBaselineRef.current.get(path) ?? null)
          : (latestMeta?.lastDiskContent ?? rawSource);

        try {
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
              return false;
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
            return false;
          }

          saveBaselineRef.current.set(path, result.normalizedSource);
          rememberSelfWrittenContent(
            selfWriteHistoryRef.current,
            path,
            result.normalizedSource,
          );
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

          const latestLocalSource =
            liveDocumentsRef.current[path]?.rawSource ?? rawSource;
          const hasNewerLocalSource =
            dirtyPathsRef.current[path] === true &&
            latestLocalSource !== rawSource;

          dirtyPathsRef.current = {
            ...dirtyPathsRef.current,
          };

          if (hasNewerLocalSource) {
            dirtyPathsRef.current[path] = true;
          } else {
            delete dirtyPathsRef.current[path];
          }

          setDirtyPaths((current) =>
            hasNewerLocalSource
              ? {
                  ...current,
                  [path]: true,
                }
              : (() => {
                  const next = { ...current };
                  delete next[path];
                  return next;
                })(),
          );

          void refreshSnapshot({
            showLoading: false,
          });

          return true;
        } catch (error) {
          if (saveType === "manual") {
            setErrorMessage(
              error instanceof Error
                ? error.message
                : NOTES_UI_COPY.errors.saveNote,
            );
          }
          return false;
        }
      };

      const previous = saveChainRef.current.get(path) ?? Promise.resolve(true);
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
    [clearPendingDerivation],
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
      documents,
      scheduleLiveDocumentDerivation,
      snapshot.documents,
    ],
  );

  const saveDirtyDocument = useCallback(
    async (path: string, saveType: NotesSaveType) => {
      if (!dirtyPathsRef.current[path]) {
        return true;
      }

      const document =
        liveDocumentsRef.current[path] ??
        findDocumentByPath(documentsRef.current, path);

      if (!document) {
        return false;
      }

      return saveDocumentNow(path, document.rawSource, saveType);
    },
    [saveDocumentNow],
  );

  const handleSaveActiveDocument = useCallback(async () => {
    if (!workspace.activePath) {
      return false;
    }

    return saveDirtyDocument(workspace.activePath, "manual");
  }, [saveDirtyDocument, workspace.activePath]);

  const handleSaveAllDocuments = useCallback(async () => {
    const currentDirtyPaths = dirtyPathsRef.current;
    const dirtyOpenPaths = workspace.openTabs.filter((path) => currentDirtyPaths[path]);
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

  const handleReloadWriteConflict = useCallback(async () => {
    if (!writeConflict) {
      return;
    }

    await clearConflictState(writeConflict.path, null);
  }, [clearConflictState, writeConflict]);

  const handleKeepWriteConflict = useCallback(async () => {
    if (!writeConflict) {
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
  }, [setErrorMessage, writeConflict]);

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
    dirtyPaths,
    documents,
    handleDocumentChange,
    handleSaveActiveDocument,
    handleSaveAllDocuments,
    handleCopyWriteConflictDiff,
    handleKeepWriteConflict,
    handleReloadWriteConflict,
    searchResults,
    writeConflict,
  };
}
