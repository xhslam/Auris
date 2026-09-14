import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NotesRichEditorPane } from "@/components/notes-v2/notes-rich-editor-pane";
import type { NoteDocument } from "@/features/notes/documents/document-types";

function createDocument(rawSource: string): NoteDocument {
  return {
    basename: "math-note",
    fileName: "math-note.md",
    frontmatter: {},
    mtime: "2026-09-01T00:00:00.000Z",
    parsed: {
      backlinks: [],
      embeds: [],
      headings: [],
      links: [],
      tags: [],
      tasks: [],
      title: "Math note",
      wordCount: 3,
    },
    path: "notes/math-note.md",
    rawSource,
  };
}

describe("Notes math node views", () => {
  it("shows inline LaTeX source on click with a live KaTeX preview and saves edits", async () => {
    const onDocumentChange = vi.fn();
    const document = createDocument(String.raw`# Math note

卡在 \(\int_0^1 x\,dx\)。`);
    const { container } = render(
      <NotesRichEditorPane
        document={document}
        documents={[document]}
        onDocumentChange={onDocumentChange}
      />,
    );

    const formula = container.querySelector<HTMLElement>(
      ".notes-v2__math-inline",
    );
    expect(formula?.querySelector(".katex")).not.toBeNull();

    fireEvent.click(formula!);
    const source = screen.getByRole("textbox", { name: "LaTeX 源码" });
    expect(source).toHaveValue(String.raw`\int_0^1 x\,dx`);
    expect(
      formula?.querySelector(".notes-v2__math-live-preview .katex"),
    ).not.toBeNull();

    fireEvent.change(source, { target: { value: String.raw`\frac{1}{x}` } });
    fireEvent.blur(source);

    await waitFor(() => {
      expect(onDocumentChange).toHaveBeenLastCalledWith(
        expect.stringContaining(String.raw`$\frac{1}{x}$`),
      );
    });
    expect(
      container.querySelector(".notes-v2__math-inline .katex"),
    ).not.toBeNull();
  });

  it("opens a multiline source editor when a block formula is clicked", async () => {
    const document = createDocument(String.raw`# Math note

\[
\boxed{\text{方法识别}}
\]`);
    const { container } = render(
      <NotesRichEditorPane
        document={document}
        documents={[document]}
        onDocumentChange={vi.fn()}
      />,
    );

    const formula = container.querySelector<HTMLElement>(
      ".notes-v2__math-block",
    );
    expect(formula?.querySelector(".katex-display")).not.toBeNull();

    fireEvent.click(formula!);
    const source = screen.getByRole("textbox", { name: "LaTeX 源码" });
    expect(source.tagName).toBe("TEXTAREA");
    expect(source).toHaveValue(String.raw`\boxed{\text{方法识别}}`);
  });
});
