import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NotesReadingPane } from "@/components/notes-v2/notes-reading-pane";
import type { NoteDocument } from "@/features/notes/documents/document-types";

function createDocument(rawSource: string): NoteDocument {
  return {
    basename: "study-note",
    fileName: "study-note.md",
    frontmatter: {},
    mtime: "2026-04-08T00:00:00.000Z",
    parsed: {
      backlinks: [],
      embeds: [],
      headings: [],
      links: [],
      tags: [],
      tasks: [],
      title: "Study Note",
      wordCount: 0,
    },
    path: "Inbox/study-note.md",
    rawSource,
  };
}

describe("NotesReadingPane", () => {
  it("preserves source line breaks for paragraph-style numbered lines", () => {
    const fullWidthParen = "\uFF09";
    const firstLine = `1${fullWidthParen} protagonist reversal`;

    render(
      <NotesReadingPane
        document={createDocument(
          [
            "# Thinking constraints",
            "",
            "### Six story shapes",
            firstLine,
            `2${fullWidthParen} rival-to-lover arc`,
            `3${fullWidthParen} self-training before victory`,
          ].join("\n"),
        )}
      />,
    );

    const numberedParagraph = screen
      .getByText(firstLine, { exact: false })
      .closest("p");

    expect(numberedParagraph).toBeInTheDocument();
    expect(numberedParagraph?.querySelectorAll("br")).toHaveLength(2);
  });

  it("renders [TOC] as an accessible table of contents with stable heading anchors", () => {
    render(
      <NotesReadingPane
        document={createDocument(
          [
            "[TOC]",
            "",
            "# 第一章",
            "正文",
            "## 方法",
            "更多正文",
            "## 方法",
          ].join("\n"),
        )}
      />,
    );

    const toc = screen.getByRole("navigation", {
      name: "Table of contents",
    });
    const links = toc.querySelectorAll("a");

    expect(links).toHaveLength(3);
    expect(links[0]?.textContent).toBe("第一章");
    expect(links[1]?.textContent).toBe("方法");
    expect(links[1]?.getAttribute("href")).not.toBe(
      links[2]?.getAttribute("href"),
    );

    const firstHeadingId = links[0]?.getAttribute("href")?.slice(1);

    expect(firstHeadingId).toBeTruthy();
    expect(document.getElementById(firstHeadingId as string)).toHaveTextContent(
      "第一章",
    );
  });

  it("renders inline code, wiki links, and display math in the large reading surface", () => {
    render(
      <NotesReadingPane
        document={createDocument(
          [
            "# Vehicle notes",
            "",
            "Use `Ft` from [[附着力|traction]] before launch.",
            "",
            "$$",
            "F_t \\le F_\\varphi",
            "$$",
          ].join("\n"),
        )}
      />,
    );

    expect(screen.getByText("Ft")).toBeInTheDocument();
    expect(screen.getByText("traction")).toHaveClass("notes-v2__reading-wikilink");
    expect(
      document.querySelector(".notes-v2__reading-math .katex"),
    ).not.toBeNull();
  });

  it("invokes onOpenWikiLink with the link target when a wiki link is clicked", () => {
    const onOpenWikiLink = vi.fn();

    render(
      <NotesReadingPane
        document={createDocument(
          ["# 索引", "", "- [[复盘/11.12#总结|十一月复盘]]"].join("\n"),
        )}
        onOpenWikiLink={onOpenWikiLink}
      />,
    );

    const link = screen.getByText("十一月复盘");

    expect(link.tagName).toBe("A");
    fireEvent.click(link);
    expect(onOpenWikiLink).toHaveBeenCalledWith("复盘/11.12");
  });

  it("keeps wiki links as plain text when no handler is provided", () => {
    render(
      <NotesReadingPane
        document={createDocument("查看 [[grammar|语法]] 笔记")}
      />,
    );

    expect(screen.getByText("语法").tagName).toBe("SPAN");
  });

  it("colours wiki links as resolved vs missing based on the vault documents", () => {
    const active = createDocument("[[grammar]] 与 [[missing-note]]");
    const grammar: NoteDocument = {
      ...active,
      basename: "grammar",
      fileName: "grammar.md",
      path: "grammar.md",
      rawSource: "# Grammar",
    };

    render(
      <NotesReadingPane
        document={active}
        documents={[active, grammar]}
        onOpenWikiLink={vi.fn()}
      />,
    );

    expect(screen.getByText("grammar")).toHaveClass(
      "notes-v2__reading-wikilink--exists",
    );
    expect(screen.getByText("missing-note")).toHaveClass(
      "notes-v2__reading-wikilink--missing",
    );
  });
});
