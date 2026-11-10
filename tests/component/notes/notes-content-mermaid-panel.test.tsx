import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NotesContentMermaidPanel } from "@/components/notes-v2/notes-content-mermaid-panel";
import { writeContentMermaid } from "@/features/notes/graph/content-mermaid";
import type { NoteDocument } from "@/features/notes/documents/document-types";

vi.mock("@/components/notes-v2/notes-content-mermaid-renderer", () => ({
  renderArticleMermaid: vi.fn(async (code: string) => {
    if (code === "bad") throw new Error("Parse error");
    return `<svg role="img"><text>${code.includes("new") ? "new" : "old"}</text></svg>`;
  }),
}));
function doc(source: string, path = "学习.md") { return { path, rawSource: source } as NoteDocument; }

describe("article diagram panel", () => {
  it("requires a note before offering a handoff", () => {
    render(<NotesContentMermaidPanel document={null} />);
    expect(screen.getByText("请先打开一篇笔记。")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("copies a path-pinned Agent instruction without claiming to generate a diagram", async () => {
    const user = userEvent.setup();
    render(<NotesContentMermaidPanel document={doc("# 学习")} />);
    expect(screen.getByText("这篇文章还没有 Mermaid 图。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "复制 Agent 生成指令" }));
    expect(await navigator.clipboard.readText()).toContain('tab_id="学习.md"');
    expect(screen.getByRole("status")).toHaveTextContent("已复制");
  });
  it("updates from current document source without closing and never leaks graphs across notes", async () => {
    const { rerender } = render(<NotesContentMermaidPanel document={doc(writeContentMermaid("# A", "graph LR\n old --> B"))} />);
    await waitFor(() => expect(screen.getByTestId("article-mermaid-svg").querySelector("svg")).not.toBeNull());
    rerender(<NotesContentMermaidPanel document={doc(writeContentMermaid("# A", "graph LR\n new --> B"))} />);
    await waitFor(() => expect(screen.getByTestId("article-mermaid-svg")).toHaveTextContent("new"));
    rerender(<NotesContentMermaidPanel document={doc("# B", "B.md")} />);
    expect(screen.queryByTestId("article-mermaid-svg")).not.toBeInTheDocument();
    expect(screen.getByText("这篇文章还没有 Mermaid 图。")).toBeInTheDocument();
  });
  it("shows syntax errors with a repair instruction instead of a blank graph", async () => {
    render(<NotesContentMermaidPanel document={doc(writeContentMermaid("# A", "bad"))} />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Parse error"));
    expect(screen.getByRole("button", { name: "复制 Agent 生成指令" })).toBeInTheDocument();
  });
  it("marks the graph stale after body edits", async () => {
    const source = writeContentMermaid("# A\nold", "graph TD\n A --> B").replace("\nold", "\nnew");
    render(<NotesContentMermaidPanel document={doc(source)} />);
    expect(screen.getByText("正文已变化，可让 Agent 更新图。")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("article-mermaid-svg").querySelector("svg")).not.toBeNull());
  });
  it("keeps a selectable prompt when clipboard access fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(new Error("denied"));
    render(<NotesContentMermaidPanel document={doc("# A")} />);
    await user.click(screen.getByRole("button", { name: "复制 Agent 生成指令" }));
    expect((screen.getByRole("textbox", { name: "Agent 生成指令" }) as HTMLTextAreaElement).value).toContain("write_mermaid");
  });
});
