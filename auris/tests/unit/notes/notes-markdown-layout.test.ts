import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTES_MARKDOWN_LAYOUT,
  markdownLayoutFromUi,
  markdownLayoutUiSelects,
  notesMarkdownLayoutCssVars,
} from "@/features/notes/formatting/notes-markdown-layout";

describe("notes-markdown-layout mapping", () => {
  it("round-trips default settings through UI selects", () => {
    const selects = markdownLayoutUiSelects(DEFAULT_NOTES_MARKDOWN_LAYOUT);
    expect(markdownLayoutFromUi(selects)).toEqual(DEFAULT_NOTES_MARKDOWN_LAYOUT);
  });

  it("default select indices match the documented defaults (current look)", () => {
    // 须与 auris-settings INITIAL_SELECTS 对齐：100% / 左对齐 / 无边框。
    expect(markdownLayoutUiSelects(DEFAULT_NOTES_MARKDOWN_LAYOUT)).toEqual({
      blockFontSize: 1,
      headingAlign: 0,
      imageBorder: 0,
    });
  });

  it("maps select indices to concrete CSS values", () => {
    const settings = markdownLayoutFromUi({
      blockFontSize: 2, // 110%
      headingAlign: 1, // center
      imageBorder: 2, // thick
    });
    expect(settings.blockFontSize).toBe("1.1");
    expect(settings.headingAlign).toBe("center");
    expect(settings.mediaBorder).toContain("2px");
  });

  it("emits the markdown layout CSS variables", () => {
    expect(notesMarkdownLayoutCssVars(DEFAULT_NOTES_MARKDOWN_LAYOUT)).toEqual({
      "--notes-md-block-font-size": "1",
      "--notes-md-heading-align": "left",
      "--notes-md-media-border": "none",
    });
  });
});
