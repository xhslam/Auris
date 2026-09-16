import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  NOTES_RICH_PARSER_LIMITS,
  NotesMarkdownRefusalError,
  parseNotesRichMarkdown,
} from "@/features/notes/editor/notes-rich-markdown";
import { NotesEditorPane } from "@/components/notes-v2/notes-editor-pane";
import type { NoteDocument } from "@/features/notes/documents/document-types";

describe("unparseable document refusal and source mode degradation", () => {
  it("throws NotesMarkdownRefusalError when throwOnRefusal is true and input exceeds safe limits", () => {
    const base = "A".repeat(1000) + "\n";
    const oversized = base.repeat(501); // > 500,000 characters
    expect(oversized.length).toBeGreaterThan(NOTES_RICH_PARSER_LIMITS.maxCharacters);

    expect(() =>
      parseNotesRichMarkdown(oversized, { throwOnRefusal: true }),
    ).toThrow(NotesMarkdownRefusalError);
  });

  it("safely degrades to Source mode and displays protective refusal banner", () => {
    const base = "A".repeat(1000) + "\n";
    const oversized = base.repeat(501);

    const mockDoc: NoteDocument = {
      basename: "oversized.md",
      fileName: "oversized.md",
      frontmatter: {},
      mtime: new Date().toISOString(),
      parsed: {
        backlinks: [],
        embeds: [],
        headings: [],
        links: [],
        tags: [],
        tasks: [],
        title: "oversized",
        wordCount: 501000,
      },
      path: "oversized.md",
      rawSource: oversized,
    };

    const handleDocumentChange = vi.fn();
    const handleEditorModeChange = vi.fn();

    render(
      <NotesEditorPane
        document={mockDoc}
        documents={[mockDoc]}
        editorMode="wysiwyg"
        onDocumentChange={handleDocumentChange}
        onEditorModeChange={handleEditorModeChange}
      />,
    );

    // 1. Assert onEditorModeChange was called with "source"
    expect(handleEditorModeChange).toHaveBeenCalledWith("source");

    // 2. Assert refusal banner is rendered
    const banner = screen.getByTestId("notes-unparseable-refusal-banner");
    expect(banner).toBeDefined();
    expect(banner.textContent).toContain("已自动切换至源码模式以保护文件内容完整性");

    // 3. Assert NO document changes were emitted (all writes dropped!)
    expect(handleDocumentChange).not.toHaveBeenCalled();
  });
});
