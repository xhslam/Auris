import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTES_EDITOR_BEHAVIOR,
  editorBehaviorFromUi,
  editorBehaviorUiSelects,
  editorBehaviorUiToggles,
  editorIndentString,
  editorTabWidth,
} from "@/features/notes/formatting/notes-editor-behavior";

describe("notes-editor-behavior", () => {
  it("round-trips default settings through UI toggles/selects", () => {
    const toggles = editorBehaviorUiToggles(DEFAULT_NOTES_EDITOR_BEHAVIOR);
    const selects = editorBehaviorUiSelects(DEFAULT_NOTES_EDITOR_BEHAVIOR);
    expect(editorBehaviorFromUi(toggles, selects)).toEqual(
      DEFAULT_NOTES_EDITOR_BEHAVIOR,
    );
  });

  it("defaults match the editor's current behaviour (autoPair on, 2 spaces, no invisibles)", () => {
    expect(DEFAULT_NOTES_EDITOR_BEHAVIOR).toEqual({
      autoPair: true,
      tabSize: "2",
      showInvisibles: false,
    });
    expect(editorBehaviorUiToggles(DEFAULT_NOTES_EDITOR_BEHAVIOR)).toEqual({
      autoPair: true,
      showInvisibles: false,
    });
    expect(editorBehaviorUiSelects(DEFAULT_NOTES_EDITOR_BEHAVIOR)).toEqual({
      tabSize: 0,
    });
  });

  it("reads the showInvisibles toggle", () => {
    expect(
      editorBehaviorFromUi({ autoPair: true, showInvisibles: true }, { tabSize: 0 })
        .showInvisibles,
    ).toBe(true);
    expect(
      editorBehaviorFromUi({ autoPair: true, showInvisibles: false }, { tabSize: 0 })
        .showInvisibles,
    ).toBe(false);
  });

  it("maps the tab-size select index to concrete settings", () => {
    expect(editorBehaviorFromUi({ autoPair: true }, { tabSize: 0 }).tabSize).toBe("2");
    expect(editorBehaviorFromUi({ autoPair: true }, { tabSize: 1 }).tabSize).toBe("4");
    expect(editorBehaviorFromUi({ autoPair: true }, { tabSize: 2 }).tabSize).toBe("tab");
  });

  it("reads the autoPair toggle", () => {
    expect(editorBehaviorFromUi({ autoPair: false }, { tabSize: 0 }).autoPair).toBe(false);
  });

  it("translates tab size to indent string and display width", () => {
    expect(editorIndentString("2")).toBe("  ");
    expect(editorIndentString("4")).toBe("    ");
    expect(editorIndentString("tab")).toBe("\t");
    expect(editorTabWidth("2")).toBe(2);
    expect(editorTabWidth("4")).toBe(4);
    expect(editorTabWidth("tab")).toBe(4);
  });
});
