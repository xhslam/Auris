import {
  DEFAULT_APP_THEME,
  type AppThemeId,
} from "@/features/appearance/app-theme";

/** Native BrowserWindow / WebContentsView fill colors aligned with `--app-bg`. */
export const BROWSER_THEME_BACKGROUNDS = Object.freeze({
  white: "#f4f2ec",
  paper: "#efe9d8",
  mint: "#edf3e8",
  sepia: "#f1e7d0",
  night: "#1b1c1f",
  solarized: "#002b36",
} as const satisfies Record<AppThemeId, string>);

export function browserThemeBackground(
  theme: AppThemeId = DEFAULT_APP_THEME,
): string {
  return BROWSER_THEME_BACKGROUNDS[theme] ?? BROWSER_THEME_BACKGROUNDS.mint;
}
