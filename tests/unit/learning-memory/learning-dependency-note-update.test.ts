import { describe, expect, it } from "vitest";
import { buildLearningDependencySnapshot } from "@/features/learning-memory/learning-dependency-review";
import { LEARNING_DEPENDENCY_SNAPSHOT_KEY } from "@/features/learning-memory/learning-dependency-sync";
import { applyLearningDependencyReviewToDocument } from "@/features/learning-memory/learning-dependency-note-update";
import type { NoteDocument } from "@/features/notes/documents/document-types";

function document(input: Partial<NoteDocument> & Pick<NoteDocument, "path" | "rawSource">): NoteDocument {
  return {
    basename: input.path.split("/").at(-1)?.replace(/\.md$/u, "") ?? "note",
    fileName: input.path.split("/").at(-1) ?? "note.md",
    frontmatter: {},
    mtime: "2026-08-20T10:00:00.000Z",
    parsed: {
      backlinks: [],
      embeds: [],
      headings: [],
      links: [],
      tags: [],
      tasks: [],
      title: "Note",
      wordCount: 1,
    },
    ...input,
  };
}

describe("learning dependency note update", () => {
  it("writes a reviewed decision and rebased source fingerprint into raw markdown", () => {
    const snapshot = buildLearningDependencySnapshot({
      capturedAt: "2026-08-20T10:00:00.000Z",
      materialText: "Original material.",
      sourceNote: { content: "# Source\n\nOriginal explanation.", path: "Sources/source.md" },
    });
    const source = document({
      path: "Sources/source.md",
      rawSource: "# Source\n\nReviewed explanation.",
    });
    const learning = document({
      frontmatter: { [LEARNING_DEPENDENCY_SNAPSHOT_KEY]: snapshot },
      path: "Learning/note.md",
      rawSource: [
        "---",
        "type: learning-session",
        "aurisDependencySnapshot:",
        "  status: needs-review",
        "---",
        "# Learning",
        "",
        "## Dependency Review",
        "",
        "<!-- auris:dependency-review:start -->",
        "- Status: needs-review",
        "<!-- auris:dependency-review:end -->",
      ].join("\n"),
    });

    const nextRawSource = applyLearningDependencyReviewToDocument(learning, [source, learning], {
      at: "2026-08-21T08:00:00.000Z",
      decision: "reviewed",
    });

    expect(nextRawSource).toContain("status: reviewed");
    expect(nextRawSource).toContain("- Status: reviewed");
    expect(nextRawSource).toContain("- Resolution: reviewed");
    expect(nextRawSource).toContain("# Learning");
  });
});
