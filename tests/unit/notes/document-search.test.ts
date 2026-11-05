import { describe, expect, it } from "vitest";
import {
  collectDocumentTags,
  getSearchableDocument,
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

  it("reuses SearchableDocument cache across different queries for the same document instance", () => {
    const doc = buildDocument("notes/test.md", "# Test\n\nContent for testing");
    const searchable1 = getSearchableDocument(doc);
    const searchable2 = getSearchableDocument(doc);

    expect(searchable1).toBe(searchable2);
    expect(searchable1.titleLower).toBe("test");
    expect(searchable1.bodyLower).toContain("content for testing");

    // Multiple queries on the same document reuse the exact same cached derived representation
    const res1 = searchDocuments([doc], "test");
    const res2 = searchDocuments([doc], "content");
    expect(res1).toHaveLength(1);
    expect(res2).toHaveLength(1);

    // When a document changes (new instance), a new SearchableDocument is generated
    const docModified = buildDocument("notes/test.md", "# Test\n\nUpdated content");
    const searchableModified = getSearchableDocument(docModified);
    expect(searchableModified).not.toBe(searchable1);
    expect(searchableModified.bodyLower).toContain("updated content");
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
