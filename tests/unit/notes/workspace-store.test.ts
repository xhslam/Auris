import { describe, expect, it } from "vitest";
import {
  closeWorkspacePath,
  createWorkspaceState,
  getEditorMode,
  getLastUsedOpenTab,
  openWorkspacePath,
  removeWorkspacePath,
  renameWorkspacePath,
  setEditorMode,
} from "@/features/notes/workspace/workspace-store";

describe("workspace-store", () => {
  it("creates an empty WYSIWYG-first workspace state by default", () => {
    const state = createWorkspaceState();

    expect(state.activePath).toBeNull();
    expect(state.commandHistory).toEqual([]);
    expect(state.editorModesByPath).toEqual({});
    expect(getEditorMode(state, "notes/daily.md")).toBe("wysiwyg");
    expect(state.leftSidebarCollapsed).toBe(false);
    expect(state.leftSidebarMode).toBe("files");
    expect(state.openTabs).toEqual([]);
    expect(state.pinnedTabs).toEqual([]);
    expect(state.recentFiles).toEqual([]);
    expect(state.rightSidebarCollapsed).toBe(false);
    expect(state.rightSidebarMode).toBe("properties");
  });

  it("deduplicates old and new aliases when reconciling a rename", () => {
    const state = { ...createWorkspaceState(), activePath: "old.md", openTabs: ["old.md", "new.md"],
      pinnedTabs: ["new.md", "old.md"], recentFiles: ["old.md", "new.md"] };
    expect(renameWorkspacePath(state, "old.md", "new.md")).toMatchObject({ activePath: "new.md",
      openTabs: ["new.md"], pinnedTabs: ["new.md"], recentFiles: ["new.md"] });
  });

  it("opens and closes tabs without mutating the original workspace state", () => {
    const initialState = createWorkspaceState();
    const openedState = openWorkspacePath(initialState, "notes/daily.md");
    const closedState = closeWorkspacePath(openedState, "notes/daily.md");

    expect(initialState.openTabs).toEqual([]);
    expect(openedState.activePath).toBe("notes/daily.md");
    expect(openedState.openTabs).toEqual(["notes/daily.md"]);
    expect(openedState.recentFiles).toEqual(["notes/daily.md"]);
    expect(closedState.openTabs).toEqual([]);
    expect(closedState.activePath).toBeNull();
  });

  it("resolves the last used live tab and skips stale recent paths", () => {
    const state = {
      ...createWorkspaceState(),
      activePath: "notes/c.md",
      openTabs: ["notes/a.md", "notes/b.md", "notes/c.md"],
      recentFiles: ["notes/c.md", "notes/deleted.md", "notes/b.md", "notes/a.md"],
    };

    expect(getLastUsedOpenTab(state)).toBe("notes/b.md");
    expect(
      getLastUsedOpenTab({
        ...state,
        openTabs: ["notes/c.md"],
      }),
    ).toBeNull();
  });

  it("round-trips between two tabs as activation updates recent files", () => {
    let state = openWorkspacePath(createWorkspaceState(), "notes/a.md");
    state = openWorkspacePath(state, "notes/b.md");
    const firstTarget = getLastUsedOpenTab(state);
    expect(firstTarget).toBe("notes/a.md");

    state = openWorkspacePath(state, firstTarget!);
    expect(getLastUsedOpenTab(state)).toBe("notes/b.md");
  });

  it("stores editor mode for the active note without changing other notes", () => {
    const initialState = createWorkspaceState();
    const sourceState = setEditorMode(
      initialState,
      "notes/daily.md",
      "source",
    );

    expect(getEditorMode(initialState, "notes/daily.md")).toBe("wysiwyg");
    expect(getEditorMode(sourceState, "notes/daily.md")).toBe("source");
    expect(getEditorMode(sourceState, "notes/grammar.md")).toBe("wysiwyg");
  });

  it("renames an open workspace path everywhere it appears", () => {
    const state = {
      ...createWorkspaceState(),
      activePath: "notes/daily.md",
      editorModesByPath: { "notes/daily.md": "source" as const },
      openTabs: ["notes/daily.md", "notes/grammar.md"],
      pinnedTabs: ["notes/daily.md"],
      recentFiles: ["notes/daily.md", "notes/grammar.md"],
    };

    const renamedState = renameWorkspacePath(
      state,
      "notes/daily.md",
      "notes/daily-review.md",
    );

    expect(renamedState.activePath).toBe("notes/daily-review.md");
    expect(renamedState.openTabs).toEqual([
      "notes/daily-review.md",
      "notes/grammar.md",
    ]);
    expect(renamedState.pinnedTabs).toEqual(["notes/daily-review.md"]);
    expect(renamedState.recentFiles).toEqual([
      "notes/daily-review.md",
      "notes/grammar.md",
    ]);
    expect(getEditorMode(renamedState, "notes/daily-review.md")).toBe("source");
    expect(renamedState.editorModesByPath["notes/daily.md"]).toBeUndefined();
  });

  it("renames open child paths when a directory is renamed", () => {
    const state = {
      ...createWorkspaceState(),
      activePath: "notes/projects/daily.md",
      openTabs: ["notes/projects/daily.md", "notes/grammar.md"],
      pinnedTabs: ["notes/projects/daily.md"],
      recentFiles: ["notes/projects/daily.md", "notes/grammar.md"],
    };

    const renamedState = renameWorkspacePath(
      state,
      "notes/projects",
      "notes/archive",
    );

    expect(renamedState.activePath).toBe("notes/archive/daily.md");
    expect(renamedState.openTabs).toEqual([
      "notes/archive/daily.md",
      "notes/grammar.md",
    ]);
    expect(renamedState.pinnedTabs).toEqual(["notes/archive/daily.md"]);
    expect(renamedState.recentFiles).toEqual([
      "notes/archive/daily.md",
      "notes/grammar.md",
    ]);
  });

  it("removes a deleted workspace path from the active tab set and recent files", () => {
    const state = {
      ...createWorkspaceState(),
      activePath: "notes/daily.md",
      editorModesByPath: {
        "notes/daily.md": "source" as const,
        "notes/grammar.md": "source" as const,
      },
      openTabs: ["notes/daily.md", "notes/grammar.md"],
      pinnedTabs: ["notes/daily.md"],
      recentFiles: ["notes/daily.md", "notes/grammar.md", "notes/listening.md"],
    };

    const nextState = removeWorkspacePath(state, "notes/daily.md");

    expect(nextState.activePath).toBe("notes/grammar.md");
    expect(nextState.openTabs).toEqual(["notes/grammar.md"]);
    expect(nextState.pinnedTabs).toEqual([]);
    expect(nextState.recentFiles).toEqual([
      "notes/grammar.md",
      "notes/listening.md",
    ]);
    expect(nextState.editorModesByPath).toEqual({
      "notes/grammar.md": "source",
    });
  });

  it("removes open child paths when a directory is deleted", () => {
    const state = {
      ...createWorkspaceState(),
      activePath: "notes/projects/daily.md",
      openTabs: [
        "notes/projects/daily.md",
        "notes/projects/plan.md",
        "notes/grammar.md",
      ],
      pinnedTabs: ["notes/projects/daily.md", "notes/grammar.md"],
      recentFiles: [
        "notes/projects/daily.md",
        "notes/grammar.md",
        "notes/projects/plan.md",
      ],
    };

    const nextState = removeWorkspacePath(state, "notes/projects");

    expect(nextState.activePath).toBe("notes/grammar.md");
    expect(nextState.openTabs).toEqual(["notes/grammar.md"]);
    expect(nextState.pinnedTabs).toEqual(["notes/grammar.md"]);
    expect(nextState.recentFiles).toEqual(["notes/grammar.md"]);
  });
});
