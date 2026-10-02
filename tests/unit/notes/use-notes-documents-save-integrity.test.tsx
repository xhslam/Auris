import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNoteDocument } from "@/features/notes/documents/document-repository";
import { useNotesDocuments } from "@/features/notes/workbench/use-notes-documents";
import { createWorkspaceState } from "@/features/notes/workspace/workspace-store";
import type { NotesRuntimeClient } from "@/features/notes/workbench/use-notes-runtime";
import type { VaultSnapshot } from "@/features/notes/vault/vault-types";
import * as recoveryStore from "@/features/notes/persistence/notes-recovery-store";
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

  it("keeps edits arriving while saved-draft cleanup is awaiting IO", async () => {
    let diskSource = ORIGINAL_SOURCE;
    const client = createClient({ readFile: vi.fn(async () => diskSource), writeFile: vi.fn(async (_path, source) => { diskSource = source; }) });
    const snapshot = createSnapshot();
    const workspace = createWorkspace();
    const refreshSnapshot = vi.fn(async () => createSnapshot(diskSource));
    const setWorkspace = vi.fn();
    const setErrorMessage = vi.fn();
    const { result } = renderHook(() => useNotesDocuments({ client, snapshot, workspace,
      refreshSnapshot, searchQuery: "", setErrorMessage, setWorkspace }));
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const originalClear = recoveryStore.clearNotesRecoveryDraft;
    const spy = vi.spyOn(recoveryStore, "clearNotesRecoveryDraft").mockImplementationOnce(async (...args) => {
      entered(); await new Promise<void>((resolve) => { release = resolve; }); await originalClear(...args);
    });
    try {
      act(() => result.current.handleDocumentChange(NOTE_PATH, "# Daily\n\nFirst edit"));
      let saving!: ReturnType<typeof result.current.handleSaveDocument>;
      await act(async () => { saving = result.current.handleSaveDocument(NOTE_PATH); await started; });
      act(() => result.current.handleDocumentChange(NOTE_PATH, "# Daily\n\nNewest edit"));
      await act(async () => { release(); await saving; });
      expect(result.current.dirtyPaths[NOTE_PATH]).toBe(true);
      await act(async () => { await result.current.handleSaveDocument(NOTE_PATH); });
      expect(diskSource).toContain("Newest edit");
    } finally { spy.mockRestore(); }
  });

  it("flushes the latest recovery window when navigating away before autosave", async () => {
    const client = createClient({ readFile: vi.fn(async () => ORIGINAL_SOURCE), writeFile: vi.fn(async () => undefined) });
    const snapshot = createSnapshot();
    const workspace = createWorkspace();
    const refreshSnapshot = vi.fn(async () => snapshot);
    const setWorkspace = vi.fn();
    const setErrorMessage = vi.fn();
    const { result, unmount } = renderHook(() => useNotesDocuments({ client, snapshot, workspace,
      refreshSnapshot, searchQuery: "", setErrorMessage, setWorkspace }));
    act(() => result.current.handleDocumentChange(NOTE_PATH, "# Daily\n\nFirst keystroke"));
    act(() => result.current.handleDocumentChange(NOTE_PATH, "# Daily\n\nComplete newest body"));
    unmount();
    expect(await recoveryStore.listNotesRecoveryDrafts("C:/vault")).toEqual([
      expect.objectContaining({ rawSource: "# Daily\n\nComplete newest body" }),
    ]);
  });

  it("revalidates the latest disk version before applying a conflict decision", async () => {
    const localSource = "# Daily\n\nLocal edit";
    const remoteV1 = "# Daily\n\nRemote v1";
    const remoteV2 = "# Daily\n\nRemote v2";
    const refreshSnapshot = vi.fn(async () => createSnapshot(remoteV2));
    const setErrorMessage = vi.fn();
    const client = createClient({
      readFile: vi.fn(async () => remoteV2),
      writeFile: vi.fn(async () => undefined),
    });
    const { result, rerender } = renderHook(
      ({ snapshot }) =>
        useNotesDocuments({
          client,
          refreshSnapshot,
          searchQuery: "",
          setErrorMessage,
          setWorkspace: vi.fn(),
          snapshot,
          workspace: createWorkspace(),
        }),
      { initialProps: { snapshot: createSnapshot() } },
    );

    act(() => result.current.handleDocumentChange(NOTE_PATH, localSource));
    rerender({ snapshot: createSnapshot(remoteV1) });
    await waitFor(() =>
      expect(result.current.writeConflict?.remoteRawSource).toBe(remoteV1),
    );

    await act(async () => result.current.handleKeepWriteConflict());

    expect(refreshSnapshot).toHaveBeenCalledWith({
      eagerPaths: [NOTE_PATH],
      showLoading: false,
    });
    expect(result.current.writeConflict?.remoteRawSource).toBe(remoteV2);
    expect(setErrorMessage).toHaveBeenCalledWith(
      "文件状态已再次变化，已重新读取磁盘内容，请按最新状态处理冲突。",
    );
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

  it("waits for the initial vault snapshot before treating a recovery path as missing", async () => {
    const source = "# Daily\n\nComplete recovered body";
    window.localStorage.setItem("auris.notes.hot-exit.v1", JSON.stringify([{
      path: NOTE_PATH, rawSource: source, baseRawSource: source,
      capturedAt: "2026-10-01T16:00:00.000Z", schemaVersion: 2, vaultRoot: "C:/vault",
    }]));
    const ready = createSnapshot(source);
    const loading: VaultSnapshot = { ...ready, documents: [], entries: [], rootPath: null,
      generatedAt: new Date(0).toISOString() };
    const client = createClient({ readFile: vi.fn(async () => source), writeFile: vi.fn(async () => undefined) });
    const { result, rerender } = renderHook(({ snapshot }) => useNotesDocuments({
      client, snapshot, workspace: createWorkspace(), searchQuery: "",
      refreshSnapshot: vi.fn(async () => ready), setErrorMessage: vi.fn(), setWorkspace: vi.fn(),
    }), { initialProps: { snapshot: loading } });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(result.current.dirtyPaths[NOTE_PATH]).not.toBe(true);
    expect(result.current.documents).toEqual([]);
    rerender({ snapshot: ready });
    await waitFor(() => expect(result.current.activeDocument?.rawSource).toBe(source));
    expect(result.current.dirtyPaths[NOTE_PATH]).not.toBe(true);
    expect(client.writeFile).not.toHaveBeenCalled();
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
    const ensureDocuments = vi.fn(async (): Promise<VaultSnapshot | null> => null);
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

  it("does not disable autosave when an existing dirty file is absent only from the lazy document cache", async () => {
    let disk = ORIGINAL_SOURCE;
    const client = createClient({
      readFile: vi.fn(async () => disk),
      writeFile: vi.fn(async (_path, source) => { disk = source; }),
    });
    const ready = createSnapshot();
    const { result, rerender } = renderHook(({ snapshot }) => useNotesDocuments({
      client, snapshot, workspace: createWorkspace(), searchQuery: "",
      refreshSnapshot: vi.fn(async () => createSnapshot(disk)), setErrorMessage: vi.fn(), setWorkspace: vi.fn(),
    }), { initialProps: { snapshot: ready } });
    act(() => result.current.handleDocumentChange(NOTE_PATH, "# Daily\n\nLatest edit"));
    rerender({ snapshot: { ...ready, documents: [] } });
    await waitFor(() => expect(client.writeFile).toHaveBeenCalledWith(NOTE_PATH, "# Daily\n\nLatest edit"), { timeout: 3000 });
  });
});
