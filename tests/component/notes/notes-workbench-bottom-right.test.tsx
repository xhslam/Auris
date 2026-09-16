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

  it("shows cursor line and column and selection length on the status bar", () => {
    const { rerender } = render(
      <NotesWorkbenchBottomRight
        activeDocument={activeDocument}
        documentSaveState="saved"
        documents={[activeDocument]}
        editorMode="wysiwyg"
        isTerminalSplitOpen={false}
        learningQuery=""
        learningSnippets={[]}
        onOpenPath={vi.fn()}
        onTerminalSplitToggle={vi.fn()}
        recentDocuments={[]}
        searchQuery=""
        searchResults={[]}
        selectionState={{
          column: 4,
          from: 5,
          line: 2,
          text: "",
          to: 5,
        }}
      />,
    );

    expect(screen.getByTestId("notes-cursor-stat")).toHaveTextContent("Ln 3, Col 5");

    rerender(
      <NotesWorkbenchBottomRight
        activeDocument={activeDocument}
        documentSaveState="saved"
        documents={[activeDocument]}
        editorMode="wysiwyg"
        isTerminalSplitOpen={false}
        learningQuery=""
        learningSnippets={[]}
        onOpenPath={vi.fn()}
        onTerminalSplitToggle={vi.fn()}
        recentDocuments={[]}
        searchQuery=""
        searchResults={[]}
        selectionState={{
          column: 10,
          from: 5,
          line: 2,
          text: "hello",
          to: 10,
        }}
      />,
    );

    expect(screen.getByTestId("notes-cursor-stat")).toHaveTextContent("Ln 3, Col 11");
    expect(screen.getByTestId("notes-selection-stat")).toHaveTextContent("已选 5 字符");
  });

  it("shows a dependency review action only when the active learning note is stale", async () => {
    const user = userEvent.setup();
    const onResolveLearningDependencyReview = vi.fn();

    render(
      <NotesWorkbenchBottomRight
        activeDocument={activeDocument}
        documents={[activeDocument]}
        editorMode="wysiwyg"
        isTerminalSplitOpen={false}
        learningDependencyNeedsReview
        learningQuery=""
        learningSnippets={[]}
        onOpenPath={vi.fn()}
        onResolveLearningDependencyReview={onResolveLearningDependencyReview}
        onTerminalSplitToggle={vi.fn()}
        recentDocuments={[]}
        searchQuery=""
        searchResults={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "学习依赖待复核" }));
    await user.click(screen.getByRole("button", { name: "确认已复核" }));

    expect(onResolveLearningDependencyReview).toHaveBeenCalledTimes(1);
  });

  it("does not render history, backlinks, or tags buttons in the bottom right bar", () => {
    render(
      <NotesWorkbenchBottomRight
        activeDocument={activeDocument}
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

    expect(
      screen.queryByRole("button", { name: "历史版本" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "打开反链面板" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "标签" }),
    ).not.toBeInTheDocument();
  });
});
