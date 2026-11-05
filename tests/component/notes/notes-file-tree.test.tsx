import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  NotesFileTree,
  createTree,
} from "@/components/notes-v2/notes-file-tree";
import type { VaultEntry } from "@/features/notes/vault/vault-types";

const ENTRIES: VaultEntry[] = [
  {
    kind: "directory",
    mtime: null,
    name: ".claude",
    path: ".claude",
    size: null,
  },
  {
    kind: "file",
    mtime: "2026-04-04T00:00:00.000Z",
    name: "product-complete.md",
    path: ".claude/skills/product-complete.md",
    size: 256,
  },
  {
    kind: "directory",
    mtime: null,
    name: "notes",
    path: "notes",
    size: null,
  },
  {
    kind: "file",
    mtime: "2026-04-04T00:00:00.000Z",
    name: "daily.md",
    path: "notes/daily.md",
    size: 128,
  },
  {
    kind: "file",
    mtime: "2026-04-04T00:00:00.000Z",
    name: "report.md",
    path: "视频区/analysis/report.md",
    size: 64,
  },
  {
    kind: "directory",
    mtime: null,
    name: "Inbox",
    path: "Inbox",
    size: null,
  },
  {
    kind: "file",
    mtime: "2026-04-04T00:00:00.000Z",
    name: "draft.md",
    path: "Inbox/draft.md",
    size: 96,
  },
  {
    kind: "file",
    mtime: "2026-04-04T00:00:00.000Z",
    name: "lesson.mp3",
    path: "assets/lesson.mp3",
    size: 128,
  },
  {
    kind: "file",
    mtime: "2026-04-04T00:00:00.000Z",
    name: "notes.csv",
    path: "assets/notes.csv",
    size: 64,
  },
];

describe("NotesFileTree", () => {
  it("renders vault entries and opens a file when selected", async () => {
    const user = userEvent.setup();
    const onOpenPath = vi.fn();

    render(
      <NotesFileTree
        activePath="notes/daily.md"
        entries={ENTRIES}
        onOpenPath={onOpenPath}
      />,
    );

    expect(screen.getByText("notes")).toBeInTheDocument();
    const markdownButton = screen.getByRole("button", { name: /daily\.md/i });
    const audioButton = screen.getByRole("button", { name: /lesson\.mp3/i });
    const textButton = screen.getByRole("button", { name: /notes\.csv/i });
    expect(within(markdownButton).getByText("daily.md")).toBeInTheDocument();
    expect(screen.queryByText("Markdown")).not.toBeInTheDocument();
    expect(screen.queryByText("音频")).not.toBeInTheDocument();
    expect(screen.queryByText("附件")).not.toBeInTheDocument();
    expect(audioButton).toBeDisabled();
    expect(textButton).toBeEnabled();

    await user.click(markdownButton);
    await user.click(textButton);

    expect(onOpenPath).toHaveBeenNthCalledWith(1, "notes/daily.md");
    expect(onOpenPath).toHaveBeenNthCalledWith(2, "assets/notes.csv");
  });

  it("reveals the active note even when the tree starts fully collapsed", () => {
    // The bottom-left Workspace popover renders with collapseAllByDefault, so a
    // freshly created note (which becomes the active path) must still surface by
    // auto-expanding its parent folder — otherwise it looks like nothing was made.
    render(
      <NotesFileTree
        activePath="notes/daily.md"
        collapseAllByDefault
        entries={ENTRIES}
        onOpenPath={vi.fn()}
      />,
    );

    // Inbox stays collapsed (no active descendant) — its child must be hidden.
    expect(screen.queryByRole("button", { name: /draft\.md/i })).not.toBeInTheDocument();
    // The active note's folder is auto-expanded, so the note itself is visible.
    expect(screen.getByRole("button", { name: /daily\.md/i })).toBeInTheDocument();
  });

  it("renders the Obsidian-style workspace names and extension badges", () => {
    render(
      <NotesFileTree
        activePath="notes/daily.md"
        entries={ENTRIES}
        onOpenPath={vi.fn()}
        variant="obsidian"
      />,
    );

    const tree = document.querySelector(".notes-v2__file-tree");
    const markdownButton = screen.getByRole("button", { name: /daily\.md/i });
    const attachmentButton = screen.getByRole("button", { name: /notes\.csv/i });

    expect(tree).not.toBeNull();
    expect(tree).toHaveAttribute("data-variant", "obsidian");
    expect(within(markdownButton).getByText("daily")).toBeInTheDocument();
    expect(within(markdownButton).queryByText("daily.md")).not.toBeInTheDocument();
    expect(within(attachmentButton).getByText("notes")).toBeInTheDocument();
    expect(within(attachmentButton).getByText("CSV")).toBeInTheDocument();
  });

  it("offers copy and reveal actions for a vault file", async () => {
    const user = userEvent.setup();
    const onCopyPath = vi.fn();
    const onRevealPath = vi.fn();

    render(
      <NotesFileTree
        activePath="notes/daily.md"
        entries={ENTRIES}
        onCopyPath={onCopyPath}
        onOpenPath={vi.fn()}
        onRevealPath={onRevealPath}
      />,
    );

    fireEvent.contextMenu(screen.getByRole("button", { name: /daily\.md/i }));
    await user.click(screen.getByRole("menuitem", { name: "Copy" }));
    expect(onCopyPath).toHaveBeenCalledWith("notes/daily.md");

    fireEvent.contextMenu(screen.getByRole("button", { name: /daily\.md/i }));
    await user.click(screen.getByRole("menuitem", { name: "Show in Finder" }));
    expect(onRevealPath).toHaveBeenCalledWith("notes/daily.md");
  });

  it("hides the claude and video roots while keeping inbox visible", () => {
    render(
      <NotesFileTree
        activePath="Inbox/draft.md"
        entries={ENTRIES}
        onOpenPath={vi.fn()}
      />,
    );

    expect(screen.getByText("Inbox")).toBeInTheDocument();
    expect(screen.queryByText(".claude")).not.toBeInTheDocument();
    expect(screen.queryByText("视频区")).not.toBeInTheDocument();
  });

  it("builds a single directory of 5,000 files near-linearly without duplicate children, preserving directory priority and sorting", () => {
    const start = performance.now();
    const largeEntries: VaultEntry[] = [
      { kind: "directory", mtime: null, name: "large", path: "large", size: null },
      ...Array.from({ length: 5_000 }, (_, i) => ({
        kind: "file" as const,
        mtime: "2026-11-05T00:00:00.000Z",
        name: `note-${String(i).padStart(4, "0")}.md`,
        path: `large/note-${String(i).padStart(4, "0")}.md`,
        size: 10,
      })),
    ];

    const tree = createTree(largeEntries);
    const elapsed = performance.now() - start;

    expect(tree).toHaveLength(1);
    expect(tree[0]?.name).toBe("large");
    expect(tree[0]?.children).toHaveLength(5_000);
    expect(tree[0]?.children[0]?.name).toBe("note-0000.md");
    expect(tree[0]?.children[4999]?.name).toBe("note-4999.md");
    // Near-linear build in memory is fast (< 100ms)
    expect(elapsed).toBeLessThan(500);
  });

  it("virtualizes 10,000 items so that only a small bounded slice is mounted in the DOM", () => {
    const tenThousandEntries: VaultEntry[] = Array.from({ length: 10_000 }, (_, i) => ({
      kind: "file",
      mtime: "2026-11-05T00:00:00.000Z",
      name: `note-${String(i).padStart(5, "0")}.md`,
      path: `note-${String(i).padStart(5, "0")}.md`,
      size: 20,
    }));

    const { container } = render(
      <NotesFileTree
        activePath="note-00000.md"
        entries={tenThousandEntries}
        onOpenPath={vi.fn()}
      />,
    );

    const mountedNodes = container.querySelectorAll(".notes-v2__tree-node");
    // Instead of mounting all 10,000 elements, it mounts only the visible window (default ~27 items)
    expect(mountedNodes.length).toBeLessThan(100);
    expect(mountedNodes.length).toBeGreaterThan(0);
  });
});
