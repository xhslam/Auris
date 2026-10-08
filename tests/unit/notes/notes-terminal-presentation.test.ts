import { describe, expect, it } from "vitest";
import { APP_THEME_IDS, type AppThemeId } from "@/features/appearance/app-theme";
import { buildNotesTerminalTheme, withAlpha } from "@/components/notes-v2/terminal/notes-terminal-theme";
import { narrowToMonospace } from "@/components/notes-v2/terminal/verified-terminal-mono-stack";

describe("VMark terminal presentation adaptation", () => {
  it.each(APP_THEME_IDS)("keeps all sixteen ANSI slots for %s", (theme) => {
    const result = buildNotesTerminalTheme(theme, "#123456", "#abcdef");
    for (const slot of ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white", "brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue", "brightMagenta", "brightCyan", "brightWhite"] as const) {
      expect(result[slot]).toMatch(/^#[\da-f]{6}$/i);
    }
    expect(result.background).toBe("#123456");
    expect(result.cursorAccent).toBe("#123456");
  });
  it("rejects prototype keys instead of treating inherited fields as palettes", () => {
    expect(buildNotesTerminalTheme("__proto__" as AppThemeId, "#fff", "#111")).toEqual(buildNotesTerminalTheme("paper", "#fff", "#111"));
  });
  it("derives canvas selection/scrollbar alpha from hex or rgba colors", () => {
    expect(withAlpha("#93a1a1", 0.4)).toBe("rgba(147, 161, 161, 0.4)");
    expect(withAlpha("rgba(26, 107, 74, 0.2)", 0.25)).toBe("rgba(26, 107, 74, 0.25)");
  });
  it("drops a proportional head until the remaining stack measures monospace", () => {
    const measured: string[] = [];
    const result = narrowToMonospace('"Missing Family", "Installed Mono", monospace', (candidate) => {
      measured.push(candidate);
      return !candidate.startsWith('"Missing Family"');
    });
    expect(result).toBe('"Installed Mono", monospace');
    expect(measured).toHaveLength(2);
  });
});
