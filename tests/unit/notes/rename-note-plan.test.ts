import { describe, expect, it } from "vitest";
import { buildRenameNotePlan } from "@/features/notes/documents/rename-note-plan";
import type { NoteDocument } from "@/features/notes/documents/document-types";

function createDocument(
  path: string,
  title: string,
  rawSource: string,
  frontmatter: Record<string, unknown> = {},
): NoteDocument {
  return {
    basename: path.split("/").at(-1)?.replace(/\.md$/i, "") ?? title,
    fileName: path.split("/").at(-1) ?? `${title}.md`,
    frontmatter,
    mtime: "2026-04-04T00:00:00.000Z",
    parsed: {
      backlinks: [],
      embeds: [],
      headings: rawSource
        .split("\n")
        .map((line, index) =>
          line.startsWith("# ")
            ? {
                depth: 1,
                line: index,
                slug: line.slice(2).toLowerCase().replace(/\s+/g, "-"),
                text: line.slice(2),
              }
            : null,
        )
        .filter(
          (heading): heading is NonNullable<typeof heading> => heading !== null,
        ),
      links: [],
      tags: [],
      tasks: [],
      title,
      wordCount: rawSource.split(/\s+/).filter(Boolean).length,
    },
    path,
    rawSource,
  };
}

describe("rename-note-plan", () => {
  it("renames the active note path, updates the leading heading, and rewrites wiki links", () => {
    const activeDocument = createDocument(
      "Inbox/study-note-3.md",
      "Study Note",
      "# Study Note\n\nLinked from [[Inbox/study-note-3]]",
    );
    const referencingDocument = createDocument(
      "Inbox/review.md",
      "Review",
      "# Review\n\nSee [[Inbox/study-note-3|today]].",
    );

    const plan = buildRenameNotePlan([activeDocument, referencingDocument], {
      nextTitle: "Official Findings",
      path: activeDocument.path,
    });

    expect(plan.nextPath).toBe("Inbox/official-findings.md");
    expect(plan.writes).toEqual([
      {
        path: "Inbox/official-findings.md",
        rawSource:
          "# Official Findings\n\nLinked from [[Inbox/official-findings]]",
      },
      {
        path: "Inbox/review.md",
        rawSource: "# Review\n\nSee [[Inbox/official-findings|today]].",
      },
    ]);
  });

  it("keeps the current path when the slug does not change", () => {
    const activeDocument = createDocument(
      "Inbox/study-note.md",
      "Study Note",
      "# Study Note",
    );

    const plan = buildRenameNotePlan([activeDocument], {
      nextTitle: "Study Note",
      path: activeDocument.path,
    });

    expect(plan.nextPath).toBe("Inbox/study-note.md");
    expect(plan.writes).toEqual([
      { path: "Inbox/study-note.md", rawSource: "# Study Note" },
    ]);
  });

  it("rewrites a frontmatter-backed title without forcing the title back into the body", () => {
    const activeDocument = createDocument(
      "Inbox/study-note.md",
      "Study Note",
      ['---', 'title: "Study Note"', '---', "", "Paragraph body"].join("\n"),
      { title: "Study Note" },
    );

    const plan = buildRenameNotePlan([activeDocument], {
      nextTitle: "Official Findings",
      path: activeDocument.path,
    });

    expect(plan.nextPath).toBe("Inbox/official-findings.md");
    expect(plan.writes).toEqual([
      {
        path: "Inbox/official-findings.md",
        rawSource: ["---", "title: Official Findings", "---", "", "Paragraph body"].join("\n"),
      },
    ]);
  });
});
