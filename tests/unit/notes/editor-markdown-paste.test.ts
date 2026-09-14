import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { tryPasteMarkdownUrl } from "@/features/notes/editor/editor-markdown-paste";

describe("Markdown URL paste", () => {
  it("wraps selected text as a Markdown link when pasting an HTTP URL", () => {
    const view = new EditorView({
      parent: document.createElement("div"),
      state: EditorState.create({
        doc: "Auris Note",
        selection: EditorSelection.range(0, 5),
      }),
    });

    expect(tryPasteMarkdownUrl(view, "https://example.com/docs")).toBe(true);
    expect(view.state.doc.toString()).toBe("[Auris](https://example.com/docs) Note");
    expect(view.state.selection.main.head).toBe(33);

    view.destroy();
  });

  it("leaves ordinary text and existing links alone", () => {
    const view = new EditorView({
      parent: document.createElement("div"),
      state: EditorState.create({
        doc: "[Auris](https://old.example)",
        selection: EditorSelection.range(0, 28),
      }),
    });

    expect(tryPasteMarkdownUrl(view, "not a URL")).toBe(false);
    expect(tryPasteMarkdownUrl(view, "https://example.com/docs")).toBe(false);
    expect(view.state.doc.toString()).toBe("[Auris](https://old.example)");

    view.destroy();
  });
});
