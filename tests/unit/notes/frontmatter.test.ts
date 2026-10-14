import { describe, expect, it } from "vitest";
import { createNoteDocument } from "@/features/notes/documents/document-repository";
import { parseFrontmatterDocument } from "@/features/notes/documents/frontmatter";

describe("frontmatter", () => {
  it("uses YAML 1.2 booleans and rejects duplicate keys", () => {
    const doc = parseFrontmatterDocument("---\nyesWord: yes\nonWord: on\nflag: true\n---\nBody");
    expect(doc.frontmatter).toEqual({ yesWord: "yes", onWord: "on", flag: true });
    expect(() => parseFrontmatterDocument("---\ntitle: one\ntitle: two\n---\nBody")).toThrow(/unique/i);
  });
  it("bounds hostile alias expansion without changing the source", () => {
    const source = "---\na: &a [one, two]\nb: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a, *a]\nc: &c [*b, *b, *b, *b, *b, *b, *b, *b, *b, *b]\nd: [*c, *c, *c, *c, *c, *c, *c, *c, *c, *c]\n---\nBody";
    expect(() => parseFrontmatterDocument(source)).toThrow(/alias/i);
  });

  it("preserves unknown frontmatter fields while separating the markdown body", () => {
    const parsed = parseFrontmatterDocument(
      [
        "---",
        "aliases:",
        "  - grammar",
        "custom:",
        "  keep: true",
        "---",
        "# Title",
        "",
        "Body",
      ].join("\n"),
    );

    expect(parsed.bodySource).toBe("# Title\n\nBody");
    expect(parsed.frontmatter.aliases).toEqual(["grammar"]);
    expect(parsed.frontmatter.custom).toEqual({ keep: true });
    expect(parsed.rawFrontmatter).toContain("custom:");
  });

  it("keeps frontmatter metadata out of the markdown body index", () => {
    const document = createNoteDocument({
      mtime: "2026-05-03T00:00:00.000Z",
      path: "notes/frontmatter.md",
      rawSource: [
        "---",
        "title: Metadata Title",
        "tags:",
        "  - metadata-only",
        "related: [[Hidden Target]]",
        "---",
        "# Body Title",
        "",
        "Practice [[Visible Target]] with #body-tag.",
      ].join("\n"),
    });

    expect(document.frontmatter.tags).toEqual(["metadata-only"]);
    expect(document.parsed.title).toBe("Metadata Title");
    expect(document.parsed.tags).toEqual(["body-tag", "metadata-only"]);
    expect(document.parsed.links).toEqual([
      {
        alias: null,
        heading: null,
        target: "Visible Target",
      },
    ]);
  });
});
