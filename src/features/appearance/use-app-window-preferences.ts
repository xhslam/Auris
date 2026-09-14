"use client";

import { useEffect, useState } from "react";
import {
  APP_WINDOW_PREFERENCES_EVENT,
  DEFAULT_APP_WINDOW_PREFERENCES,
  loadAppWindowPreferences,
  normalizeAppWindowPreferences,
  type AppWindowPreferences,
} from "@/features/appearance/app-window-preferences";

export function useAppWindowPreferences(): AppWindowPreferences {
  const [preferences, setPreferences] = useState<AppWindowPreferences>(
    DEFAULT_APP_WINDOW_PREFERENCES,
  );

  useEffect(() => {
    setPreferences(loadAppWindowPreferences());

    const onPreferences = (event: Event) => {
      setPreferences(
        normalizeAppWindowPreferences(
          (event as CustomEvent<AppWindowPreferences>).detail,
        ),
      );
    };
    const onStorage = () => setPreferences(loadAppWindowPreferences());

    window.addEventListener(APP_WINDOW_PREFERENCES_EVENT, onPreferences);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(APP_WINDOW_PREFERENCES_EVENT, onPreferences);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return preferences;
}
