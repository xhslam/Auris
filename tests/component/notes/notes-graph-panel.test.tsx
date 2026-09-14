import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { NotesGraphPanel } from "@/components/notes-v2/notes-graph-panel";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import { buildMarkdownIndex } from "@/features/notes/documents/markdown-index";

function doc(
  path: string,
  rawSource: string,
  frontmatter: Record<string, unknown> = {},
): NoteDocument {
  const fileName = path.split("/").pop() ?? path;

  return {
    basename: fileName.replace(/\.md$/, ""),
    fileName,
    frontmatter,
    mtime: null,
    parsed: buildMarkdownIndex(rawSource),
    path,
    rawSource,
  };
}

/**
 * 这些用例断言的是面板自己的状态机：工具栏、规模摘要、三种空状态。dagre 布局
 * 与悬空边过滤由 `tests/unit/notes/graph-to-flow.test.ts` 覆盖，图构建规则由
 * `tests/unit/notes/relationship-graph.test.ts` 覆盖，这里不重复。
 *
 * 画布在 jsdom 里会真的挂载（`next/dynamic` 的 `ssr:false` 只关掉服务端渲染），
 * 所以 xyflow 需要的 `ResizeObserver` 由 `vitest.setup.ts` 补齐。
 */
describe("NotesGraphPanel", () => {
  it("shows a load error instead of presenting a partial graph as complete", async () => {
    render(
      <NotesGraphPanel
        activePath="a.md"
        documents={[doc("a.md", "# A\n\n[[B]]")]}
        onEnsureDocuments={async () => {
          throw new Error("Could not read the whole vault.");
        }}
      />,
    );

    expect(screen.getByTestId("notes-graph-pending")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Could not read the whole vault.",
      ),
    );
    expect(screen.queryByText(/1 篇笔记/u)).not.toBeInTheDocument();
  });

  it("reports graph size so the user knows what is being drawn", () => {
    render(
      <NotesGraphPanel
        activePath="a.md"
        documents={[doc("a.md", "# A\n\n[[B]] #shared"), doc("b.md", "# B\n\n#shared")]}
      />,
    );

    // 默认 local scope + depth 1，从 a.md 出发：a、b、#shared。
    expect(
      screen.getByText(NOTES_UI_COPY.panels.graph.summary(2, 1, 3), { exact: false }),
    ).toBeInTheDocument();
  });

  it("counts unresolved targets separately instead of inflating the note count", () => {
    render(<NotesGraphPanel activePath="a.md" documents={[doc("a.md", "# A\n\n[[Ghost]]")]} />);

    expect(
      screen.getByText(NOTES_UI_COPY.panels.graph.unresolved(1), { exact: false }),
    ).toBeInTheDocument();
    // 1 篇真实笔记，不是 2 篇——幽灵目标不是库里的内容。
    expect(
      screen.getByText(NOTES_UI_COPY.panels.graph.summary(1, 0, 1), { exact: false }),
    ).toBeInTheDocument();
  });

  it("says the vault is empty rather than drawing a blank canvas", () => {
    render(<NotesGraphPanel activePath={null} documents={[]} />);

    expect(screen.getByText(NOTES_UI_COPY.panels.graph.emptyVault)).toBeInTheDocument();
    expect(screen.queryByTestId("notes-graph-pending")).not.toBeInTheDocument();
  });

  it("explains that local scope needs an open note", () => {
    render(<NotesGraphPanel activePath={null} documents={[doc("a.md", "# A")]} />);

    expect(screen.getByText(NOTES_UI_COPY.panels.graph.emptyNoActive)).toBeInTheDocument();
  });

  it("switches to the whole vault, which does not need an active note", async () => {
    const user = userEvent.setup();
    render(<NotesGraphPanel activePath={null} documents={[doc("a.md", "# A")]} />);

    await user.click(screen.getByRole("button", { name: NOTES_UI_COPY.panels.graph.scopeVault }));

    expect(screen.queryByText(NOTES_UI_COPY.panels.graph.emptyNoActive)).not.toBeInTheDocument();
    expect(
      screen.getByText(NOTES_UI_COPY.panels.graph.summary(1, 0, 0), { exact: false }),
    ).toBeInTheDocument();
  });

  it("disables the depth control outside local scope, where it means nothing", async () => {
    const user = userEvent.setup();
    render(<NotesGraphPanel activePath="a.md" documents={[doc("a.md", "# A")]} />);

    const depth = screen.getByLabelText(NOTES_UI_COPY.panels.graph.depthLabel);
    expect(depth).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: NOTES_UI_COPY.panels.graph.scopeVault }));
    expect(depth).toBeDisabled();
  });

  it("widens the neighbourhood as depth grows", async () => {
    const user = userEvent.setup();
    const docs = [
      doc("a.md", "# A\n\n[[B]]"),
      doc("b.md", "# B\n\n[[C]]"),
      doc("c.md", "# C"),
    ];
    render(<NotesGraphPanel activePath="a.md" documents={docs} />);

    // depth 1：a、b。
    expect(
      screen.getByText(NOTES_UI_COPY.panels.graph.summary(2, 0, 1), { exact: false }),
    ).toBeInTheDocument();

    await user.selectOptions(
      screen.getByLabelText(NOTES_UI_COPY.panels.graph.depthLabel),
      "2",
    );

    // depth 2：a、b、c。
    expect(
      screen.getByText(NOTES_UI_COPY.panels.graph.summary(3, 0, 2), { exact: false }),
    ).toBeInTheDocument();
  });

  it("drops tag nodes when tags are toggled off", async () => {
    const user = userEvent.setup();
    render(
      <NotesGraphPanel
        activePath="a.md"
        documents={[doc("a.md", "# A\n\n[[B]] #shared"), doc("b.md", "# B\n\n#shared")]}
      />,
    );

    await user.click(screen.getByRole("button", { name: NOTES_UI_COPY.panels.graph.tagsToggle }));

    // 标签节点与它的两条边一起消失，只留下 a→b。
    expect(
      screen.getByText(NOTES_UI_COPY.panels.graph.summary(2, 0, 1), { exact: false }),
    ).toBeInTheDocument();
  });

  it("draws an isolated note as itself rather than reporting nothing", () => {
    render(
      <NotesGraphPanel
        activePath="lonely.md"
        documents={[doc("lonely.md", "# Lonely"), doc("other.md", "# Other")]}
      />,
    );

    // 一篇谁也不连的笔记，在 local scope 下自身仍是一个节点：这是真实情况
    // （「这篇笔记还没有任何关联」），不是空图，所以不能显示空状态文案。
    expect(
      screen.getByText(NOTES_UI_COPY.panels.graph.summary(1, 0, 0), { exact: false }),
    ).toBeInTheDocument();
    expect(screen.queryByText(NOTES_UI_COPY.panels.graph.emptyIsolated)).not.toBeInTheDocument();
    expect(screen.getByTestId("notes-graph-canvas")).toBeInTheDocument();
  });

  it("reports an empty neighbourhood when the active path is not in the vault", () => {
    render(
      <NotesGraphPanel activePath="missing.md" documents={[doc("a.md", "# A")]} />,
    );

    expect(screen.getByText(NOTES_UI_COPY.panels.graph.emptyIsolated)).toBeInTheDocument();
  });
});
