import { describe, expect, it } from "vitest";
import { createNoteDocument } from "@/features/notes/documents/document-repository";
import { parseFrontmatterDocument } from "@/features/notes/documents/frontmatter";

describe("frontmatter", () => {
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
