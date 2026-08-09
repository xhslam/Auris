import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NotesWorkbenchBottomRight } from "@/components/notes-v2/notes-workbench-bottom-right";
import type { NoteDocument } from "@/features/notes/documents/document-types";

const activeDocument = {
  basename: "daily.md",
  parsed: { headings: [], links: [], tags: [], title: "Daily" },
  path: "daily.md",
  rawSource: "# Daily\n\nWriting",
} as unknown as NoteDocument;

describe("NotesWorkbenchBottomRight", () => {
  it("opens the Markdown and WeChat preview split from the dedicated button", async () => {
    const user = userEvent.setup();
    const onEditorModeChange = vi.fn();

    render(
      <NotesWorkbenchBottomRight
        activeDocument={activeDocument}
        backlinks={[]}
        documents={[activeDocument]}
        editorMode="wysiwyg"
        isTerminalSplitOpen={false}
        learningQuery=""
        learningSnippets={[]}
        onEditorModeChange={onEditorModeChange}
        onOpenPath={vi.fn()}
        onTerminalSplitToggle={vi.fn()}
        recentDocuments={[]}
        searchQuery=""
        searchResults={[]}
      />,
    );

    const splitButton = screen.getByRole("button", {
      name: "Markdown 与微信公众号预览分屏",
    });
    expect(splitButton).toHaveAttribute("aria-pressed", "false");

    await user.click(splitButton);

    expect(onEditorModeChange).toHaveBeenCalledWith("split");
  });

  it("shows the active note save state beside its Markdown-aware metrics", () => {
    render(
      <NotesWorkbenchBottomRight
        activeDocument={activeDocument}
        backlinks={[]}
        documentSaveState="saving"
        documents={[activeDocument]}
        editorMode="source"
        isTerminalSplitOpen={false}
        learningQuery=""
        learningSnippets={[]}
        onOpenPath={vi.fn()}
        onTerminalSplitToggle={vi.fn()}
        recentDocuments={[]}
        searchQuery=""
        searchResults={[]}
      />,
    );

    expect(screen.getByText("保存中…")).toBeInTheDocument();
    expect(screen.getByText("2 词")).toBeInTheDocument();
    expect(screen.getByText("12 字符")).toBeInTheDocument();
  });

  it("lists saved history and restores the selected version", async () => {
    const user = userEvent.setup();
    const onRestoreHistoryVersion = vi.fn();
    const version = {
      id: "version-1",
      path: "daily.md",
      rawSource: "# Daily\n\nEarlier",
      savedAt: "2026-07-29T06:00:00.000Z",
      vaultRoot: "/vault",
    };

    render(
      <NotesWorkbenchBottomRight
        activeDocument={activeDocument}
        backlinks={[]}
        documents={[activeDocument]}
        editorMode="source"
        historyVersions={[version]}
        isTerminalSplitOpen={false}
        learningQuery=""
        learningSnippets={[]}
        onOpenPath={vi.fn()}
        onRestoreHistoryVersion={onRestoreHistoryVersion}
        onTerminalSplitToggle={vi.fn()}
        recentDocuments={[]}
        searchQuery=""
        searchResults={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "历史版本" }));
    await user.click(screen.getByRole("button", { name: /恢复/ }));

    expect(onRestoreHistoryVersion).toHaveBeenCalledWith(version);
  });
});
