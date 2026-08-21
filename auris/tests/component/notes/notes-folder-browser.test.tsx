import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotesFolderBrowser } from "@/components/notes-v2/notes-folder-browser";
import type { NoteDocument } from "@/features/notes/documents/document-types";

function makeDocument(input: {
  path: string;
  source: string;
  title: string;
  updatedAt?: string;
}): NoteDocument {
  const fileName = input.path.split("/").at(-1) ?? "untitled.md";
  return {
    basename: fileName.replace(/\.md$/u, ""),
    fileName,
    formatId: "markdown",
    frontmatter: {},
    mtime: input.updatedAt ?? "2026-08-21T12:00:00.000Z",
    parsed: {
      backlinks: [],
      embeds: [],
      headings: [],
      links: [],
      tags: [],
      tasks: [],
      title: input.title,
      wordCount: 4,
    },
    path: input.path,
    rawSource: input.source,
  };
}

const folder = {
  id: "study",
  name: "Study",
  path: "/vaults/study",
};

const documents = [
  makeDocument({
    path: "control-system.md",
    title: "Control System",
    source: "# Control System\n\n二阶系统的阶跃响应与阻尼比。",
    updatedAt: "2026-08-21T12:00:00.000Z",
  }),
  makeDocument({
    path: "linear-algebra.md",
    title: "Linear Algebra",
    source: "# Linear Algebra\n\n正定矩阵与二次型的关系。",
    updatedAt: "2026-08-19T12:00:00.000Z",
  }),
];

function renderBrowser(overrides: Partial<ComponentProps<typeof NotesFolderBrowser>> = {}) {
  const onCreateNote = vi.fn();
  const onEnsureDocuments = vi.fn(async () => undefined);
  const onOpenNote = vi.fn();

  render(
    <NotesFolderBrowser
      documents={documents}
      folder={folder}
      isReady
      onCreateNote={onCreateNote}
      onEnsureDocuments={onEnsureDocuments}
      onOpenNote={onOpenNote}
      theme="mint"
      {...overrides}
    />,
  );

  return { onCreateNote, onEnsureDocuments, onOpenNote };
}

afterEach(() => {
  window.sessionStorage.clear();
});

describe("NotesFolderBrowser", () => {
  it("defaults to Grid, opens real notes, and persists a List selection for the session", async () => {
    const { onOpenNote } = renderBrowser();

    await screen.findByRole("button", { name: "打开笔记 Control System" });
    expect(screen.getByText("Control System").closest("button")).toHaveClass(
      "notes-folder-browser__card",
    );

    fireEvent.click(screen.getByRole("button", { name: "打开笔记 Control System" }));
    expect(onOpenNote).toHaveBeenCalledWith("control-system.md");

    fireEvent.click(screen.getByRole("button", { name: "列表视图" }));
    expect(screen.getByText("名称")).toBeInTheDocument();
    expect(window.sessionStorage.getItem("auris.notes.folder-browser-view")).toBe(
      "list",
    );
  });

  it("filters the current folder by filename and title without invoking global search", async () => {
    renderBrowser();
    await screen.findByText("Control System");

    fireEvent.click(screen.getByRole("button", { name: "搜索 Study 中的文件" }));
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "linear" },
    });

    expect(screen.getByText("Linear Algebra")).toBeInTheDocument();
    expect(screen.queryByText("Control System")).not.toBeInTheDocument();
  });

  it("uses a dedicated empty-folder state with a working new-note action", async () => {
    const { onCreateNote } = renderBrowser({ documents: [] });

    await waitFor(() =>
      expect(screen.getByText("这里还没有笔记")).toBeInTheDocument(),
    );
    expect(screen.queryByText("开始你的下一页笔记")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "新建笔记" }));
    expect(onCreateNote).toHaveBeenCalledOnce();
  });
});
