import { describe, expect, it } from "vitest";
import { buildLearningDependencySnapshot } from "@/features/learning-memory/learning-dependency-review";
import {
  LEARNING_DEPENDENCY_SNAPSHOT_KEY,
  resolveLearningDependencyReviewForPage,
  syncLearningDependencyReviews,
} from "@/features/learning-memory/learning-dependency-sync";
import type { NotePage } from "@/features/notes/note-types";

function page(input: Partial<NotePage> & Pick<NotePage, "id" | "markdownBody" | "relativePath">): NotePage {
  return {
    blocks: [],
    fileName: `${input.id}.md`,
    frontmatter: {},
    icon: "N",
    title: input.id,
    updatedAt: "2026-08-20T10:00:00.000Z",
    ...input,
  };
}

describe("learning dependency sync", () => {
  it("marks a generated learning note for review after its source note changes", () => {
    const snapshot = buildLearningDependencySnapshot({
      capturedAt: "2026-08-20T10:00:00.000Z",
      materialText: "Original material.",
      sourceNote: { content: "# Source\n\nOriginal explanation.", path: "Sources/source.md" },
    });
    const source = page({
      id: "source",
      markdownBody: "# Source\n\nChanged explanation.",
      relativePath: "Sources/source.md",
    });
    const dependent = page({
      frontmatter: { [LEARNING_DEPENDENCY_SNAPSHOT_KEY]: snapshot },
      id: "learning-note",
      markdownBody: [
        "## Dependency Review",
        "",
        "<!-- auris:dependency-review:start -->",
        "- Status: current",
        "<!-- auris:dependency-review:end -->",
      ].join("\n"),
      relativePath: "Learning/note.md",
    });

    const updates = syncLearningDependencyReviews([source, dependent]);

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ id: "learning-note" });
    expect(updates[0]?.frontmatter?.[LEARNING_DEPENDENCY_SNAPSHOT_KEY]).toMatchObject({
      resolution: null,
      status: "needs-review",
    });
    expect(updates[0]?.markdownBody).toContain("- Status: needs-review");
    expect(updates[0]?.markdownBody).toContain("- source-note: [[Sources/source.md]] (changed)");
  });

  it("rebases a reviewed note to the current source and records the human decision", () => {
    const snapshot = buildLearningDependencySnapshot({
      capturedAt: "2026-08-20T10:00:00.000Z",
      materialText: "Original material.",
      sourceNote: { content: "# Source\n\nOriginal explanation.", path: "Sources/source.md" },
    });
    const source = page({
      id: "source",
      markdownBody: "# Source\n\nReviewed explanation.",
      relativePath: "Sources/source.md",
    });
    const dependent = page({
      frontmatter: { [LEARNING_DEPENDENCY_SNAPSHOT_KEY]: snapshot },
      id: "learning-note",
      markdownBody: "## Dependency Review\n\n<!-- auris:dependency-review:start -->\n- Status: needs-review\n<!-- auris:dependency-review:end -->",
      relativePath: "Learning/note.md",
    });

    const updated = resolveLearningDependencyReviewForPage(dependent, [source, dependent], {
      at: "2026-08-21T08:00:00.000Z",
      decision: "reviewed",
    });

    expect(updated?.frontmatter?.[LEARNING_DEPENDENCY_SNAPSHOT_KEY]).toMatchObject({
      status: "reviewed",
    });
    expect(updated?.markdownBody).toContain("- Status: reviewed");
    expect(updated?.markdownBody).toContain("- Resolution: reviewed");
  });

  it("does not rewrite a note when its pinned dependencies are unchanged", () => {
    const snapshot = buildLearningDependencySnapshot({
      capturedAt: "2026-08-20T10:00:00.000Z",
      materialText: "Original material.",
      sourceNote: { content: "# Source\n\nOriginal explanation.", path: "Sources/source.md" },
    });
    const source = page({
      id: "source",
      markdownBody: "# Source\n\nOriginal explanation.",
      relativePath: "Sources/source.md",
    });
    const dependent = page({
      frontmatter: { [LEARNING_DEPENDENCY_SNAPSHOT_KEY]: snapshot },
      id: "learning-note",
      markdownBody: "## Dependency Review\n\n- Status: current",
      relativePath: "Learning/note.md",
    });

    expect(syncLearningDependencyReviews([source, dependent])).toEqual([]);
  });
});
