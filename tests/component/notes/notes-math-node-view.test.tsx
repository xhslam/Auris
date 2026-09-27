import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TextSelection } from "prosemirror-state";
import { Fragment, Slice } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import { NotesRichEditorPane } from "@/components/notes-v2/notes-rich-editor-pane";
import { notesRichEditorSchema } from "@/features/notes/editor/notes-rich-markdown";
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
  it("parses NotebookLM math when pasted directly into the rich editor", () => {
    const document = createDocument("# Math note\n\nExisting text.");
    const { container } = render(
      <NotesRichEditorPane
        document={document}
        documents={[document]}
        onDocumentChange={vi.fn()}
      />,
    );
    const host = container.querySelector(
      '[data-testid="notes-prosemirror-host"]',
    ) as (HTMLDivElement & { __notesRichEditorView?: EditorView }) | null;
    const view = host?.__notesRichEditorView;

    expect(view).toBeDefined();
    act(() => {
      view!.dispatch(
        view!.state.tr.setSelection(
          TextSelection.create(view!.state.doc, view!.state.doc.content.size - 1),
        ),
      );
      const pastedText =
        "Copied \\\\(G_0(s) = \\frac{K}{s(0.2s + 1)}\\\\)";
      const paragraph = notesRichEditorSchema.nodes.paragraph.create(
        null,
        notesRichEditorSchema.text(pastedText),
      );
      const slice = new Slice(Fragment.from(paragraph), 1, 1);
      const mathPastePlugin = view!.state.plugins.find(
        (plugin) => plugin.spec.props?.transformPasted,
      );
      const transformPasted = mathPastePlugin?.spec.props?.transformPasted;
      expect(transformPasted).toBeDefined();
      const transformed = transformPasted!.call(mathPastePlugin!, slice, view!, true);
      view!.dispatch(view!.state.tr.replaceSelection(transformed));

      const codeBlock = notesRichEditorSchema.nodes.code_block.create(
        { params: "" },
        notesRichEditorSchema.text("\\\\(x^2\\\\)"),
      );
      const codeSlice = new Slice(Fragment.from(codeBlock), 0, 0);
      expect(
        transformPasted!.call(mathPastePlugin!, codeSlice, view!, true),
      ).toBe(codeSlice);
    });

    expect(container.querySelectorAll(".notes-v2__math-inline")).toHaveLength(1);
    expect(
      container.querySelector(".notes-v2__math-inline .katex"),
    ).not.toBeNull();
  });

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
