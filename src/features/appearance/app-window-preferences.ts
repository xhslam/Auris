/**
 * Window and focus preferences shared by Settings, the desktop shell, and Notes.
 * The renderer owns these presentation-only preferences; Electron follows
 * `document.title`, so no additional privileged bridge is required.
 */

export type FocusDimLevel = 0 | 1 | 2;

export type AppWindowPreferences = Readonly<{
  focusDim: FocusDimLevel;
  hideStatus: boolean;
  titlebarName: boolean;
}>;

export const APP_WINDOW_PREFERENCES_STORAGE_KEY =
  "auris.appearance.window-preferences.v1";
export const APP_WINDOW_PREFERENCES_EVENT =
  "auris:appearance-window-preferences";

export const DEFAULT_APP_WINDOW_PREFERENCES: AppWindowPreferences = {
  focusDim: 0,
  hideStatus: false,
  titlebarName: false,
};

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

export function normalizeAppWindowPreferences(
  value: unknown,
): AppWindowPreferences {
  const candidate =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const focusDim =
    candidate.focusDim === 1 || candidate.focusDim === 2
      ? candidate.focusDim
      : 0;

  return {
    focusDim,
    hideStatus:
      typeof candidate.hideStatus === "boolean"
        ? candidate.hideStatus
        : DEFAULT_APP_WINDOW_PREFERENCES.hideStatus,
    titlebarName:
      typeof candidate.titlebarName === "boolean"
        ? candidate.titlebarName
        : DEFAULT_APP_WINDOW_PREFERENCES.titlebarName,
  };
}

export function loadAppWindowPreferences(
  storage: StorageReader | null | undefined =
    typeof window === "undefined" ? null : window.localStorage,
): AppWindowPreferences {
  if (!storage) return DEFAULT_APP_WINDOW_PREFERENCES;
  try {
    const raw = storage.getItem(APP_WINDOW_PREFERENCES_STORAGE_KEY);
    return raw
      ? normalizeAppWindowPreferences(JSON.parse(raw))
      : DEFAULT_APP_WINDOW_PREFERENCES;
  } catch {
    return DEFAULT_APP_WINDOW_PREFERENCES;
  }
}

export function saveAppWindowPreferences(
  preferences: AppWindowPreferences,
  storage: StorageWriter | null | undefined =
    typeof window === "undefined" ? null : window.localStorage,
): AppWindowPreferences {
  const normalized = normalizeAppWindowPreferences(preferences);
  try {
    storage?.setItem(
      APP_WINDOW_PREFERENCES_STORAGE_KEY,
      JSON.stringify(normalized),
    );
  } catch {
    // Presentation preferences are best-effort and must never block the UI.
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<AppWindowPreferences>(APP_WINDOW_PREFERENCES_EVENT, {
        detail: normalized,
      }),
    );
  }
  return normalized;
}
