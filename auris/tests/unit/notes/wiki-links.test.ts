import { describe, expect, it } from "vitest";
import {
  extractMarkdownNoteLinks,
  extractWikiLinks,
} from "@/features/notes/documents/wiki-links";

describe("wiki-links", () => {
  it("extracts plain, heading, and aliased wiki links from markdown source", () => {
    const links = extractWikiLinks(
      [
        "See [[Daily Note]] and [[Grammar#Tenses]]",
        "Review [[Vocabulary|Word Bank]] later.",
      ].join("\n"),
    );

    expect(links).toEqual([
      {
        alias: null,
        heading: null,
        target: "Daily Note",
      },
      {
        alias: null,
        heading: "Tenses",
        target: "Grammar",
      },
      {
        alias: "Word Bank",
        heading: null,
        target: "Vocabulary",
      },
    ]);
  });
});

describe("markdown note links", () => {
  it("extracts markdown links that point at other notes and ignores the rest", () => {
    const links = extractMarkdownNoteLinks(
      [
        "See [Grammar](grammar.md) and [Tenses](notes/grammar.md#tenses).",
        "A [spaced one](<my%20notes/daily.md>) with a [titled](vocab.md \"Vocab\") link.",
        "Skip ![cover](cover.png), [external](https://example.com/page.md),",
        "an [anchor](#section) and a [pdf](handbook.pdf).",
      ].join("\n"),
    );

    expect(links).toEqual([
      { alias: "Grammar", heading: null, target: "grammar.md" },
      { alias: "Tenses", heading: "tenses", target: "notes/grammar.md" },
      { alias: "spaced one", heading: null, target: "my notes/daily.md" },
      { alias: "titled", heading: null, target: "vocab.md" },
    ]);
  });

  it("does not match wiki links", () => {
    expect(extractMarkdownNoteLinks("[[grammar]] and [[daily|Daily]]")).toEqual(
      [],
    );
  });
});
