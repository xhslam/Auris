import { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";
import { createNotesEditorState } from "@/features/notes/editor/editor-state-bridge";
import { DEFAULT_NOTES_EDITOR_BEHAVIOR } from "@/features/notes/formatting/notes-editor-behavior";

describe("source editor Markdown link activation", () => {
  it.each([
    ["Windows Ctrl-click", { ctrlKey: true }],
    ["macOS Cmd-click", { metaKey: true }],
  ])("routes a local target on %s without native navigation", (_label, modifiers) => {
    const source = "Open [the note](../notes/Target%20note.md#next-step)";
    const onOpenMarkdownLink = vi.fn();
    const parent = document.createElement("div");
    document.body.append(parent);
    const view = new EditorView({
      parent,
      state: createNotesEditorState(
        source,
        vi.fn(),
        {
          documentPath: "C:/Vault/course/Source.md",
          onOpenMarkdownLink,
        },
        DEFAULT_NOTES_EDITOR_BEHAVIOR,
      ),
    });
    const targetOffset = source.indexOf("Target");
    vi.spyOn(view, "posAtCoords").mockReturnValue(targetOffset);
    const mouseEvent = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 1,
      clientY: 1,
      ...modifiers,
    });

    view.contentDOM.dispatchEvent(mouseEvent);

    expect(mouseEvent.defaultPrevented).toBe(true);
    expect(onOpenMarkdownLink).toHaveBeenCalledWith(
      "../notes/Target%20note.md#next-step",
      "C:/Vault/course/Source.md",
    );

    view.destroy();
    parent.remove();
  });
});
