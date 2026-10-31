import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NotesExplorer } from "@/components/notes-v2/notes-explorer";
import type { VaultEntry } from "@/features/notes/vault/vault-types";

function file(path: string): VaultEntry {
  return { kind: "file", path, name: path.split("/").at(-1)!, mtime: null, size: 1 };
}

const entries = [
  file("notes/sub/draft.md"), file("guide.MARKDOWN"), file("image.PNG"),
  file("diagram.svg"), file("photo.heic"), file("animation.webp"),
  file("data.json"), file("text.txt"), file("table.csv"), file("sound.mp3"),
  file("video.mp4"), file("paper.pdf"), file("fake.png.zip"),
  { kind: "directory", path: "empty", name: "empty", mtime: null, size: null } as VaultEntry,
];

function collapseAll() {
  fireEvent.click(screen.getByText("更多文件操作").closest("summary")!);
  fireEvent.click(screen.getByRole("button", { name: "折叠全部文件夹" }));
}

function setup() {
  const onOpenPath = vi.fn();
  render(<NotesExplorer activePath="notes/sub/draft.md" entries={entries}
    onOpenPath={onOpenPath} onCollapse={vi.fn()} />);
  return { onOpenPath };
}

describe("NotesExplorer", () => {
  it("shows only Markdown, images and folders, including empty folders", () => {
    setup();
    for (const name of ["draft.md", "guide.MARKDOWN", "image.PNG", "diagram.svg", "photo.heic", "animation.webp", "empty"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    for (const name of ["data.json", "text.txt", "table.csv", "sound.mp3", "video.mp4", "paper.pdf", "fake.png.zip"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "json" } });
    expect(screen.getByText("没有匹配的文件")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "data.json" })).not.toBeInTheDocument();
  });

  it("collapses nested and active folders without closing the active document", () => {
    const { onOpenPath } = setup();

    expect(screen.getByRole("button", { name: "draft.md" })).toBeInTheDocument();
    collapseAll();
    expect(screen.getByRole("button", { name: /notes/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "draft.md" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /notes/ }));
    expect(screen.getByRole("button", { name: /sub/ })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: /sub/ }));
    expect(screen.getByRole("button", { name: "draft.md" })).toBeInTheDocument();
    collapseAll();
    expect(screen.queryByRole("button", { name: "draft.md" })).not.toBeInTheDocument();
    expect(onOpenPath).not.toHaveBeenCalled();
  });

  it("also collapses folders hidden by the current search", () => {
    setup();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "image" } });
    collapseAll();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    expect(screen.getByRole("button", { name: /notes/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "draft.md" })).not.toBeInTheDocument();
  });
  it("reveals search matches without overwriting the previous expansion state", () => {
    setup();
    collapseAll();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "draft" } });
    expect(screen.getByRole("button", { name: "draft.md" })).toBeVisible();
    expect(screen.getByRole("button", { name: /notes/ })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "清空筛选" }));
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.getByRole("button", { name: /notes/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "draft.md" })).not.toBeInTheDocument();
  });

  it("exposes low-frequency actions and full folder names", () => {
    setup();
    expect(screen.getByText("更多文件操作")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /notes/ })).toHaveAttribute("title", "notes");
    fireEvent.click(screen.getByText("更多文件操作").closest("summary")!);
    expect(screen.getByRole("button", { name: "刷新文件" })).toHaveAttribute("title", "刷新文件");
  });

  it("clears with Escape and restores focus after a menu action", () => {
    setup();
    const search = screen.getByRole("searchbox");
    fireEvent.change(search, { target: { value: "  draft  " } });
    expect(screen.getByRole("button", { name: "draft.md" })).toBeVisible();
    fireEvent.keyDown(search, { key: "Escape" });
    expect(search).toHaveValue("");
    expect(search).toHaveFocus();
    collapseAll();
    expect(screen.getByText("更多文件操作").closest("summary")).toHaveFocus();
  });

  it("does not count hidden files as visible search results", () => {
    render(<NotesExplorer activePath={null} entries={[file(".private/secret.md")]}
      onOpenPath={vi.fn()} onCollapse={vi.fn()} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "secret" } });
    expect(screen.getByRole("status")).toHaveTextContent("没有匹配的文件");
    expect(screen.queryByRole("button", { name: "secret.md" })).not.toBeInTheDocument();
  });

});
