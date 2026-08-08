import { describe, expect, it } from "vitest";
import {
  createNoteDocument,
  extractFrontmatterTags,
  isProbablyTextContent,
  loadNoteDocument,
} from "@/features/notes/documents/document-repository";
import type { VaultClient } from "@/features/notes/vault/vault-types";

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

describe("unknown text fallback", () => {
  it("accepts source-like unknown files without routing them to Markdown", () => {
    expect(isProbablyTextContent("FROM node:22\nRUN npm ci\n")).toBe(true);
    expect(
      createNoteDocument({
        mtime: null,
        path: "Dockerfile",
        rawSource: "FROM node:22\n",
      }).formatId,
    ).toBe("unknown-text");
  });

  it("rejects binary-looking decoded content", () => {
    expect(isProbablyTextContent("\u0000\u0001PNG\r\n")).toBe(false);
    expect(isProbablyTextContent("\uFFFD".repeat(20))).toBe(false);
  });

  it("does not materialize an unknown binary file as an editable document", async () => {
    const client = { readFile: async () => "\u0000\u0001PNG\r\n" } as VaultClient;
    await expect(
      loadNoteDocument(client, { mtime: null, path: "asset.custom" }),
    ).resolves.toBeNull();
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
