"use client";

import { useSyncExternalStore } from "react";

export type NotesLocale = "en-US" | "zh-CN";

export const DEFAULT_NOTES_LOCALE: NotesLocale = "zh-CN";
export const NOTES_LOCALE_STORAGE_KEY = "auris.notes.locale.v1";
export const NOTES_LOCALE_EVENT = "auris:notes-locale-changed";

let activeLocale: NotesLocale = DEFAULT_NOTES_LOCALE;

export function isNotesLocale(value: unknown): value is NotesLocale {
  return value === "en-US" || value === "zh-CN";
}

export function loadNotesLocale(
  storage: Pick<Storage, "getItem"> | null = typeof window !== "undefined"
    ? window.localStorage
    : null,
) {
  const stored = storage?.getItem(NOTES_LOCALE_STORAGE_KEY);

  if (isNotesLocale(stored)) {
    activeLocale = stored;
    return stored;
  }

  return activeLocale;
}

export function saveNotesLocale(
  locale: NotesLocale,
  storage: Pick<Storage, "setItem"> | null = typeof window !== "undefined"
    ? window.localStorage
    : null,
) {
  activeLocale = locale;
  storage?.setItem(NOTES_LOCALE_STORAGE_KEY, locale);

  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(NOTES_LOCALE_EVENT, { detail: { locale } }),
    );
  }
}

export function getActiveNotesLocale() {
  return activeLocale;
}

function subscribe(listener: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const refresh = () => {
    loadNotesLocale();
    listener();
  };
  window.addEventListener(NOTES_LOCALE_EVENT, refresh);
  window.addEventListener("storage", refresh);
  return () => {
    window.removeEventListener(NOTES_LOCALE_EVENT, refresh);
    window.removeEventListener("storage", refresh);
  };
}

export function useNotesLocale() {
  return useSyncExternalStore(
    subscribe,
    () => loadNotesLocale(),
    () => DEFAULT_NOTES_LOCALE,
  );
}
