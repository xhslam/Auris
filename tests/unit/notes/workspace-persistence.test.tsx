import { act, renderHook, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import { useWorkspacePersistence } from "@/components/notes-v2/use-workspace-persistence";
import * as recoveryStore from "@/features/notes/persistence/notes-recovery-store";
import { createWorkspaceState } from "@/features/notes/workspace/workspace-store";
import { loadWorkspaceState, saveWorkspaceState } from "@/features/notes/workspace/workspace-storage";

function WorkspaceModeButton() {
  const [workspace] = useWorkspacePersistence();
  const mode = workspace.editorModesByPath["notes/daily.md"] ?? "wysiwyg";

  return (
    <button
      aria-label={
        mode === "source"
          ? NOTES_UI_COPY.toolbar.displayEditing
          : NOTES_UI_COPY.toolbar.source
      }
      type="button"
    >
      T
    </button>
  );
}

describe("useWorkspacePersistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.shadowingDesktop = undefined;
  });

  it("prefers the durable workspace session for the selected vault", async () => {
    const durableWorkspace = {
      ...createWorkspaceState(),
      activePath: "notes/recovered.md",
      editorModesByPath: { "notes/recovered.md": "source" as const },
      openTabs: ["notes/recovered.md"],
    };
    window.shadowingDesktop = {
      notesRecovery: {
        captureDraft: async () => true,
        captureWorkspace: async () => true,
        clearDraft: async () => undefined,
        importLegacy: async () => ({
          draftsImported: 0,
          historyImported: 0,
          imported: false,
        }),
        listDrafts: async () => [],
        listHistory: async () => [],
        loadWorkspace: async (vaultRoot: string | null) => ({
          capturedAt: "2026-07-29T06:00:00.000Z",
          schemaVersion: 2,
          vaultRoot,
          workspace: durableWorkspace,
        }),
        recordHistory: async () => undefined,
      },
    } as unknown as NonNullable<typeof window.shadowingDesktop>;

    const { result } = renderHook(() =>
      useWorkspacePersistence("/vault-a"),
    );

    await waitFor(() => {
      expect(result.current[0]).toMatchObject({
        activePath: "notes/recovered.md",
        openTabs: ["notes/recovered.md"],
      });
    });
  });

  it("does not capture the previous vault workspace under a newly selected vault", async () => {
    const captureWorkspace = vi.fn(async () => true);
    const workspaceFor = (vaultRoot: string | null) => ({
      ...createWorkspaceState(),
      activePath: `${vaultRoot}/active.md`,
      openTabs: [`${vaultRoot}/active.md`],
    });
    window.shadowingDesktop = {
      notesRecovery: {
        captureDraft: async () => true,
        captureWorkspace,
        clearDraft: async () => undefined,
        importLegacy: async () => ({
          draftsImported: 0,
          historyImported: 0,
          imported: false,
        }),
        listDrafts: async () => [],
        listHistory: async () => [],
        loadWorkspace: async (vaultRoot: string | null) => ({
          capturedAt: "2026-07-29T06:00:00.000Z",
          schemaVersion: 2,
          vaultRoot,
          workspace: workspaceFor(vaultRoot),
        }),
        recordHistory: async () => undefined,
      },
    } as unknown as NonNullable<typeof window.shadowingDesktop>;
    const { result, rerender } = renderHook(
      ({ vaultRoot }) => useWorkspacePersistence(vaultRoot),
      { initialProps: { vaultRoot: "/vault-a" as string | null } },
    );
    await waitFor(() => {
      expect(result.current[0].activePath).toBe("/vault-a/active.md");
    });

    rerender({ vaultRoot: "/vault-b" });
    await waitFor(() => {
      expect(result.current[0].activePath).toBe("/vault-b/active.md");
    });

    expect(captureWorkspace).not.toHaveBeenCalledWith(
      "/vault-b",
      expect.objectContaining({ activePath: "/vault-a/active.md" }),
    );
  });

  it("persists a completed rename even after leaving Notes", async () => {
    saveWorkspaceState(window.localStorage, { ...createWorkspaceState(), activePath: "old.md", openTabs: ["old.md"] });
    const { result, unmount } = renderHook(() => useWorkspacePersistence("/vault"));
    await waitFor(() => expect(result.current[0].activePath).toBe("old.md"));
    const completeRename = result.current[1];
    unmount();
    act(() => completeRename((current) => ({ ...current, activePath: "new.md", openTabs: ["new.md"] })));
    expect(loadWorkspaceState(window.localStorage).activePath).toBe("new.md");
  });

  it("retains navigation requested before slow workspace hydration finishes", async () => {
    let release!: () => void;
    const spy = vi.spyOn(recoveryStore, "loadNotesHotExitWorkspace").mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => { release = resolve; });
      return null;
    });
    try {
      const { result } = renderHook(() => useWorkspacePersistence("/vault"));
      act(() => result.current[1]((current) => ({ ...current, activePath: "chosen.md", openTabs: ["chosen.md"] })));
      await act(async () => { release(); });
      expect(result.current[0].activePath).toBe("chosen.md");
      expect(loadWorkspaceState(window.localStorage).activePath).toBe("chosen.md");
    } finally { spy.mockRestore(); }
  });

  it("ignores an old vault callback after switching to a different vault", async () => {
    const { result, rerender } = renderHook(({ root }) => useWorkspacePersistence(root), { initialProps: { root: "/a" } });
    await waitFor(() => expect(window.localStorage.getItem("auris.notes.hot-exit.workspaces.v2")).toContain("/a"));
    const oldCallback = result.current[1];
    rerender({ root: "/b" });
    await waitFor(() => expect(window.localStorage.getItem("auris.notes.hot-exit.workspaces.v2")).toContain("/b"));
    act(() => oldCallback((current) => ({ ...current, activePath: "wrong-vault.md" })));
    expect(loadWorkspaceState(window.localStorage).activePath).not.toBe("wrong-vault.md");
  });

  it("keeps render output independent from stored workspace state before hydration", () => {
    saveWorkspaceState(window.localStorage, {
      ...createWorkspaceState(),
      editorModesByPath: { "notes/daily.md": "wysiwyg" },
    });

    const html = renderToString(<WorkspaceModeButton />);

    expect(html).toContain(`aria-label="${NOTES_UI_COPY.toolbar.source}"`);
  });

  it("hydrates the saved workspace after the initial render", async () => {
    saveWorkspaceState(window.localStorage, {
      ...createWorkspaceState(),
      editorModesByPath: { "notes/daily.md": "source" },
    });

    const { result } = renderHook(() => useWorkspacePersistence());

    await waitFor(() => {
      expect(result.current[0].editorModesByPath).toEqual({
        "notes/daily.md": "source",
      });
    });
  });

  it("drops legacy reading mode and invalid per-note modes back to WYSIWYG", async () => {
    window.localStorage.setItem(
      "shadowing-notes-workspace-v2",
      JSON.stringify({
        ...createWorkspaceState(),
        editorMode: "reading",
        editorModesByPath: {
          "notes/daily.md": "reading",
          "notes/grammar.md": "preview",
        },
      }),
    );

    const { result } = renderHook(() => useWorkspacePersistence());

    await waitFor(() => {
      expect(result.current[0].editorModesByPath).toEqual({});
    });
  });
});
