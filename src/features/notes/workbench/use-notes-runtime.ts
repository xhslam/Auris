"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import type { NotesDirectoryInfo } from "@/features/notes/note-types";
import { createBrowserVaultClient } from "@/features/notes/vault/browser-vault-client";
import { createDesktopVaultClient } from "@/platform/desktop/vault-client";
import { createVaultStore } from "@/features/notes/vault/vault-store";
import { bumpNotesMediaReloadKey } from "@/features/notes/editor/notes-media-reload";
import { buildVaultExportManifest } from "@/features/notes/vault/vault-export-manifest";
import {
  formatVaultExportValidationIssues,
  validateVaultExportManifest,
} from "@/features/notes/vault/vault-export-validation";
import type {
  VaultClient,
  VaultSnapshot,
} from "@/features/notes/vault/vault-types";
import type { SavedSentenceRecord } from "@/features/sentencebook/local-sentencebook-store";
import { getBrowserSentencebookStorage } from "@/features/sentencebook/local-sentencebook-store";
import type { SavedWordRecord } from "@/features/wordbook/local-wordbook-store";
import { getBrowserWordbookStorage } from "@/features/wordbook/local-wordbook-store";
import type { DesktopCommandRecord } from "@/platform/desktop/desktop-bridge";
import { getDesktopBridge } from "@/platform/desktop/desktop-runtime";
import { getFileExportService } from "@/platform/services";
import { createDesktopVaultService } from "@/platform/desktop/vault-service";
import { detectRuntime } from "@/platform/runtime";

type RefreshSnapshotOptions = {
  eagerPaths?: readonly string[];
  showLoading?: boolean;
};

type IndexRebuildState = "failed" | "idle" | "rebuilding" | "succeeded";

export type NotesRuntimeClient = VaultClient &
  Partial<{
    getDirectoryInfo: () => Promise<NotesDirectoryInfo>;
    pickDirectory: () => Promise<NotesDirectoryInfo>;
    pickFile: () => Promise<{ directoryInfo: NotesDirectoryInfo; selectedFilePath: string | null }>;
  }>;

function createEmptySnapshot(rootPath: string | null): VaultSnapshot {
  return {
    backlinks: {},
    documents: [],
    entries: [],
    generatedAt: new Date(0).toISOString(),
    rootPath,
  };
}

function createDirectoryInfo(
  runtimePlatform: ReturnType<typeof detectRuntime>["platform"],
  rootPath: string | null,
): NotesDirectoryInfo {
  return {
    connectionStatus: runtimePlatform === "desktop" ? "unknown" : "configured",
    directoryName:
      runtimePlatform === "desktop"
        ? null
        : NOTES_UI_COPY.workspace.browserFallback,
    isConfigured: runtimePlatform !== "desktop",
    isSupported: true,
    vaultPath: rootPath,
  };
}

export function useNotesRuntime() {
  const runtime = useMemo(() => detectRuntime(), []);
  const desktopBridge = useMemo(() => getDesktopBridge(), []);
  const desktopVaultService = useMemo(
    () => (desktopBridge ? createDesktopVaultService(desktopBridge) : null),
    [desktopBridge],
  );
  const client = useMemo<NotesRuntimeClient>(() => {
    if (runtime.isDesktopApp && desktopVaultService) {
      return createDesktopVaultClient(desktopVaultService);
    }

    return createBrowserVaultClient();
  }, [desktopVaultService, runtime.isDesktopApp]);
  const vaultStore = useMemo(() => createVaultStore(client), [client]);

  const [snapshot, setSnapshot] = useState<VaultSnapshot>(() =>
    createEmptySnapshot(client.rootPath),
  );
  const [directoryInfo, setDirectoryInfo] = useState<NotesDirectoryInfo>(() =>
    createDirectoryInfo(runtime.platform, client.rootPath),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [indexRebuildState, setIndexRebuildState] =
    useState<IndexRebuildState>("idle");
  const [lastIndexRebuiltAt, setLastIndexRebuiltAt] = useState<string | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [desktopCommands, setDesktopCommands] = useState<
    DesktopCommandRecord[]
  >([]);
  const [sentences, setSentences] = useState<SavedSentenceRecord[]>([]);
  const [words, setWords] = useState<SavedWordRecord[]>([]);

  const currentRootIdRef = useRef<string>(client.rootPath ?? "vault");
  const currentGenerationRef = useRef<number>(1);
  const committedRevisionRef = useRef<number>(0);
  const activeRequestIdRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const nextRootId = client.rootPath ?? "vault";
    if (nextRootId !== currentRootIdRef.current) {
      currentRootIdRef.current = nextRootId;
      currentGenerationRef.current += 1;
      committedRevisionRef.current = 0;
    }
  }, [client.rootPath]);

  const refreshSnapshot = useCallback(
    async (options?: RefreshSnapshotOptions) => {
      const showLoading = options?.showLoading ?? true;
      const reqId = ++activeRequestIdRef.current;
      const targetGeneration = currentGenerationRef.current;
      const targetRootId = currentRootIdRef.current;

      if (showLoading) {
        setIsLoading(true);
      }

      // Launch directory info query concurrently without blocking listing
      const directoryInfoPromise = client.getDirectoryInfo
        ? client.getDirectoryInfo().catch(() => null)
        : Promise.resolve(createDirectoryInfo(runtime.platform, client.rootPath));

      void directoryInfoPromise.then((info) => {
        if (!info || !isMountedRef.current) return;
        if (
          currentGenerationRef.current !== targetGeneration ||
          currentRootIdRef.current !== targetRootId
        ) {
          return;
        }
        startTransition(() => {
          setDirectoryInfo(info);
        });
      });

      try {
        const nextSnapshot = await vaultStore.refresh({
          eagerPaths: options?.eagerPaths,
        });

        if (
          !isMountedRef.current ||
          currentGenerationRef.current !== targetGeneration ||
          currentRootIdRef.current !== targetRootId ||
          (nextSnapshot.revision != null &&
            nextSnapshot.revision <= committedRevisionRef.current)
        ) {
          return null;
        }

        if (nextSnapshot.revision != null) {
          committedRevisionRef.current = nextSnapshot.revision;
        }

        startTransition(() => {
          setSnapshot(nextSnapshot);
          setErrorMessage(null);
        });

        return nextSnapshot;
      } catch (error) {
        if (isMountedRef.current && activeRequestIdRef.current === reqId) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : NOTES_UI_COPY.errors.loadVault,
          );
        }
        return null;
      } finally {
        if (showLoading && isMountedRef.current && activeRequestIdRef.current === reqId) {
          setIsLoading(false);
        }
      }
    },
    [client, runtime.platform, vaultStore],
  );

  const ensureDocuments = useCallback(
    async (paths: readonly string[]) => {
      const reqId = ++activeRequestIdRef.current;
      const targetGeneration = currentGenerationRef.current;
      const targetRootId = currentRootIdRef.current;

      try {
        const nextSnapshot = await vaultStore.loadDocuments(paths);

        if (
          !isMountedRef.current ||
          currentGenerationRef.current !== targetGeneration ||
          currentRootIdRef.current !== targetRootId ||
          (nextSnapshot.revision != null &&
            nextSnapshot.revision <= committedRevisionRef.current)
        ) {
          return null;
        }

        if (nextSnapshot.revision != null) {
          committedRevisionRef.current = nextSnapshot.revision;
        }

        startTransition(() => {
          setSnapshot(nextSnapshot);
          setErrorMessage(null);
        });

        return nextSnapshot;
      } catch (error) {
        if (isMountedRef.current && activeRequestIdRef.current === reqId) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : NOTES_UI_COPY.errors.loadVault,
          );
        }
        return null;
      }
    },
    [vaultStore],
  );

  const rebuildIndex = useCallback(async () => {
    setIndexRebuildState("rebuilding");
    const reqId = ++activeRequestIdRef.current;
    const targetGeneration = currentGenerationRef.current;
    const targetRootId = currentRootIdRef.current;

    const directoryInfoPromise = client.getDirectoryInfo
      ? client.getDirectoryInfo().catch(() => null)
      : Promise.resolve(createDirectoryInfo(runtime.platform, client.rootPath));

    void directoryInfoPromise.then((info) => {
      if (!info || !isMountedRef.current) return;
      if (
        currentGenerationRef.current !== targetGeneration ||
        currentRootIdRef.current !== targetRootId
      ) {
        return;
      }
      startTransition(() => {
        setDirectoryInfo(info);
      });
    });

    try {
      const nextSnapshot = await vaultStore.rebuildIndex();
      const rebuiltAt = new Date().toISOString();

      if (
        !isMountedRef.current ||
        currentGenerationRef.current !== targetGeneration ||
        currentRootIdRef.current !== targetRootId ||
        (nextSnapshot.revision != null &&
          nextSnapshot.revision <= committedRevisionRef.current)
      ) {
        return null;
      }

      if (nextSnapshot.revision != null) {
        committedRevisionRef.current = nextSnapshot.revision;
      }

      startTransition(() => {
        setSnapshot(nextSnapshot);
        setErrorMessage(null);
        setLastIndexRebuiltAt(rebuiltAt);
        setIndexRebuildState("succeeded");
      });

      return nextSnapshot;
    } catch (error) {
      if (isMountedRef.current && activeRequestIdRef.current === reqId) {
        startTransition(() => {
          setIndexRebuildState("failed");
          setErrorMessage(
            error instanceof Error
              ? error.message
              : NOTES_UI_COPY.errors.loadVault,
          );
        });
      }
      return null;
    }
  }, [client, runtime.platform, vaultStore]);

  const indexRebuildMessage = useMemo(() => {
    if (indexRebuildState === "rebuilding") {
      return NOTES_UI_COPY.indexStatus.rebuilding;
    }

    if (indexRebuildState === "failed") {
      return NOTES_UI_COPY.indexStatus.failed;
    }

    if (indexRebuildState === "succeeded" && lastIndexRebuiltAt) {
      return `${NOTES_UI_COPY.indexStatus.rebuiltPrefix} ${new Date(
        lastIndexRebuiltAt,
      ).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    }

    return null;
  }, [indexRebuildState, lastIndexRebuiltAt]);

  useEffect(() => {
    void refreshSnapshot();

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = vaultStore.subscribeToExternalChanges(() => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(async () => {
        debounceTimer = null;
        const result = await refreshSnapshot({
          showLoading: false,
        });
        if (result) {
          bumpNotesMediaReloadKey();
        }
      }, 75);
    });

    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      unsubscribe();
    };
  }, [refreshSnapshot, vaultStore]);

  useEffect(() => {
    const sentencebook = getBrowserSentencebookStorage();
    const wordbook = getBrowserWordbookStorage();

    void sentencebook?.listSentences().then((records) => setSentences(records));
    void wordbook?.listWords().then((records) => setWords(records));
  }, []);

  const refreshDesktopCommands = useCallback(async () => {
    if (!desktopBridge) {
      setDesktopCommands([]);
      return;
    }

    try {
      setDesktopCommands(await desktopBridge.commands.list());
    } catch {
      setDesktopCommands([]);
    }
  }, [desktopBridge]);

  const handleExportVault = useCallback(async () => {
    try {
      const exportSnapshot = await vaultStore.rebuildIndex();
      const manifest = buildVaultExportManifest(exportSnapshot, {
        sentences,
        words,
      });
      startTransition(() => {
        setSnapshot(exportSnapshot);
      });
      const validation = validateVaultExportManifest(manifest);

      if (!validation.valid) {
        throw new Error(formatVaultExportValidationIssues(validation.issues));
      }

      const exportService = getFileExportService();

      if ("exportVaultFolder" in exportService) {
        await exportService.exportVaultFolder("shadowing-vault-export", manifest);
        return;
      }

      await exportService.exportJson("shadowing-vault-manifest.json", manifest);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : NOTES_UI_COPY.errors.exportVault,
      );
    }
  }, [sentences, setErrorMessage, vaultStore, words]);

  useEffect(() => {
    void refreshDesktopCommands();
  }, [refreshDesktopCommands]);

  return {
    client,
    desktopBridge,
    desktopCommands,
    directoryInfo,
    errorMessage,
    ensureDocuments,
    handleExportVault,
    indexRebuildMessage,
    isLoading,
    isRebuildingIndex: indexRebuildState === "rebuilding",
    rebuildIndex,
    refreshDesktopCommands,
    refreshSnapshot,
    runtime,
    sentences,
    setDirectoryInfo,
    setErrorMessage,
    snapshot,
    vaultStore,
    words,
  };
}
