import { describe, expect, it } from "vitest";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import {
  buildWikiLinkNoteSource,
  findWikiLinkAtLineOffset,
  parseWikiLinkTarget,
  planWikiLinkNavigation,
} from "@/features/notes/documents/wiki-link-navigation";

function createDocument(path: string, rawSource = ""): NoteDocument {
  const fileName = path.split("/").at(-1) ?? path;
  const basename = fileName.replace(/\.md$/i, "");

  return {
    basename,
    fileName,
    frontmatter: {},
    mtime: null,
    parsed: {
      backlinks: [],
      embeds: [],
      headings: [],
      links: [],
      tags: [],
      tasks: [],
      title: basename,
      wordCount: rawSource.split(/\s+/).filter(Boolean).length,
    },
    path,
    rawSource,
  };
}

describe("parseWikiLinkTarget", () => {
  it("returns the inner target from a raw token", () => {
    expect(parseWikiLinkTarget("[[grammar]]")).toBe("grammar");
  });

  it("strips headings and aliases", () => {
    expect(parseWikiLinkTarget("[[grammar#tense|时态]]")).toBe("grammar");
    expect(parseWikiLinkTarget("grammar#tense|时态")).toBe("grammar");
  });

  it("returns an empty string for blank tokens", () => {
    expect(parseWikiLinkTarget("[[]]")).toBe("");
    expect(parseWikiLinkTarget("  ")).toBe("");
  });
});

describe("planWikiLinkNavigation", () => {
  it("opens an existing note resolved by basename", () => {
    const documents = [
      createDocument("notes/daily.md"),
      createDocument("notes/grammar.md"),
    ];

    expect(
      planWikiLinkNavigation("grammar", "notes/daily.md", documents),
    ).toEqual({ path: "notes/grammar.md", type: "open" });
  });

  it("opens an existing note resolved with heading and alias decorations", () => {
    const documents = [
      createDocument("daily.md"),
      createDocument("复盘/11.12.md"),
    ];

    expect(
      planWikiLinkNavigation("[[11.12#总结|十一月]]", "daily.md", documents),
    ).toEqual({ path: "复盘/11.12.md", type: "open" });
  });

  it("plans creating a missing note at the vault root", () => {
    const documents = [createDocument("daily.md")];

    expect(planWikiLinkNavigation("光影战士", "daily.md", documents)).toEqual({
      path: "光影战士.md",
      title: "光影战士",
      type: "create",
    });
  });

  it("keeps folder segments in the missing-note path", () => {
    expect(planWikiLinkNavigation("复盘/新笔记", "daily.md", [])).toEqual({
      path: "复盘/新笔记.md",
      title: "新笔记",
      type: "create",
    });
  });

  it("returns null for empty or unsafe targets", () => {
    expect(planWikiLinkNavigation("", "daily.md", [])).toBeNull();
    expect(planWikiLinkNavigation("[[]]", "daily.md", [])).toBeNull();
    expect(planWikiLinkNavigation("../escape", "daily.md", [])).toBeNull();
  });
});

describe("buildWikiLinkNoteSource", () => {
  it("creates a minimal note body titled after the link", () => {
    expect(buildWikiLinkNoteSource("光影战士")).toBe("# 光影战士\n\n");
  });
});

describe("findWikiLinkAtLineOffset", () => {
  const line = "前文 [[grammar|语法]] 后文 [[11.12]] 结尾";

  it("finds the wiki link token covering the offset", () => {
    const firstStart = line.indexOf("[[grammar");

    expect(findWikiLinkAtLineOffset(line, firstStart + 3)).toBe(
      "grammar|语法",
    );
  });

  it("finds the second link on the same line", () => {
    const secondStart = line.indexOf("[[11.12");

    expect(findWikiLinkAtLineOffset(line, secondStart + 4)).toBe("11.12");
  });

  it("returns null outside any link", () => {
    expect(findWikiLinkAtLineOffset(line, 0)).toBeNull();
    expect(findWikiLinkAtLineOffset("没有链接的行", 2)).toBeNull();
  });
});
