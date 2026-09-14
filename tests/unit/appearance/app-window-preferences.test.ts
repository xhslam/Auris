import { describe, expect, it } from "vitest";
import {
  APP_WINDOW_PREFERENCES_STORAGE_KEY,
  DEFAULT_APP_WINDOW_PREFERENCES,
  loadAppWindowPreferences,
  normalizeAppWindowPreferences,
  saveAppWindowPreferences,
} from "@/features/appearance/app-window-preferences";

describe("app window preferences", () => {
  it("normalizes invalid values to stable defaults", () => {
    expect(
      normalizeAppWindowPreferences({
        focusDim: 9,
        hideStatus: "yes",
        titlebarName: null,
      }),
    ).toEqual(DEFAULT_APP_WINDOW_PREFERENCES);
  });

  it("persists the three live appearance preferences", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    saveAppWindowPreferences(
      { focusDim: 2, hideStatus: true, titlebarName: true },
      storage,
    );

    expect(values.has(APP_WINDOW_PREFERENCES_STORAGE_KEY)).toBe(true);
    expect(loadAppWindowPreferences(storage)).toEqual({
      focusDim: 2,
      hideStatus: true,
      titlebarName: true,
    });
  });
});
