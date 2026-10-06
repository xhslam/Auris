import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAppTheme } from "@/features/appearance/use-app-theme";
import {
  APP_THEME_EVENT,
  APP_THEME_IDS,
  APP_THEME_STORAGE_KEY,
  DEFAULT_APP_THEME,
  loadAppTheme,
  saveAppTheme,
} from "@/features/appearance/app-theme";
import {
  NOTES_READING_THEME_EVENT,
  loadNotesReadingTheme,
} from "@/features/notes/workbench/notes-reading-theme";

const globalsCss = readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");
const readingCss = readFileSync(
  path.join(process.cwd(), "src", "components", "reading", "reading-library.css"),
  "utf8",
);
const niaCss = readFileSync(
  path.join(process.cwd(), "src", "app", "nia", "nia.css"),
  "utf8",
);

function hasRule(css: string, selector: string) {
  return new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`).test(css);
}

describe("application theme contract", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("uses one persisted value and one in-window event for the entire application", () => {
    const listener = vi.fn();
    window.addEventListener(APP_THEME_EVENT, listener);

    saveAppTheme("paper");

    expect(window.localStorage.getItem(APP_THEME_STORAGE_KEY)).toBe("paper");
    expect(loadAppTheme()).toBe("paper");
    expect(loadNotesReadingTheme()).toBe("paper");
    expect(NOTES_READING_THEME_EVENT).toBe(APP_THEME_EVENT);
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(APP_THEME_EVENT, listener);
  });

  it("falls back to the same stable default when no user preference exists", () => {
    expect(loadAppTheme()).toBe(DEFAULT_APP_THEME);
  });

  it("updates every shared-hook consumer immediately after a settings theme change", async () => {
    function ThemeProbe() {
      return createElement("output", { "data-testid": "theme" }, useAppTheme());
    }

    render(createElement(ThemeProbe));
    expect(screen.getByTestId("theme")).toHaveTextContent(DEFAULT_APP_THEME);

    await act(async () => {
      saveAppTheme("solarized");
    });

    expect(screen.getByTestId("theme")).toHaveTextContent("solarized");
  });

  it.each(APP_THEME_IDS)("provides %s tokens to shell, Notes, reading, and nia", (theme) => {
    expect(hasRule(globalsCss, `.desktop-app-shell[data-app-theme="${theme}"]`)).toBe(true);
    expect(hasRule(globalsCss, `.desktop-app-frame .notes-v2[data-notes-theme="${theme}"]`)).toBe(true);
    expect(hasRule(readingCss, `.desktop-app-shell[data-app-theme="${theme}"] .reading-library`)).toBe(true);
    expect(hasRule(niaCss, `.desktop-app-shell[data-app-theme="${theme}"] .nia-workspace`)).toBe(true);
  });
});
