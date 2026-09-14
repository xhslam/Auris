export type NotesViewPreferences = Readonly<{
  focusMode: boolean;
  fontSize: number;
  readOnly: boolean;
  typewriterMode: boolean;
}>;

export const NOTES_VIEW_FONT_SIZE_MIN = 12;
export const NOTES_VIEW_FONT_SIZE_MAX = 32;

export const DEFAULT_NOTES_VIEW_PREFERENCES: NotesViewPreferences = {
  focusMode: false,
  fontSize: 18,
  readOnly: false,
  typewriterMode: false,
};

const STORAGE_KEY = "auris.notes.view-preferences.v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function normalizeNotesViewPreferences(
  value: unknown,
): NotesViewPreferences {
  const candidate =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const fontSize =
    typeof candidate.fontSize === "number" &&
    Number.isFinite(candidate.fontSize)
      ? Math.min(
          NOTES_VIEW_FONT_SIZE_MAX,
          Math.max(NOTES_VIEW_FONT_SIZE_MIN, Math.round(candidate.fontSize)),
        )
      : DEFAULT_NOTES_VIEW_PREFERENCES.fontSize;
  return {
    focusMode:
      typeof candidate.focusMode === "boolean"
        ? candidate.focusMode
        : DEFAULT_NOTES_VIEW_PREFERENCES.focusMode,
    fontSize,
    readOnly:
      typeof candidate.readOnly === "boolean"
        ? candidate.readOnly
        : DEFAULT_NOTES_VIEW_PREFERENCES.readOnly,
    typewriterMode:
      typeof candidate.typewriterMode === "boolean"
        ? candidate.typewriterMode
        : DEFAULT_NOTES_VIEW_PREFERENCES.typewriterMode,
  };
}

export function loadNotesViewPreferences(
  storage: Pick<StorageLike, "getItem"> | null | undefined =
    typeof window === "undefined" ? null : window.localStorage,
) {
  if (!storage) return DEFAULT_NOTES_VIEW_PREFERENCES;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw
      ? normalizeNotesViewPreferences(JSON.parse(raw))
      : DEFAULT_NOTES_VIEW_PREFERENCES;
  } catch {
    return DEFAULT_NOTES_VIEW_PREFERENCES;
  }
}

export function saveNotesViewPreferences(
  preferences: NotesViewPreferences,
  storage: Pick<StorageLike, "setItem"> | null | undefined =
    typeof window === "undefined" ? null : window.localStorage,
) {
  const normalized = normalizeNotesViewPreferences(preferences);
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Preferences are best-effort and must never block editing.
  }
  return normalized;
}
