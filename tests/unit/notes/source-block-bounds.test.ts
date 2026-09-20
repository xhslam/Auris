import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import {
  getCodeFenceBounds,
  getMarkdownBlockBounds,
  selectOccurrencesInBlock,
} from "@/features/notes/editor/source-block-bounds";
import { EditorView } from "@codemirror/view";

describe("Markdown source block bounds", () => {
  it("returns null for an empty document", () => {
    const state = EditorState.create({ doc: "" });
    expect(getMarkdownBlockBounds(state, 0)).toBeNull();
  });

  it("returns null when the cursor rests on a blank line", () => {
    const text = "First paragraph.\n\nSecond paragraph.";
    const state = EditorState.create({ doc: text });
    // Index 17 is the newline / blank line between paragraphs
    expect(getMarkdownBlockBounds(state, 17)).toBeNull();
  });

  it("bounds to contiguous non-blank lines in prose", () => {
    const text = "Line 1.\nLine 2.\n\nNext paragraph line.";
    const state = EditorState.create({ doc: text });
    // Inside first paragraph
    const bounds = getMarkdownBlockBounds(state, 4);
    expect(bounds).toEqual({
      from: 0,
      to: 15, // "Line 1.\nLine 2."
    });
  });

  it("bounds to code fence including blank lines within it", () => {
    const text = "Prefix\n\n```ts\nconst a = 1;\n\nconst b = 2;\n```\n\nSuffix";
    const state = EditorState.create({ doc: text });
    // Inside code fence
    const fenceIndex = text.indexOf("const a");
    const bounds = getMarkdownBlockBounds(state, fenceIndex);
    expect(bounds).not.toBeNull();
    expect(getCodeFenceBounds(state, fenceIndex)).toEqual(bounds);
    expect(bounds?.from).toBe(text.indexOf("```ts"));
    expect(bounds?.to).toBe(text.indexOf("```\n\nSuffix") + 3);
  });
});

describe("selectOccurrencesInBlock", () => {
  it("selects all occurrences within the current block, ignoring other blocks", () => {
    const text = "hello world hello\n\nhello in another paragraph";
    const docHolder = document.createElement("div");
    document.body.appendChild(docHolder);

    const view = new EditorView({
      doc: text,
      extensions: [EditorState.allowMultipleSelections.of(true)],
      parent: docHolder,
    });

    // Place cursor at "hello" in first block (offset 0)
    view.dispatch({ selection: { anchor: 0, head: 5 } });

    const success = selectOccurrencesInBlock(view);
    expect(success).toBe(true);

    // Should match the two "hello"s in the first paragraph, NOT the one in paragraph 2
    expect(view.state.selection.ranges).toHaveLength(2);
    expect(view.state.selection.ranges[0]).toEqual(
      expect.objectContaining({ from: 0, to: 5 }),
    );
    expect(view.state.selection.ranges[1]).toEqual(
      expect.objectContaining({ from: 12, to: 17 }),
    );

    view.destroy();
    document.body.removeChild(docHolder);
  });

  it("declines when cursor is on a blank line", () => {
    const text = "first\n\nsecond";
    const docHolder = document.createElement("div");
    document.body.appendChild(docHolder);

    const view = new EditorView({
      doc: text,
      parent: docHolder,
    });

    // Blank line between
    view.dispatch({ selection: { anchor: 6 } });
    expect(selectOccurrencesInBlock(view)).toBe(false);

    view.destroy();
    document.body.removeChild(docHolder);
  });
});
