import { describe, expect, it } from "vitest";
import {
  collectDocumentTags,
  parseSearchQuery,
  searchDocuments,
} from "@/features/notes/documents/document-search";
import { createNoteDocument } from "@/features/notes/documents/document-repository";

function buildDocument(path: string, rawSource: string) {
  return createNoteDocument({ mtime: null, path, rawSource });
}

const DOCUMENTS = [
  buildDocument(
    "notes/daily.md",
    ["# Daily Review", "", "Practice #shadowing today."].join("\n"),
  ),
  buildDocument(
    "notes/grammar.md",
    [
      "---",
      "tags: [grammar, shadowing]",
      "---",
      "# Grammar Drill",
      "",
      "Focus on tense.",
    ].join("\n"),
  ),
  buildDocument(
    "notes/listening.md",
    ["# Listening Log", "", "Shadow the podcast about grammar."].join("\n"),
  ),
];

describe("parseSearchQuery", () => {
  it("separates tag filters from free text", () => {
    expect(parseSearchQuery("tag:shadowing daily")).toEqual({
      tagFilters: ["shadowing"],
      textTerms: ["daily"],
    });
  });

  it("treats #tag tokens as exact tag filters", () => {
    expect(parseSearchQuery("#Grammar review")).toEqual({
      tagFilters: ["grammar"],
      textTerms: ["review"],
    });
  });
});

describe("searchDocuments", () => {
  it("returns every document when the query is empty", () => {
    expect(searchDocuments(DOCUMENTS, "   ")).toHaveLength(DOCUMENTS.length);
  });

  it("filters by exact tag, ignoring substring tag matches", () => {
    const results = searchDocuments(DOCUMENTS, "tag:grammar");

    expect(results.map((document) => document.path)).toEqual([
      "notes/grammar.md",
    ]);
  });

  it("requires all free-text terms to match", () => {
    const results = searchDocuments(DOCUMENTS, "podcast grammar");

    expect(results.map((document) => document.path)).toEqual([
      "notes/listening.md",
    ]);
  });

  it("ranks title matches above body-only matches", () => {
    const results = searchDocuments(DOCUMENTS, "grammar");

    expect(results[0]?.path).toBe("notes/grammar.md");
    expect(results.map((document) => document.path)).toContain(
      "notes/listening.md",
    );
  });

  it("combines tag filters with free text", () => {
    const results = searchDocuments(DOCUMENTS, "#shadowing tense");

    expect(results.map((document) => document.path)).toEqual([
      "notes/grammar.md",
    ]);
  });
});

describe("collectDocumentTags", () => {
  it("returns unique tags with counts sorted alphabetically", () => {
    expect(collectDocumentTags(DOCUMENTS)).toEqual([
      { count: 1, tag: "grammar" },
      { count: 2, tag: "shadowing" },
    ]);
  });
});
