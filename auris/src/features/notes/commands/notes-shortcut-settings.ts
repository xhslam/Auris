import {
  normalizeNotesShortcut,
  type NotesShortcutBinding,
} from "@/features/notes/commands/notes-shortcut-registry";

export const NOTES_SHORTCUTS_STORAGE_KEY = "auris.notes.shortcuts.v1";
export const NOTES_SHORTCUTS_EVENT = "auris:notes-shortcuts-changed";

export type NotesShortcutOverrides = Record<string, string>;

type NotesShortcutSettingsPayload = {
  overrides: NotesShortcutOverrides;
  schemaVersion: 1;
};

export function getNotesShortcutBindingId(
  binding: Pick<NotesShortcutBinding, "commandId" | "surface">,
) {
  return `${binding.surface}:${binding.commandId}`;
}

export function validateNotesShortcut(shortcut: string) {
  const normalized = normalizeNotesShortcut(shortcut);
  const parts = normalized.split("+").filter(Boolean);
  const key = parts.at(-1) ?? "";

  if (
    !key ||
    key === "mod" ||
    key === "ctrl" ||
    key === "alt" ||
    key === "shift"
  ) {
    return null;
  }

  return normalized;
}

function sanitizeOverrides(value: unknown): NotesShortcutOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([id, shortcut]) => [
        id,
        typeof shortcut === "string"
          ? validateNotesShortcut(shortcut)
          : null,
      ])
      .filter((entry): entry is [string, string] => entry[1] !== null),
  );
}

export function parseNotesShortcutSettings(
  value: unknown,
): NotesShortcutOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const payload = value as Partial<NotesShortcutSettingsPayload>;
  return payload.schemaVersion === 1
    ? sanitizeOverrides(payload.overrides)
    : {};
}

export function loadNotesShortcutOverrides(
  storage: Pick<Storage, "getItem"> | null = typeof window !== "undefined"
    ? window.localStorage
    : null,
) {
  if (!storage) {
    return {};
  }

  try {
    return parseNotesShortcutSettings(
      JSON.parse(storage.getItem(NOTES_SHORTCUTS_STORAGE_KEY) ?? "null"),
    );
  } catch {
    return {};
  }
}

export function saveNotesShortcutOverrides(
  overrides: NotesShortcutOverrides,
  storage: Pick<Storage, "setItem"> | null = typeof window !== "undefined"
    ? window.localStorage
    : null,
) {
  const sanitized = sanitizeOverrides(overrides);
  const payload: NotesShortcutSettingsPayload = {
    overrides: sanitized,
    schemaVersion: 1,
  };

  storage?.setItem(NOTES_SHORTCUTS_STORAGE_KEY, JSON.stringify(payload));

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(NOTES_SHORTCUTS_EVENT, { detail: payload }),
    );
  }

  return sanitized;
}

export function applyNotesShortcutOverrides(
  bindings: readonly NotesShortcutBinding[],
  overrides: NotesShortcutOverrides,
) {
  return bindings.map((binding) => ({
    ...binding,
    key:
      overrides[getNotesShortcutBindingId(binding)] ??
      normalizeNotesShortcut(binding.key),
  }));
}

export function serializeNotesShortcutSettings(
  overrides: NotesShortcutOverrides,
) {
  return JSON.stringify(
    {
      overrides: sanitizeOverrides(overrides),
      schemaVersion: 1,
    } satisfies NotesShortcutSettingsPayload,
    null,
    2,
  );
}
