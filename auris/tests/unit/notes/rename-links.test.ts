import { describe, expect, it } from "vitest";
import { renameWikiLinks } from "@/features/notes/documents/rename-links";

describe("rename-links", () => {
  it("rewrites wiki links that point at the renamed note", () => {
    const nextSource = renameWikiLinks(
      ["# Daily", "", "Review [[Daily Note]] and [[notes/Daily Note#Section|alias]]."].join("\n"),
      {
        fromPath: "Daily Note.md",
        toPath: "Archive/Daily Note v2.md",
      },
    );

    expect(nextSource).toContain("[[Archive/Daily Note v2]]");
    expect(nextSource).toContain("[[Archive/Daily Note v2#Section|alias]]");
  });

  it("leaves unrelated wiki links untouched", () => {
    const source = "Practice [[Grammar]] after [[Shadowing]].";

    expect(
      renameWikiLinks(source, {
        fromPath: "Daily Note.md",
        toPath: "Archive/Daily Note v2.md",
      }),
    ).toBe(source);
  });
});
