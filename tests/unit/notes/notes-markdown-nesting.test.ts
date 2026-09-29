import { describe, expect, it } from "vitest";
import {
  NotesMarkdownRefusalError,
  parseNotesRichMarkdown,
} from "@/features/notes/editor/notes-rich-markdown";
import { parseNotesMarkdownAst } from "@/features/notes/markdown/notes-markdown-dialect";
import {
  assertNotesMarkdownNestingSafe,
  MAX_NOTES_MARKDOWN_CONTAINER_DEPTH,
  maxNotesMarkdownContainerDepth,
  NotesMarkdownNestingError,
} from "@/features/notes/markdown/notes-markdown-nesting";
import { renderMarkdown } from "@/features/notes/rendering/remark-renderer";

describe("Notes Markdown container nesting guard", () => {
  it("counts chained markers on one line and refuses them before parsing", () => {
    const source = `${"- ".repeat(MAX_NOTES_MARKDOWN_CONTAINER_DEPTH + 1)}<script>`;
    expect(maxNotesMarkdownContainerDepth(source)).toBe(MAX_NOTES_MARKDOWN_CONTAINER_DEPTH + 1);
    expect(() => assertNotesMarkdownNestingSafe(source)).toThrow(NotesMarkdownNestingError);
    expect(() => parseNotesMarkdownAst(source)).toThrow(NotesMarkdownNestingError);
    expect(() => parseNotesRichMarkdown(source, { throwOnRefusal: true })).toThrow(
      NotesMarkdownRefusalError,
    );
    const fallback = renderMarkdown(source);
    expect(fallback).toContain("notes-v2__reading-source-fallback");
    expect(fallback).toContain("&lt;script&gt;");
    expect(fallback).not.toContain("<script>");
  });

  it("counts mixed quotes and lists while leaving a thematic break as a leaf", () => {
    expect(maxNotesMarkdownContainerDepth("> > - - item")).toBe(4);
    expect(maxNotesMarkdownContainerDepth(`${"- ".repeat(2000)}`)).toBe(0);
  });

  it("does not count fenced code or inline examples as containers", () => {
    const code = `\`\`\`md\n${"- ".repeat(2000)}item\n\`\`\``;
    expect(maxNotesMarkdownContainerDepth(code)).toBe(0);
    const nestedCode = `> - \`\`\`md\n> ${"- ".repeat(2000)}item\n> \`\`\``;
    expect(maxNotesMarkdownContainerDepth(nestedCode)).toBe(0);
    expect(maxNotesMarkdownContainerDepth("Here is `- - - item` as text.")).toBe(0);
  });
});
