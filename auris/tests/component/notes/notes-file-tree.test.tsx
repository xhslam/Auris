import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NotesFileTree } from "@/components/notes-v2/notes-file-tree";
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
    const attachmentButton = screen.getByRole("button", { name: /notes\.csv/i });
    expect(within(markdownButton).getByText("daily.md")).toBeInTheDocument();
    expect(screen.queryByText("Markdown")).not.toBeInTheDocument();
    expect(screen.queryByText("音频")).not.toBeInTheDocument();
    expect(screen.queryByText("附件")).not.toBeInTheDocument();
    expect(audioButton).toBeDisabled();
    expect(attachmentButton).toBeDisabled();

    await user.click(markdownButton);

    expect(onOpenPath).toHaveBeenCalledWith("notes/daily.md");
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
});
