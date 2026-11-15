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
  fireEvent.click(screen.getByRole("button", { name: "折叠全部文件夹" }));
}

function setup() {
  const onOpenPath = vi.fn();
  render(<NotesExplorer activePath="notes/sub/draft.md" entries={entries}
    onOpenPath={onOpenPath} onCollapse={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "筛选文件" }));
  return { onOpenPath };
}

describe("NotesExplorer", () => {
  it("keeps the default toolbar icon-only and moves the vault name to the footer", () => {
    const pick = vi.fn();
    const commands = vi.fn();
    render(<NotesExplorer activePath={null} entries={entries} onOpenPath={vi.fn()}
      onCollapse={vi.fn()} onPickDirectory={pick} onOpenCommands={commands}
      directoryInfo={{ connectionStatus: "configured", directoryName: "Alex's Original Vault", isConfigured: true, isSupported: true, vaultPath: "vault" }} />);
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.getByRole("toolbar")).not.toHaveTextContent("文档");
    expect(screen.getByRole("button", { name: "切换笔记库" }).closest("footer")).not.toBeNull();
    expect(screen.getByText("Alex's Original Vault")).toBeVisible();
    expect(screen.getByRole("link", { name: "设置" })).toHaveAttribute("href", "/settings");
    fireEvent.click(screen.getByRole("button", { name: "切换笔记库" }));
    fireEvent.click(screen.getByRole("button", { name: "命令与快捷键" }));
    expect(pick).toHaveBeenCalledOnce();
    expect(commands).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "筛选文件" }));
    expect(screen.getByRole("searchbox")).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "筛选文件" })).toHaveFocus();
  });

  it("uses 34px virtual rows, 20px child indentation, and reversible name sorting", () => {
    setup();
    const child = screen.getByRole("button", { name: "draft.md" }).closest("li")!;
    expect(child.style.height).toBe("34px");
    expect(child.style.getPropertyValue("--notes-tree-indent")).toBe("40px");
    expect(screen.getByRole("button", { name: "notes" }).querySelector(".notes-explorer__entry-icon")).toBeNull();
    const rootNames = () => screen.getAllByRole("treeitem").filter((item) => item.getAttribute("aria-level") === "1").map((item) => item.textContent);
    const before = rootNames();
    fireEvent.click(screen.getByRole("button", { name: "按名称倒序排列" }));
    expect(rootNames()).not.toEqual(before);
    expect(screen.getByRole("button", { name: "按名称倒序排列" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "按名称倒序排列" }));
    expect(rootNames()).toEqual(before);
  });

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
    fireEvent.click(screen.getByText("更多文件操作").closest("summary")!);
    fireEvent.keyDown(screen.getByText("更多文件操作").closest("details")!, { key: "Escape" });
    expect(screen.getByText("更多文件操作").closest("summary")).toHaveFocus();
  });

  it("does not count hidden files as visible search results", () => {
    render(<NotesExplorer activePath={null} entries={[file(".private/secret.md")]}
      onOpenPath={vi.fn()} onCollapse={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "筛选文件" }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "secret" } });
    expect(screen.getByRole("status")).toHaveTextContent("没有匹配的文件");
    expect(screen.queryByRole("button", { name: "secret.md" })).not.toBeInTheDocument();
  });

  it("shows connecting hint instead of unconfigured message when connectionStatus is unknown", () => {
    render(
      <NotesExplorer
        activePath={null}
        entries={[]}
        onOpenPath={vi.fn()}
        onCollapse={vi.fn()}
        directoryInfo={{
          connectionStatus: "unknown",
          directoryName: null,
          isConfigured: false,
          isSupported: true,
          vaultPath: null,
        }}
      />,
    );
    expect(screen.getByText("正在连接笔记库…")).toBeInTheDocument();
    expect(screen.queryByText("打开一个文件夹，开始写作。")).not.toBeInTheDocument();
  });

  it("shows unconfigured empty state only when connection is explicitly unconfigured", () => {
    render(
      <NotesExplorer
        activePath={null}
        entries={[]}
        onOpenPath={vi.fn()}
        onCollapse={vi.fn()}
        directoryInfo={{
          connectionStatus: "unconfigured",
          directoryName: null,
          isConfigured: false,
          isSupported: true,
          vaultPath: null,
        }}
      />,
    );
    expect(screen.getByText("打开一个文件夹，开始写作。")).toBeInTheDocument();
  });
});
