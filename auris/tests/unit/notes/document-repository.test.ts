import { describe, expect, it } from "vitest";
import {
  createNoteDocument,
  extractFrontmatterTags,
} from "@/features/notes/documents/document-repository";

describe("extractFrontmatterTags", () => {
  it("reads a YAML list of tags", () => {
    expect(extractFrontmatterTags({ tags: ["grammar", "shadowing"] })).toEqual([
      "grammar",
      "shadowing",
    ]);
  });

  it("splits a space/comma separated string and strips leading #", () => {
    expect(extractFrontmatterTags({ tags: "#grammar, shadowing review" })).toEqual([
      "grammar",
      "shadowing",
      "review",
    ]);
  });

  it("supports the singular tag key and numeric values", () => {
    expect(extractFrontmatterTags({ tag: 2026 })).toEqual(["2026"]);
  });

  it("returns nothing when tags are absent", () => {
    expect(extractFrontmatterTags({ title: "Daily" })).toEqual([]);
  });
});

describe("createNoteDocument tag merge", () => {
  it("merges frontmatter tags into parsed.tags without duplicating body tags", () => {
    const document = createNoteDocument({
      mtime: null,
      path: "notes/daily.md",
      rawSource: [
        "---",
        "tags: [grammar, Shadowing]",
        "---",
        "# Daily Review",
        "",
        "Practice #shadowing today.",
      ].join("\n"),
    });

    expect(document.parsed.tags).toEqual(["shadowing", "grammar"]);
  });
});
