import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNoteDocument } from "@/features/notes/documents/document-repository";
import { useNotesDocuments } from "@/features/notes/workbench/use-notes-documents";
import { createWorkspaceState } from "@/features/notes/workspace/workspace-store";
import type { NotesRuntimeClient } from "@/features/notes/workbench/use-notes-runtime";
import type { VaultSnapshot } from "@/features/notes/vault/vault-types";
import { resetNotesRecoveryMigrationForTests } from "@/features/notes/persistence/notes-recovery-store";

const NOTE_PATH = "notes/daily.md";
const ORIGINAL_SOURCE = "# Daily\n\nBefore";

function createSnapshot(rawSource = ORIGINAL_SOURCE): VaultSnapshot {
  return {
    backlinks: {},
    documents: [
      createNoteDocument({
        mtime: "2026-07-27T00:00:00.000Z",
        path: NOTE_PATH,
        rawSource,
      }),
    ],
    entries: [
      {
        kind: "file",
        mtime: "2026-07-27T00:00:00.000Z",
        name: "daily.md",
        path: NOTE_PATH,
        size: rawSource.length,
      },
    ],
    generatedAt: "2026-07-27T00:00:00.000Z",
    rootPath: "C:/vault",
  };
}

function createClient(input: {
  readFile: NotesRuntimeClient["readFile"];
  writeFile: NotesRuntimeClient["writeFile"];
}): NotesRuntimeClient {
  return {
    createDirectory: vi.fn(async () => undefined),
    deleteEntry: vi.fn(async () => undefined),
    listEntries: vi.fn(async () => []),
    moveEntry: vi.fn(async () => undefined),
    readFile: input.readFile,
    renameEntry: vi.fn(async () => undefined),
    rootPath: "C:/vault",
    subscribeToChanges: vi.fn(() => () => undefined),
    writeFile: input.writeFile,
  };
}

function createWorkspace() {
  return {
    ...createWorkspaceState(),
    activePath: NOTE_PATH,
    openTabs: [NOTE_PATH],
  };
}

describe("useNotesDocuments save integrity", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.shadowingDesktop = undefined;
    resetNotesRecoveryMigrationForTests();
  });

  it("keeps a missing-file recovery draft open and recreates it only on manual save", async () => {
    const recoveredPath = "notes/recovered.md";
    const recoveredSource = "# Recovered\n\nUnsaved";
    window.localStorage.setItem(
      "auris.notes.hot-exit.v1",
      JSON.stringify([
        {
          baseRawSource: "# Recovered\n\nSaved",
          capturedAt: "2026-07-29T06:00:00.000Z",
          path: recoveredPath,
          rawSource: recoveredSource,
          schemaVersion: 2,
          vaultRoot: "C:/vault",
        },
      ]),
    );
    let diskSource: string | null = null;
    const writeFile = vi.fn(async (_path: string, source: string) => {
      diskSource = source;
    });
    const client = createClient({
      readFile: vi.fn(async () => diskSource),
      writeFile,
    });
    const emptySnapshot = {
      ...createSnapshot(),
      documents: [],
      entries: [],
    };
    const { result } = renderHook(() =>
      useNotesDocuments({
        client,
        refreshSnapshot: vi.fn(async () => emptySnapshot),
        searchQuery: "",
        setErrorMessage: vi.fn(),
        setWorkspace: vi.fn(),
        snapshot: emptySnapshot,
        workspace: createWorkspaceState(),
      }),
    );

    await waitFor(() => {
      expect(result.current.documents).toEqual([
        expect.objectContaining({
          path: recoveredPath,
          rawSource: recoveredSource,
        }),
      ]);
      expect(result.current.dirtyPaths[recoveredPath]).toBe(true);
    });
    expect(writeFile).not.toHaveBeenCalled();

    await act(async () => {
      await expect(
        result.current.handleSaveDocument(recoveredPath),
      ).resolves.toMatchObject({ status: "saved" });
    });
    expect(writeFile).toHaveBeenCalledWith(recoveredPath, recoveredSource);
  });

  it("loads an existing lazy document before classifying a recovery draft", async () => {
    const localSource = "# Daily\n\nRecovered edit";
    const externalSource = "# Daily\n\nExternal during restart";
    window.localStorage.setItem(
      "auris.notes.hot-exit.v1",
      JSON.stringify([
        {
          baseRawSource: ORIGINAL_SOURCE,
          capturedAt: "2026-07-29T06:00:00.000Z",
          path: NOTE_PATH,
          rawSource: localSource,
          schemaVersion: 2,
          vaultRoot: "C:/vault",
        },
      ]),
    );
    const fullSnapshot = createSnapshot(externalSource);
    const lazySnapshot = { ...fullSnapshot, documents: [] };
    const ensureDocuments = vi.fn(async () => fullSnapshot);
    const writeFile = vi.fn(async () => undefined);
    const client = createClient({
      readFile: vi.fn(async () => externalSource),
      writeFile,
    });
    const { result } = renderHook(() =>
      useNotesDocuments({
        client,
        ensureDocuments,
        refreshSnapshot: vi.fn(async () => fullSnapshot),
        searchQuery: "",
        setErrorMessage: vi.fn(),
        setWorkspace: vi.fn(),
        snapshot: lazySnapshot,
        workspace: createWorkspace(),
      }),
    );

    await waitFor(() => {
      expect(ensureDocuments).toHaveBeenCalledWith([NOTE_PATH]);
      expect(result.current.writeConflict).toMatchObject({
        expectedRawSource: ORIGINAL_SOURCE,
        localRawSource: localSource,
        path: NOTE_PATH,
        remoteRawSource: externalSource,
      });
    });
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("defers recovery classification when a lazy preload fails", async () => {
    const localSource = "# Daily\n\nRecovered edit";
    const externalSource = "# Daily\n\nExternal during restart";
    window.localStorage.setItem(
      "auris.notes.hot-exit.v1",
      JSON.stringify([
        {
          baseRawSource: ORIGINAL_SOURCE,
          capturedAt: "2026-07-29T06:00:00.000Z",
          path: NOTE_PATH,
          rawSource: localSource,
          schemaVersion: 2,
          vaultRoot: "C:/vault",
        },
      ]),
    );
    const fullSnapshot = createSnapshot(externalSource);
    const lazySnapshot = { ...fullSnapshot, documents: [] };
    const ensureDocuments = vi.fn(async () => null);
    const client = createClient({
      readFile: vi.fn(async () => externalSource),
      writeFile: vi.fn(async () => undefined),
    });
    const { result, rerender } = renderHook(
      ({ snapshot }) =>
        useNotesDocuments({
          client,
          ensureDocuments,
          refreshSnapshot: vi.fn(async () => fullSnapshot),
          searchQuery: "",
          setErrorMessage: vi.fn(),
          setWorkspace: vi.fn(),
          snapshot,
          workspace: createWorkspaceState(),
        }),
      { initialProps: { snapshot: lazySnapshot } },
    );

    await waitFor(() => expect(ensureDocuments).toHaveBeenCalled());
    expect(result.current.writeConflict).toBeNull();

    ensureDocuments.mockResolvedValue(fullSnapshot);
    const callsBeforeRetry = ensureDocuments.mock.calls.length;
    rerender({
      snapshot: { ...lazySnapshot, entries: [...lazySnapshot.entries] },
    });
    await waitFor(() => {
      expect(ensureDocuments.mock.calls.length).toBeGreaterThan(
        callsBeforeRetry,
      );
      expect(result.current.writeConflict).toMatchObject({
        expectedRawSource: ORIGINAL_SOURCE,
        remoteRawSource: externalSource,
      });
    });
  });

  it("restores against the captured disk baseline and surfaces restart-time divergence", async () => {
    const localSource = "# Daily\n\nRecovered edit";
    const externalSource = "# Daily\n\nExternal during restart";
    window.localStorage.setItem(
      "auris.notes.hot-exit.v1",
      JSON.stringify([
        {
          baseRawSource: ORIGINAL_SOURCE,
          capturedAt: "2026-07-29T06:00:00.000Z",
          path: NOTE_PATH,
          rawSource: localSource,
          schemaVersion: 2,
          vaultRoot: "C:/vault",
        },
      ]),
    );
    const snapshot = createSnapshot(externalSource);
    const writeFile = vi.fn(async () => undefined);
    const client = createClient({
      readFile: vi.fn(async () => externalSource),
      writeFile,
    });
    const { result } = renderHook(() =>
      useNotesDocuments({
        client,
        refreshSnapshot: vi.fn(async () => snapshot),
        searchQuery: "",
        setErrorMessage: vi.fn(),
        setWorkspace: vi.fn(),
        snapshot,
        workspace: createWorkspace(),
      }),
    );

    await waitFor(() => {
      expect(result.current.writeConflict).toMatchObject({
        expectedRawSource: ORIGINAL_SOURCE,
        localRawSource: localSource,
        path: NOTE_PATH,
        remoteRawSource: externalSource,
      });
    });
    expect(result.current.activeDocument?.rawSource).toBe(localSource);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("keeps the document dirty and surfaces the error after a failed manual save", async () => {
    const setErrorMessage = vi.fn();
    const client = createClient({
      readFile: vi.fn(async () => ORIGINAL_SOURCE),
      writeFile: vi.fn(async () => {
        throw new Error("disk full");
      }),
    });
    const snapshot = createSnapshot();
    const { result } = renderHook(() =>
      useNotesDocuments({
        client,
        refreshSnapshot: vi.fn(async () => snapshot),
        searchQuery: "",
        setErrorMessage,
        setWorkspace: vi.fn(),
        snapshot,
        workspace: createWorkspace(),
      }),
    );

    act(() => {
      result.current.handleDocumentChange(NOTE_PATH, "# Daily\n\nLocal edit");
    });
    await waitFor(() => {
      expect(result.current.dirtyPaths[NOTE_PATH]).toBe(true);
    });
    await waitFor(() => {
      expect(
        JSON.parse(
          window.localStorage.getItem("auris.notes.hot-exit.v1") ?? "[]",
        ),
      ).toMatchObject([
        {
          baseRawSource: ORIGINAL_SOURCE,
          path: NOTE_PATH,
          rawSource: "# Daily\n\nLocal edit",
        },
      ]);
    });

    let saved = true;
    await act(async () => {
      saved = await result.current.handleSaveActiveDocument();
    });

    expect(saved).toBe(false);
    expect(result.current.dirtyPaths[NOTE_PATH]).toBe(true);
    expect(setErrorMessage).toHaveBeenCalledWith("disk full");
  });

  it("turns an external edit into a conflict without writing over it", async () => {
    const writeFile = vi.fn(async () => undefined);
    const client = createClient({
      readFile: vi.fn(async () => "# Daily\n\nExternal edit"),
      writeFile,
    });
    const initialSnapshot = createSnapshot();
    const { result, rerender } = renderHook(
      ({ snapshot }) =>
        useNotesDocuments({
          client,
          refreshSnapshot: vi.fn(async () => snapshot),
          searchQuery: "",
          setErrorMessage: vi.fn(),
          setWorkspace: vi.fn(),
          snapshot,
          workspace: createWorkspace(),
        }),
      {
        initialProps: {
          snapshot: initialSnapshot,
        },
      },
    );

    act(() => {
      result.current.handleDocumentChange(NOTE_PATH, "# Daily\n\nLocal edit");
    });
    await waitFor(() => {
      expect(result.current.dirtyPaths[NOTE_PATH]).toBe(true);
    });

    rerender({
      snapshot: createSnapshot("# Daily\n\nExternal edit"),
    });

    await waitFor(() => {
      expect(result.current.writeConflict).toMatchObject({
        expectedRawSource: ORIGINAL_SOURCE,
        localRawSource: "# Daily\n\nLocal edit",
        path: NOTE_PATH,
        remoteRawSource: "# Daily\n\nExternal edit",
      });
    });
    expect(result.current.dirtyPaths[NOTE_PATH]).toBe(true);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("does not clear dirty state when a newer edit arrives during an in-flight save", async () => {
    let diskSource = ORIGINAL_SOURCE;
    let finishWrite: (() => void) | null = null;
    const writeFile = vi.fn(
      async (_path: string, content: string) =>
        new Promise<void>((resolve) => {
          finishWrite = () => {
            diskSource = content;
            resolve();
          };
        }),
    );
    const client = createClient({
      readFile: vi.fn(async () => diskSource),
      writeFile,
    });
    const snapshot = createSnapshot();
    const { result } = renderHook(() =>
      useNotesDocuments({
        client,
        refreshSnapshot: vi.fn(async () => snapshot),
        searchQuery: "",
        setErrorMessage: vi.fn(),
        setWorkspace: vi.fn(),
        snapshot,
        workspace: createWorkspace(),
      }),
    );

    act(() => {
      result.current.handleDocumentChange(NOTE_PATH, "# Daily\n\nFirst edit");
    });

    let savePromise: Promise<boolean> | null = null;
    act(() => {
      savePromise = result.current.handleSaveActiveDocument();
    });
    await waitFor(() => {
      expect(writeFile).toHaveBeenCalledWith(
        NOTE_PATH,
        "# Daily\n\nFirst edit",
      );
    });

    act(() => {
      result.current.handleDocumentChange(NOTE_PATH, "# Daily\n\nNewer edit");
    });
    await act(async () => {
      finishWrite?.();
      await savePromise;
    });

    expect(result.current.dirtyPaths[NOTE_PATH]).toBe(true);
    expect(result.current.activeDocument?.rawSource).toBe(
      "# Daily\n\nNewer edit",
    );
  });
});
