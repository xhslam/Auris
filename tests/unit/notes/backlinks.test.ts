import { describe, expect, it } from "vitest";
import {
  buildBacklinksIndex,
  createWikiLinkResolver,
} from "@/features/notes/documents/backlinks";
import type { NoteDocument } from "@/features/notes/documents/document-types";

function createDocument(
  path: string,
  rawSource: string,
  links: NoteDocument["parsed"]["links"],
): NoteDocument {
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
      links,
      tags: [],
      tasks: [],
      title: basename,
      wordCount: rawSource.split(/\s+/).filter(Boolean).length,
    },
    path,
    rawSource,
  };
}

describe("backlinks", () => {
  it("maps wiki link targets back to the documents that reference them", () => {
    const documents = [
      createDocument("daily.md", "[[grammar]]", [
        {
          alias: null,
          heading: null,
          target: "grammar",
        },
      ]),
      createDocument("grammar.md", "# Grammar", []),
    ];

    const backlinks = buildBacklinksIndex(documents);

    expect(backlinks["grammar.md"]).toEqual(["daily.md"]);
    expect(backlinks["daily.md"]).toEqual([]);
  });

  it("maps standard markdown note links back to their targets", () => {
    const documents = [
      createDocument("notes/daily.md", "[Grammar](grammar.md)", [
        {
          alias: "Grammar",
          heading: null,
          target: "grammar.md",
        },
      ]),
      createDocument("notes/grammar.md", "# Grammar", []),
    ];

    const backlinks = buildBacklinksIndex(documents);

    expect(backlinks["notes/grammar.md"]).toEqual(["notes/daily.md"]);
    expect(backlinks["notes/daily.md"]).toEqual([]);
  });

  it("resolves Obsidian aliases and source-relative markdown paths", () => {
    const documents = [
      createDocument("notes/journal/daily.md", "[Grammar](../grammar.md)", [
        {
          alias: "Grammar",
          heading: null,
          target: "../grammar.md",
        },
      ]),
      {
        ...createDocument("notes/grammar.md", "# Grammar", []),
        frontmatter: {
          aliases: ["语法卡片"],
        },
      },
      createDocument("notes/review.md", "[[语法卡片#Tenses|Grammar]]", [
        {
          alias: "Grammar",
          heading: "Tenses",
          target: "语法卡片",
        },
      ]),
    ];

    const backlinks = buildBacklinksIndex(documents);

    expect(backlinks["notes/grammar.md"]).toEqual([
      "notes/journal/daily.md",
      "notes/review.md",
    ]);
  });
});

describe("createWikiLinkResolver", () => {
  const documents = [
    {
      ...createDocument("notes/grammar.md", "# Grammar", []),
      frontmatter: { aliases: ["语法卡片"] },
    },
    createDocument("notes/journal/daily.md", "# Daily", []),
  ];

  it("reports existing targets by basename, case-insensitively", () => {
    const resolve = createWikiLinkResolver(documents);

    expect(resolve("grammar")).toBe(true);
    expect(resolve("GRAMMAR")).toBe(true);
    expect(resolve("notes/grammar.md")).toBe(true);
  });

  it("resolves frontmatter aliases", () => {
    const resolve = createWikiLinkResolver(documents);

    expect(resolve("语法卡片")).toBe(true);
  });

  it("strips heading and alias from the token before resolving", () => {
    const resolve = createWikiLinkResolver(documents);

    expect(resolve("grammar#Tenses|语法")).toBe(true);
  });

  it("resolves source-relative targets", () => {
    const resolve = createWikiLinkResolver(documents);

    expect(resolve("../grammar", "notes/journal/daily.md")).toBe(true);
  });

  it("returns false for missing targets and empty tokens", () => {
    const resolve = createWikiLinkResolver(documents);

    expect(resolve("does-not-exist")).toBe(false);
    expect(resolve("")).toBe(false);
    expect(resolve("[[]]")).toBe(false);
  });
});
