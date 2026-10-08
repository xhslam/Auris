import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTES_TYPOGRAPHY,
  loadNotesTypography,
  notesTypographyCssVars,
  typographyFromUi,
  typographyUiSelects,
} from "@/features/notes/formatting/notes-typography";

describe("notes-typography mapping", () => {
  it("keeps explicitly stored typography choices when the presentation defaults change", () => {
    const stored = JSON.stringify({
      fontSize: "22px",
      lineHeight: "1.6",
      editorMaxWidth: "40em",
      fontLatin: '"Georgia"',
      fontCjk: '"Kaiti SC", KaiTi',
    });
    window.localStorage.setItem("auris.notes.typography", stored);
    try {
      expect(loadNotesTypography()).toMatchObject(JSON.parse(stored));
      expect(window.localStorage.getItem("auris.notes.typography")).toBe(stored);
    } finally {
      window.localStorage.removeItem("auris.notes.typography");
    }
  });

  it("round-trips default settings through UI selects", () => {
    const selects = typographyUiSelects(DEFAULT_NOTES_TYPOGRAPHY);
    expect(typographyFromUi(selects)).toEqual(DEFAULT_NOTES_TYPOGRAPHY);
  });

  it("default UI select indices match the documented defaults", () => {
    // 必须与 auris-settings INITIAL_SELECTS 对齐，否则默认会与显示不符。
    expect(typographyUiSelects(DEFAULT_NOTES_TYPOGRAPHY)).toEqual({
      fontSize: 0,
      lineHeightEd: 2,
      blockSpacing: 1,
      cjkLetterSpacing: 0,
      editorWidth: 1,
      latinFont: 0,
      cjkFont: 0,
      monoFont: 0,
    });
  });

  it("maps font select indices to concrete font stacks and drives --auris-font-mono", () => {
    const settings = typographyFromUi({
      latinFont: 1, // Athelas
      cjkFont: 1, // Kaiti SC
      monoFont: 1, // Menlo
    });
    expect(settings.fontLatin).toContain("Athelas");
    expect(settings.fontCjk).toContain("Kaiti SC");
    expect(settings.fontMono).toContain("Menlo");

    const vars = notesTypographyCssVars(settings);
    expect(vars["--notes-editor-font-latin"]).toContain("Athelas");
    expect(vars["--auris-font-mono"]).toBe(settings.fontMono);
  });

  it("treats font index 0 as the current system stack (no surprise default)", () => {
    const settings = typographyFromUi({ latinFont: 0, cjkFont: 0, monoFont: 0 });
    expect(settings.fontLatin).toBe(DEFAULT_NOTES_TYPOGRAPHY.fontLatin);
    expect(settings.fontCjk).toBe(DEFAULT_NOTES_TYPOGRAPHY.fontCjk);
    expect(settings.fontMono).toBe(DEFAULT_NOTES_TYPOGRAPHY.fontMono);
  });

  it("maps select indices to concrete CSS values", () => {
    const settings = typographyFromUi({
      fontSize: 3, // 24px
      lineHeightEd: 3, // 2.0
      blockSpacing: 0, // 0.5× -> 7px
      cjkLetterSpacing: 2, // 0.1em
      editorWidth: 1, // 50em
    });
    expect(settings).toMatchObject({
      fontSize: "24px",
      lineHeight: "2.0",
      blockSpacing: "7px",
      cjkLetterSpacing: "0.1em",
      editorMaxWidth: "50em",
    });
    // 未指定的字体选择回退到「系统默认」栈。
    expect(settings.fontLatin).toBe(DEFAULT_NOTES_TYPOGRAPHY.fontLatin);
  });

  it("emits the editor CSS variables", () => {
    expect(notesTypographyCssVars(DEFAULT_NOTES_TYPOGRAPHY)).toMatchObject({
      "--notes-editor-font-size": "18px",
      "--notes-editor-line-height": "1.8",
      "--notes-editor-block-spacing": "14px",
      "--notes-editor-cjk-letter-spacing": "normal",
      "--notes-editor-max-width": "50em",
      "--notes-editor-font-latin": DEFAULT_NOTES_TYPOGRAPHY.fontLatin,
      "--auris-font-mono": DEFAULT_NOTES_TYPOGRAPHY.fontMono,
    });
  });
});
