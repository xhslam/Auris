import { describe, expect, it } from "vitest";
import { parseMarkdownNote, serializeMarkdownNote } from "@/features/notes/markdown-codec";
import type { NotePage } from "@/features/notes/note-types";

function createPage(): NotePage {
  return {
    blocks: [],
    fileName: "shadowing-notes.md",
    icon: "N",
    id: "note-1",
    markdownBody: [
      "## Focus Points",
      "",
      "Today we focus on pauses, linking, and intonation.",
      "",
      "- [x] Repeat sentence one three times",
      "- Notice the stress in vocabulary",
      "> Practice makes perfect.",
      "---",
    ].join("\n"),
    relativePath: "folder/shadowing-notes.md",
    title: "English Shadowing Notes",
    updatedAt: "2026-03-19T10:00:00.000Z",
  };
}

describe("markdown note codec", () => {
  it("serializes a note page into markdown with metadata and markdown body", () => {
    const markdown = serializeMarkdownNote(createPage());

    expect(markdown).toContain('title: "English Shadowing Notes"');
    expect(markdown).toContain('id: "note-1"');
    expect(markdown).toContain("# English Shadowing Notes");
    expect(markdown).toContain("## Focus Points");
    expect(markdown).toContain("- [x] Repeat sentence one three times");
    expect(markdown).toContain("- Notice the stress in vocabulary");
    expect(markdown).toContain("> Practice makes perfect.");
    expect(markdown).toContain("\n---\n");
  });

  it("parses markdown back into note blocks while keeping metadata", () => {
    const markdown = serializeMarkdownNote(createPage());

    const parsed = parseMarkdownNote({
      fileName: "shadowing-notes.md",
      markdown,
      relativePath: "folder/shadowing-notes.md",
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.title).toBe("English Shadowing Notes");
    expect(parsed?.id).toBe("note-1");
    expect(parsed?.icon).toBe("N");
    expect(parsed?.relativePath).toBe("folder/shadowing-notes.md");
    expect(parsed?.markdownBody).toContain("## Focus Points");
    expect(parsed?.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "heading", text: "Focus Points" }),
        expect.objectContaining({
          type: "paragraph",
          text: "Today we focus on pauses, linking, and intonation.",
        }),
        expect.objectContaining({
          checked: true,
          text: "Repeat sentence one three times",
          type: "todo",
        }),
        expect.objectContaining({ type: "bullet", text: "Notice the stress in vocabulary" }),
        expect.objectContaining({ type: "quote", text: "Practice makes perfect." }),
        expect.objectContaining({ type: "divider" }),
      ]),
    );
  });

  it("derives a stable note id from file name when frontmatter id is missing", () => {
    const parsed = parseMarkdownNote({
      fileName: "2026-03-07 chat-log.md",
      markdown: "# Chat Log\n\nThis note does not have frontmatter.",
      relativePath: "archive/2026-03-07 chat-log.md",
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.id).toBe("note-2026-03-07-chat-log");
    expect(parsed?.title).toBe("Chat Log");
    expect(parsed?.relativePath).toBe("archive/2026-03-07 chat-log.md");
  });

  it("uses the Vault file modification time for Markdown without Auris metadata", () => {
    const parsed = parseMarkdownNote({
      fileName: "linear-equations.md",
      markdown: "# 线性方程组\n\n齐次方程组",
      relativePath: "math/linear-equations.md",
      updatedAt: "2026-08-23T03:40:26.000Z",
    });

    expect(parsed?.title).toBe("线性方程组");
    expect(parsed?.updatedAt).toBe("2026-08-23T03:40:26.000Z");
  });

  it("preserves additional frontmatter fields for generated learning notes", () => {
    const markdown = serializeMarkdownNote({
      ...createPage(),
      frontmatter: {
        sourceSessionId: "session-1",
        tags: ["english", "shadowing", "learning-session"],
        type: "learning-session",
      },
    });

    expect(markdown).toContain("type: learning-session");
    expect(markdown).toContain('sourceSessionId: "session-1"');
    expect(markdown).toContain("tags:");
    expect(markdown).toContain("- learning-session");

    const parsed = parseMarkdownNote({
      fileName: "shadowing-notes.md",
      markdown,
    });

    expect(parsed?.frontmatter?.type).toBe("learning-session");
    expect(parsed?.frontmatter?.sourceSessionId).toBe("session-1");
  });
});
