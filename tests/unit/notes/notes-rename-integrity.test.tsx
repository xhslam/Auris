import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNoteDocument } from "@/features/notes/documents/document-repository";
import { useNotesActions } from "@/features/notes/workbench/use-notes-actions";
import { useNotesDocuments } from "@/features/notes/workbench/use-notes-documents";
import { createWorkspaceState } from "@/features/notes/workspace/workspace-store";
import type { NotesWorkspaceState } from "@/features/notes/workspace/workspace-types";
import type { NotesRuntimeClient } from "@/features/notes/workbench/use-notes-runtime";
import type { VaultSnapshot } from "@/features/notes/vault/vault-types";
import { listNotesRecoveryDrafts, resetNotesRecoveryMigrationForTests } from "@/features/notes/persistence/notes-recovery-store";
import { clearAllPendingNoteSaves } from "@/features/notes/workbench/notes-pending-saves";

const OLD_PATH = "study-note-202.md";
const NEXT_PATH = "对数稳定判据的10道习题.md";
const TITLE = "对数稳定判据的10道习题";
const FULL_BODY = "Z = P − 2N\n\n" + Array.from({ length: 10 }, (_, i) => `第 ${i + 1} 题：保留完整正文`).join("\n\n");
const FULL_SOURCE = `# Old\n\n${FULL_BODY}`;

function fixture(extraFiles: Array<[string, string]> = []) {
  const files = new Map([[OLD_PATH, "# Old\n\n输入你想说的"], ...extraFiles]);
  const snapshot = (): VaultSnapshot => ({
    backlinks: {}, documents: [...files].map(([path, rawSource]) => createNoteDocument({ path, rawSource, mtime: null })),
    entries: [...files.keys()].map((path) => ({ kind: "file", mtime: null, name: path, path, size: null })),
    generatedAt: new Date().toISOString(), rootPath: "C:/vault",
  });
  const client: NotesRuntimeClient = {
    rootPath: "C:/vault", createDirectory: vi.fn(async () => {}), deleteEntry: vi.fn(async () => {}),
    listEntries: vi.fn(async () => snapshot().entries), moveEntry: vi.fn(async (from, to) => {
      const entries = [...files].filter(([path]) => path === from || path.startsWith(`${from}/`));
      if (!entries.length) throw new Error("missing source");
      for (const [path, source] of entries) { files.delete(path); files.set(to + path.slice(from.length), source); }
    }),
    readFile: vi.fn(async (path) => files.get(path) ?? null),
    writeFile: vi.fn(async (path, source) => { files.set(path, source); }),
    renameEntry: vi.fn(async (from, to) => {
      if (!files.has(from)) throw new Error("missing source");
      if (files.has(to)) throw new Error("existing destination");
      files.set(to, files.get(from)!); files.delete(from);
    }),
    subscribeToChanges: vi.fn(() => () => {}),
  };
  const setErrorMessage = vi.fn();
  const hook = renderHook(() => {
    const [currentSnapshot, setSnapshot] = useState(snapshot);
    const [workspace, setWorkspace] = useState<NotesWorkspaceState>(() => ({ ...createWorkspaceState(), activePath: OLD_PATH, openTabs: [OLD_PATH] }));
    const refreshSnapshot = async () => { const next = snapshot(); setSnapshot(next); return next; };
    const docs = useNotesDocuments({ client, snapshot: currentSnapshot, workspace, refreshSnapshot,
      searchQuery: "", setErrorMessage, setWorkspace });
    const actions = useNotesActions({ ...docs, client, desktopBridge: null, desktopCommands: [],
      promptFn: vi.fn(async () => TITLE), confirmFn: vi.fn(async () => true), refreshSnapshot,
      setDirectoryInfo: vi.fn(), setErrorMessage, setWorkspace,
      vaultStore: { getSnapshot: snapshot, rebuildIndex: vi.fn(async () => snapshot()) },
    });
    return { ...docs, ...actions, workspace };
  });
  return { ...hook, client, files, setErrorMessage };
}

describe("rename preserves unsaved documents", () => {
  beforeEach(() => { window.localStorage.clear(); window.shadowingDesktop = undefined; resetNotesRecoveryMigrationForTests(); });
  afterEach(() => { clearAllPendingNoteSaves(); });

  it("persists the live body before renaming a disk placeholder", async () => {
    const { result, files } = fixture();
    act(() => result.current.handleDocumentChange(OLD_PATH, FULL_SOURCE));
    await act(async () => { expect(await result.current.handleRenameNoteToTitle(OLD_PATH, TITLE)).toBe(true); });
    expect(files.get(NEXT_PATH)).toBe(`# ${TITLE}\n\n${FULL_BODY}`);
    expect(result.current.activeDocument?.rawSource).toContain("第 10 题");
    expect(files.has(OLD_PATH)).toBe(false);
  });

  it("preserves the draft and refuses a rename when saving fails", async () => {
    const { result, client, files } = fixture();
    vi.mocked(client.writeFile).mockRejectedValueOnce(new Error("disk full"));
    act(() => result.current.handleDocumentChange(OLD_PATH, FULL_SOURCE));
    await act(async () => { expect(await result.current.handleRenameNoteToTitle(OLD_PATH, TITLE)).toBe(false); });
    expect(client.renameEntry).not.toHaveBeenCalled();
    expect(files.has(NEXT_PATH)).toBe(false);
    expect(result.current.activeDocument?.rawSource).toBe(FULL_SOURCE);
    expect(result.current.dirtyPaths[OLD_PATH]).toBe(true);
  });

  it("moves edits made during a delayed rename to the new path", async () => {
    const { result, client, files } = fixture();
    let releaseRename!: () => void;
    let startedRename!: () => void;
    const started = new Promise<void>((resolve) => { startedRename = resolve; });
    const originalRename = vi.mocked(client.renameEntry).getMockImplementation()!;
    vi.mocked(client.renameEntry).mockImplementationOnce(async (from, to) => {
      await originalRename(from, to);
      startedRename();
      await new Promise<void>((resolve) => { releaseRename = resolve; });
    });
    act(() => result.current.handleDocumentChange(OLD_PATH, FULL_SOURCE));
    let rename!: Promise<boolean>;
    await act(async () => { rename = result.current.handleRenameNoteToTitle(OLD_PATH, TITLE); await started; });
    act(() => result.current.handleDocumentChange(OLD_PATH, `${FULL_SOURCE}\n\n编辑中补充`));
    await act(async () => { releaseRename(); await rename; });
    expect(result.current.activeDocument?.path).toBe(NEXT_PATH);
    expect(result.current.activeDocument?.rawSource).toContain("编辑中补充");
    expect(result.current.dirtyPaths[NEXT_PATH]).toBe(true);
    expect(await listNotesRecoveryDrafts("C:/vault")).toEqual([
      expect.objectContaining({ path: NEXT_PATH, rawSource: expect.stringContaining("编辑中补充") }),
    ]);
    await act(async () => { await result.current.handleSaveDocument(NEXT_PATH); });
    expect(files.get(NEXT_PATH)).toContain("编辑中补充");
    expect(files.has(OLD_PATH)).toBe(false);
  });

  it("waits for an in-flight save before moving the file", async () => {
    const { result, client, files } = fixture();
    let releaseWrite!: () => void;
    let startedWrite!: () => void;
    const started = new Promise<void>((resolve) => { startedWrite = resolve; });
    vi.mocked(client.writeFile).mockImplementationOnce(async (path, source) => {
      startedWrite();
      await new Promise<void>((resolve) => { releaseWrite = resolve; });
      files.set(path, source);
    });
    act(() => result.current.handleDocumentChange(OLD_PATH, FULL_SOURCE));
    let save!: ReturnType<typeof result.current.handleSaveDocument>;
    await act(async () => { save = result.current.handleSaveDocument(OLD_PATH); await started; });
    let rename!: Promise<boolean>;
    await act(async () => { rename = result.current.handleRenameNoteToTitle(OLD_PATH, TITLE); await Promise.resolve(); });
    expect(client.renameEntry).not.toHaveBeenCalled();
    await act(async () => { releaseWrite(); await save; await rename; });
    expect(files.get(NEXT_PATH)).toContain(FULL_BODY);
    expect(files.has(OLD_PATH)).toBe(false);
  });

  it("keeps the full note and new identity if the title write fails after moving", async () => {
    const { result, client, files } = fixture();
    files.set(OLD_PATH, FULL_SOURCE);
    vi.mocked(client.writeFile).mockRejectedValueOnce(new Error("disk full"));
    await act(async () => { expect(await result.current.handleRenameNoteToTitle(OLD_PATH, TITLE)).toBe(false); });
    expect(files.get(NEXT_PATH)).toBe(FULL_SOURCE);
    expect(result.current.activeDocument?.path).toBe(NEXT_PATH);
    expect(result.current.activeDocument?.rawSource).toContain(FULL_BODY);
    expect(result.current.dirtyPaths[NEXT_PATH]).toBe(true);
  });

  it("refuses to erase a draft when its clean source disappears", async () => {
    const { result, client, files } = fixture();
    files.delete(OLD_PATH);
    await act(async () => { expect(await result.current.handleRenameNoteToTitle(OLD_PATH, TITLE)).toBe(false); });
    expect(client.renameEntry).not.toHaveBeenCalled();
    expect(client.writeFile).not.toHaveBeenCalled();
    expect(result.current.workspace.activePath).toBe(OLD_PATH);
  });

  it("preserves a dirty referencing note while rewriting its wiki link", async () => {
    const { result, files } = fixture([["review.md", "# Review\n\n[[study-note-202]]"]]);
    act(() => {
      result.current.handleDocumentChange(OLD_PATH, FULL_SOURCE);
      result.current.handleDocumentChange("review.md", "# Review\n\n[[study-note-202]]\n\n未保存的复习正文");
    });
    await act(async () => { await result.current.handleRenameNoteToTitle(OLD_PATH, TITLE); });
    expect(files.get("review.md")).toBe(`# Review\n\n[[${TITLE}]]\n\n未保存的复习正文`);
    expect(files.get(NEXT_PATH)).toContain(FULL_BODY);
  });

  it("stops before moving if a planned disk baseline changed", async () => {
    const { result, client, files } = fixture();
    vi.mocked(client.readFile).mockImplementationOnce(async (path) => {
      files.set(path, "# Old\n\n外部新内容");
      return files.get(path)!;
    });
    await act(async () => { expect(await result.current.handleRenameNoteToTitle(OLD_PATH, TITLE)).toBe(false); });
    expect(client.renameEntry).not.toHaveBeenCalled();
    expect(client.writeFile).not.toHaveBeenCalled();
    expect(files.get(OLD_PATH)).toContain("外部新内容");
  });

  it("allows the existing title to repair a still-generic filename", async () => {
    const { result, files } = fixture();
    act(() => result.current.handleDocumentChange(OLD_PATH, `# ${TITLE}\n\n${FULL_BODY}`));
    await act(async () => { await result.current.handleRenamePath(OLD_PATH, "file"); });
    expect(files.get(NEXT_PATH)).toContain(FULL_BODY);
    expect(files.has(OLD_PATH)).toBe(false);
  });

  it("flushes and relocates a dirty note when moving it into a folder", async () => {
    const { result, files } = fixture();
    act(() => result.current.handleDocumentChange(OLD_PATH, FULL_SOURCE));
    await act(async () => { await result.current.handleMovePath(OLD_PATH, "archive"); });
    expect(files.get(`archive/${OLD_PATH}`)).toBe(FULL_SOURCE);
    expect(result.current.activeDocument?.path).toBe(`archive/${OLD_PATH}`);
    expect(result.current.activeDocument?.rawSource).toBe(FULL_SOURCE);
    expect(files.has(OLD_PATH)).toBe(false);
  });

  it("refuses a move when flushing the full draft fails", async () => {
    const { result, client } = fixture();
    vi.mocked(client.writeFile).mockRejectedValueOnce(new Error("disk full"));
    act(() => result.current.handleDocumentChange(OLD_PATH, FULL_SOURCE));
    await act(async () => { await result.current.handleMovePath(OLD_PATH, "archive"); });
    expect(client.moveEntry).not.toHaveBeenCalled();
    expect(result.current.activeDocument?.rawSource).toBe(FULL_SOURCE);
    expect(result.current.dirtyPaths[OLD_PATH]).toBe(true);
  });

  it("carries edits typed during a delayed move to the new recovery identity", async () => {
    const { result, client } = fixture();
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const originalMove = vi.mocked(client.moveEntry).getMockImplementation()!;
    vi.mocked(client.moveEntry).mockImplementationOnce(async (...args) => {
      await originalMove(...args); entered(); await new Promise<void>((resolve) => { release = resolve; });
    });
    act(() => result.current.handleDocumentChange(OLD_PATH, FULL_SOURCE));
    let moving!: Promise<void>;
    await act(async () => { moving = result.current.handleMovePath(OLD_PATH, "archive"); await started; });
    act(() => result.current.handleDocumentChange(OLD_PATH, FULL_SOURCE + "\n\n移动中的追加"));
    await act(async () => { release(); await moving; });
    expect(result.current.activeDocument?.path).toBe(`archive/${OLD_PATH}`);
    expect(result.current.activeDocument?.rawSource).toContain("移动中的追加");
    expect(result.current.dirtyPaths[`archive/${OLD_PATH}`]).toBe(true);
    expect(await listNotesRecoveryDrafts("C:/vault")).toEqual([
      expect.objectContaining({ path: `archive/${OLD_PATH}`, rawSource: expect.stringContaining("移动中的追加") }),
    ]);
  });

  it("flushes all dirty descendants when moving a folder", async () => {
    const { result, files } = fixture([["folder/a.md", "# A\n\nOld"], ["folder/b.md", "# B\n\nOld"]]);
    act(() => {
      result.current.handleDocumentChange("folder/a.md", "# A\n\nFull A");
      result.current.handleDocumentChange("folder/b.md", "# B\n\nFull B");
    });
    await act(async () => { await result.current.handleMovePath("folder", "archive"); });
    expect(files.get("archive/folder/a.md")).toBe("# A\n\nFull A");
    expect(files.get("archive/folder/b.md")).toBe("# B\n\nFull B");
    expect(result.current.documents.filter((doc) => doc.path.startsWith("folder/"))).toEqual([]);
  });

  it("never replaces an existing destination note", async () => {
    const { result, client, files } = fixture([[NEXT_PATH, "# Existing\n\n保持这个文件"]]);
    act(() => result.current.handleDocumentChange(OLD_PATH, FULL_SOURCE));
    await act(async () => { expect(await result.current.handleRenameNoteToTitle(OLD_PATH, TITLE)).toBe(false); });
    expect(client.renameEntry).not.toHaveBeenCalled();
    expect(files.get(NEXT_PATH)).toBe("# Existing\n\n保持这个文件");
    expect(result.current.activeDocument?.rawSource).toContain(FULL_BODY);
  });
});
