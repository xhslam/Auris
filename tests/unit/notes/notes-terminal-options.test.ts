import { describe, expect, it, vi } from "vitest";
import { DEFAULT_NOTES_TYPOGRAPHY } from "@/features/notes/formatting/notes-typography";
import { clampTerminalFontSize, createNotesTerminalKeyHandler, preferredTerminalFontStack, terminalTabGlyph } from "@/components/notes-v2/terminal/notes-terminal-options";

describe("VMark terminal presentation and key policy", () => {
  it("uses the system monospace tail for the shipping default, preserving custom fonts", () => {
    expect(preferredTerminalFontStack(DEFAULT_NOTES_TYPOGRAPHY.fontMono, "windows")).toBe("ui-monospace, monospace");
    expect(preferredTerminalFontStack("", "linux")).toBe("monospace");
    expect(preferredTerminalFontStack("Consolas, monospace", "windows")).toBe("Consolas, monospace");
  });
  it("clamps terminal-only zoom and handles corrupt persisted values", () => {
    expect(clampTerminalFontSize(NaN)).toBe(13);
    expect(clampTerminalFontSize(100)).toBe(32);
    expect(clampTerminalFontSize(1)).toBe(8);
  });
  it("shows the program title's first grapheme rather than duplicated ordinal text", () => {
    expect(terminalTabGlyph("Terminal 2")).toBe("2");
    expect(terminalTabGlyph("Terminal 2", "cmd")).toBe("C");
    expect(terminalTabGlyph("Terminal 2", "👨‍👩‍👧‍👦 Shell")).toBe("👨‍👩‍👧‍👦");
  });
  it("preserves shell SIGINT/readline and never intercepts IME or Alt chords", () => {
    const actions = { copy: vi.fn(), paste: vi.fn(), clear: vi.fn(), selectAll: vi.fn(), search: vi.fn(), zoom: vi.fn(), selectSession: vi.fn(), hasSelection: () => false };
    const windows = createNotesTerminalKeyHandler(actions, "windows");
    expect(windows(new KeyboardEvent("keydown", { key: "c", ctrlKey: true }))).toBe(true);
    expect(windows(new KeyboardEvent("keydown", { key: "f", ctrlKey: true, isComposing: true }))).toBe(true);
    expect(windows(new KeyboardEvent("keydown", { key: "+", ctrlKey: true, altKey: true }))).toBe(true);
    expect(createNotesTerminalKeyHandler(actions, "linux")(new KeyboardEvent("keydown", { key: "f", ctrlKey: true }))).toBe(true);
    expect(createNotesTerminalKeyHandler(actions, "macos")(new KeyboardEvent("keydown", { key: "a", ctrlKey: true }))).toBe(true);
    expect(actions.search).not.toHaveBeenCalled();
  });
});
