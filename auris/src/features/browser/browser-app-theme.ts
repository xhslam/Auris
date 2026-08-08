import {
  DEFAULT_NOTES_READING_THEME,
  type NotesReadingThemeId,
} from "@/features/notes/workbench/notes-reading-theme";

/** Native BrowserWindow / WebContentsView fill colors aligned with `--app-bg`. */
export const BROWSER_THEME_BACKGROUNDS = Object.freeze({
  white: "#f4f2ec",
  paper: "#efe9d8",
  mint: "#edf3e8",
  sepia: "#f1e7d0",
  night: "#1b1c1f",
  solarized: "#002b36",
} as const satisfies Record<NotesReadingThemeId, string>);

export function browserThemeBackground(
  theme: NotesReadingThemeId = DEFAULT_NOTES_READING_THEME,
): string {
  return BROWSER_THEME_BACKGROUNDS[theme] ?? BROWSER_THEME_BACKGROUNDS.mint;
}
