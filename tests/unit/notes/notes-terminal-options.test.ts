import { describe, expect, it, vi, beforeEach } from "vitest";
import { DEFAULT_NOTES_TYPOGRAPHY } from "@/features/notes/formatting/notes-typography";
import {
  clampTerminalFontSize,
  clampTerminalLineHeight,
  createNotesTerminalKeyHandler,
  DEFAULT_TERMINAL_LINE_HEIGHT,
  DEFAULT_TERMINAL_WEBGL,
  loadTerminalLineHeight,
  loadTerminalWebglEnabled,
  preferredTerminalFontStack,
  saveTerminalLineHeight,
  saveTerminalWebglEnabled,
  terminalLineHeightFromIndex,
  terminalLineHeightIndex,
  terminalTabGlyph,
  TERMINAL_LINE_HEIGHT_STORAGE,
  TERMINAL_WEBGL_STORAGE,
} from "@/components/notes-v2/terminal/notes-terminal-options";
import { verifiedMonoStack } from "@/components/notes-v2/terminal/verified-terminal-mono-stack";

describe("VMark terminal presentation and key policy", () => {
  beforeEach(() => {
    try {
      window.localStorage.removeItem(TERMINAL_LINE_HEIGHT_STORAGE);
      window.localStorage.removeItem(TERMINAL_WEBGL_STORAGE);
    } catch {}
  });

  it("consumes Linux UI copy without selection and only handles exact Insert chords", () => {
    const actions = { copy: vi.fn(), paste: vi.fn(), clear: vi.fn(), selectAll: vi.fn(), search: vi.fn(), zoom: vi.fn(), selectSession: vi.fn(), hasSelection: () => false };
    const handler = createNotesTerminalKeyHandler(actions, "linux");
    expect(handler(new KeyboardEvent("keydown", { key: "c", ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(handler(new KeyboardEvent("keydown", { key: "c", ctrlKey: true }))).toBe(true);
    expect(handler(new KeyboardEvent("keydown", { key: "Insert", ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(handler(new KeyboardEvent("keydown", { key: "Insert", metaKey: true, shiftKey: true }))).toBe(true);
    expect(actions.copy).not.toHaveBeenCalled();
    expect(actions.paste).not.toHaveBeenCalled();
    expect(handler(new KeyboardEvent("keydown", { key: "Insert", ctrlKey: true }))).toBe(false);
    expect(handler(new KeyboardEvent("keydown", { key: "Insert", shiftKey: true }))).toBe(false);
    expect(actions.copy).toHaveBeenCalledTimes(1);
    expect(actions.paste).toHaveBeenCalledTimes(1);
  });
  it("uses the platform monospace and CJK fallback stack for default, prepending custom fonts", () => {
    expect(preferredTerminalFontStack(DEFAULT_NOTES_TYPOGRAPHY.fontMono, "macos")).toBe(
      'ui-monospace, "SF Mono", Menlo, "PingFang SC", "Hiragino Sans GB"'
    );
    expect(preferredTerminalFontStack(DEFAULT_NOTES_TYPOGRAPHY.fontMono, "windows")).toBe(
      '"Cascadia Mono", Consolas, "Microsoft YaHei UI"'
    );
    expect(preferredTerminalFontStack("", "linux")).toBe('monospace, "Noto Sans Mono CJK SC"');
    expect(preferredTerminalFontStack("Consolas, monospace", "windows")).toBe(
      'Consolas, "Cascadia Mono", Consolas, "Microsoft YaHei UI"'
    );
    expect(preferredTerminalFontStack('"Fira Code"', "macos")).toBe(
      '"Fira Code", ui-monospace, "SF Mono", Menlo, "PingFang SC", "Hiragino Sans GB"'
    );
  });
  it("remains compatible with verifiedMonoStack verification without breaking", () => {
    const macStack = preferredTerminalFontStack(DEFAULT_NOTES_TYPOGRAPHY.fontMono, "macos");
    expect(verifiedMonoStack(macStack)).toBe('ui-monospace, "SF Mono", Menlo, "PingFang SC", "Hiragino Sans GB"');
    const winStack = preferredTerminalFontStack(DEFAULT_NOTES_TYPOGRAPHY.fontMono, "windows");
    expect(verifiedMonoStack(winStack)).toBe('"Cascadia Mono", Consolas, "Microsoft YaHei UI"');
  });
  it("provides line height adjustments clamped between 1.2 and 1.6 with default 1.4", () => {
    expect(DEFAULT_TERMINAL_LINE_HEIGHT).toBe(1.4);
    expect(clampTerminalLineHeight(NaN)).toBe(1.4);
    expect(clampTerminalLineHeight(1.0)).toBe(1.2);
    expect(clampTerminalLineHeight(2.0)).toBe(1.6);
    expect(clampTerminalLineHeight(1.34)).toBe(1.3);
    expect(clampTerminalLineHeight(1.5)).toBe(1.5);

    expect(terminalLineHeightIndex(1.2)).toBe(0);
    expect(terminalLineHeightIndex(1.4)).toBe(2);
    expect(terminalLineHeightIndex(1.6)).toBe(4);
    expect(terminalLineHeightFromIndex(0)).toBe(1.2);
    expect(terminalLineHeightFromIndex(2)).toBe(1.4);
    expect(terminalLineHeightFromIndex(4)).toBe(1.6);

    expect(loadTerminalLineHeight()).toBe(1.4);
    saveTerminalLineHeight(1.5);
    expect(loadTerminalLineHeight()).toBe(1.5);
  });
  it("provides GPU acceleration WebGL toggle settings with default enabled", () => {
    expect(DEFAULT_TERMINAL_WEBGL).toBe(true);
    expect(loadTerminalWebglEnabled()).toBe(true);
    saveTerminalWebglEnabled(false);
    expect(loadTerminalWebglEnabled()).toBe(false);
    saveTerminalWebglEnabled(true);
    expect(loadTerminalWebglEnabled()).toBe(true);
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
