import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NotesEditorPane } from "@/components/notes-v2/notes-editor-pane";
import type { NoteDocument } from "@/features/notes/documents/document-types";

function createDocument(rawSource: string, notePath = "notes/lint.md"): NoteDocument {
  return {
    basename: path.basename(notePath, path.extname(notePath)),
    fileName: path.basename(notePath),
    frontmatter: {},
    mtime: "2026-08-08T00:00:00.000Z",
    parsed: {
      backlinks: [],
      embeds: [],
      headings: [],
      links: [],
      tags: [],
      tasks: [],
      title: "Lint",
      wordCount: 0,
    },
    path: notePath,
    rawSource,
  };
}

function renderPane(rawSource: string, notePath?: string) {
  const document = createDocument(rawSource, notePath);

  return render(
    <NotesEditorPane
      document={document}
      documents={[document]}
      editorMode="source"
      onDocumentChange={vi.fn()}
    />,
  );
}

describe("notes editor lint summary", () => {
  it("reports a clean Markdown document as having no issues", () => {
    const { container } = renderPane("# Title\n\nA clean paragraph.\n");
    const badge = container.querySelector(".notes-v2__lint-summary");

    expect(badge?.textContent).toBe("Lint 0");
    expect(badge?.getAttribute("data-has-errors")).toBe("false");
  });

  it("flags an unclosed code fence as an error", () => {
    const { container } = renderPane("# Title\n\n```text\nstill open\n");
    const badge = container.querySelector(".notes-v2__lint-summary");

    expect(badge?.textContent).toBe("Lint 1");
    expect(badge?.getAttribute("data-has-errors")).toBe("true");
    expect(badge?.getAttribute("title")).toContain("代码围栏未闭合。");
  });

  it("counts warnings without marking the document as having errors", () => {
    const { container } = renderPane("# Title\n\ntrailing space here   \n");
    const badge = container.querySelector(".notes-v2__lint-summary");

    expect(badge?.textContent).toBe("Lint 1");
    expect(badge?.getAttribute("data-has-errors")).toBe("false");
    expect(badge?.getAttribute("title")).toContain("行尾包含多余空白。");
  });

  it("lists every issue with its line number in the tooltip", () => {
    const { container } = renderPane("# Dup\n\n# Dup\n\n[link](\n");
    const badge = container.querySelector(".notes-v2__lint-summary");
    const title = badge?.getAttribute("title") ?? "";

    expect(badge?.textContent).toBe("Lint 2");
    expect(badge?.getAttribute("data-has-errors")).toBe("true");
    expect(title).toContain("L3: 标题与第 1 行重复。");
    expect(title).toContain("L5: Markdown 链接缺少右括号。");
  });

  it("opens a keyboard-accessible diagnostics panel with line targets", async () => {
    const user = userEvent.setup();
    renderPane("# Title\n\n[link](\n");
    await user.click(
      screen.getByRole("button", { name: "Markdown lint: 1 issues" }),
    );
    const diagnostics = screen.getByRole("region", {
      name: "Markdown lint diagnostics",
    });
    expect(
      screen.getByRole("button", { name: "L3: Markdown 链接缺少右括号。" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "L3: Markdown 链接缺少右括号。" }),
    );
    expect(diagnostics).not.toBeInTheDocument();
  });
  it("omits the badge for non-Markdown formats", () => {
    const { container } = renderPane('{\n  "a": 1\n}\n', "notes/data.json");

    expect(container.querySelector(".notes-v2__lint-summary")).toBeNull();
  });

  it("styles the error state distinctly from the default state", () => {
    const css = readFileSync(
      path.join(process.cwd(), "src", "app", "globals.css"),
      "utf-8",
    );
    const baseRule = css.match(/\.notes-v2__lint-summary\s*\{([^}]*)\}/)?.[1];
    const errorRule = css.match(
      /\.notes-v2__lint-summary\[data-has-errors="true"\]\s*\{([^}]*)\}/,
    )?.[1];

    expect(baseRule).toContain("color: var(--notes-muted");
    expect(errorRule).toContain("color: #b42318");
  });
});
