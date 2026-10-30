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
      expect(screen.getByRole("button", { name, exact: true })).toBeInTheDocument();
    }
    for (const name of ["data.json", "text.txt", "table.csv", "sound.mp3", "video.mp4", "paper.pdf", "fake.png.zip"]) {
      expect(screen.queryByRole("button", { name, exact: true })).not.toBeInTheDocument();
    }
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "json" } });
    expect(screen.getByText("没有匹配的文件")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "data.json" })).not.toBeInTheDocument();
  });

  it("collapses nested and active folders without closing the active document", () => {
    const { onOpenPath } = setup();
    const collapse = screen.getByRole("button", { name: "折叠全部文件夹" });
    expect(screen.getByRole("button", { name: "draft.md" })).toBeInTheDocument();
    fireEvent.click(collapse);
    expect(screen.getByRole("button", { name: /notes/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "draft.md" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /notes/ }));
    expect(screen.getByRole("button", { name: /sub/ })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: /sub/ }));
    expect(screen.getByRole("button", { name: "draft.md" })).toBeInTheDocument();
    fireEvent.click(collapse);
    expect(screen.queryByRole("button", { name: "draft.md" })).not.toBeInTheDocument();
    expect(onOpenPath).not.toHaveBeenCalled();
  });

  it("also collapses folders hidden by the current search", () => {
    setup();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "image" } });
    fireEvent.click(screen.getByRole("button", { name: "折叠全部文件夹" }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    expect(screen.getByRole("button", { name: /notes/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "draft.md" })).not.toBeInTheDocument();
  });
});
