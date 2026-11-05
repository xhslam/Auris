import { describe, expect, it } from "vitest";
import {
  buildBacklinksIndex,
  buildTargetLookup,
  buildWikiLinkTargetIndex,
  createWikiLinkResolver,
  updateBacklinksIndex,
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

  it("buildWikiLinkTargetIndex keeps version stable across body edits and bumps version on topology changes", () => {
    const docA = createDocument("notes/a.md", "# A", []);
    const docB = createDocument("notes/b.md", "# B", []);

    const index1 = buildWikiLinkTargetIndex([docA, docB]);
    expect(typeof index1.version).toBe("string");
    expect(index1.wikiLinkExists("b")).toBe(true);
    expect(index1.wikiLinkExists("c")).toBe(false);

    // Body edit on docA: target collection (paths, basenames, titles, aliases) does not change
    const docAEdited = createDocument("notes/a.md", "# A\n\nSome body text without title change", []);
    const index2 = buildWikiLinkTargetIndex([docAEdited, docB], index1);
    // Version and reference must be identical!
    expect(index2).toBe(index1);
    expect(index2.version).toBe(index1.version);

    // Adding a new note: topology changed!
    const docC = createDocument("notes/c.md", "# C", []);
    const index3 = buildWikiLinkTargetIndex([docAEdited, docB, docC], index2);
    expect(index3).not.toBe(index2);
    expect(index3.version).not.toBe(index2.version);
    expect(index3.wikiLinkExists("c")).toBe(true);
  });

  it("updateBacklinksIndex updates only affected targets and preserves unaffected targets reference identities", () => {
    const docA = createDocument("notes/a.md", "# A", [{ alias: null, heading: null, target: "b" }]);
    const docB = createDocument("notes/b.md", "# B", []);
    const docC = createDocument("notes/c.md", "# C", []);

    const initialBacklinks = buildBacklinksIndex([docA, docB, docC]);
    expect(initialBacklinks["notes/b.md"]).toEqual(["notes/a.md"]);
    expect(initialBacklinks["notes/c.md"]).toEqual([]);

    const prevByPath = new Map([
      ["notes/a.md", docA],
      ["notes/b.md", docB],
      ["notes/c.md", docC],
    ]);
    const lookup = buildTargetLookup([docA, docB, docC]);

    // docA changes link from b to c
    const docAModified = createDocument("notes/a.md", "# A", [{ alias: null, heading: null, target: "c" }]);

    const nextBacklinks = updateBacklinksIndex(initialBacklinks, {
      allDocuments: [docAModified, docB, docC],
      changedDocuments: [docAModified],
      previousDocumentsByPath: prevByPath,
      targetLookup: lookup,
      targetTopologyChanged: false,
    });

    expect(nextBacklinks["notes/b.md"]).toEqual([]);
    expect(nextBacklinks["notes/c.md"]).toEqual(["notes/a.md"]);
    // Unaffected target notes/a.md array reference must be preserved!
    expect(nextBacklinks["notes/a.md"]).toBe(initialBacklinks["notes/a.md"]);
  });
});
