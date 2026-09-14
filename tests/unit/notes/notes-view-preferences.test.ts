import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTES_VIEW_PREFERENCES,
  loadNotesViewPreferences,
  normalizeNotesViewPreferences,
  saveNotesViewPreferences,
} from "@/features/notes/editor/notes-view-preferences";

function memoryStorage(seed?: string) {
  let value = seed ?? null;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
  };
}

describe("notes-view-preferences", () => {
  it("clamps zoom to 12–32px and rejects non-boolean mode values", () => {
    expect(
      normalizeNotesViewPreferences({
        focusMode: "yes",
        fontSize: 99,
        readOnly: true,
        typewriterMode: false,
      }),
    ).toEqual({
      ...DEFAULT_NOTES_VIEW_PREFERENCES,
      fontSize: 32,
      readOnly: true,
    });
    expect(normalizeNotesViewPreferences({ fontSize: 3 }).fontSize).toBe(12);
  });

  it("round-trips valid preferences and recovers invalid storage", () => {
    const storage = memoryStorage();
    saveNotesViewPreferences(
      {
        focusMode: true,
        fontSize: 22,
        readOnly: true,
        typewriterMode: true,
      },
      storage,
    );
    expect(loadNotesViewPreferences(storage)).toEqual({
      focusMode: true,
      fontSize: 22,
      readOnly: true,
      typewriterMode: true,
    });
    expect(loadNotesViewPreferences(memoryStorage("{broken"))).toEqual(
      DEFAULT_NOTES_VIEW_PREFERENCES,
    );
  });
});
