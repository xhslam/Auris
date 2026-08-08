import { renderHook, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import { useWorkspacePersistence } from "@/components/notes-v2/use-workspace-persistence";
import { createWorkspaceState } from "@/features/notes/workspace/workspace-store";
import { saveWorkspaceState } from "@/features/notes/workspace/workspace-storage";

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
