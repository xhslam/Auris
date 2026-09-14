"use client";

export const NIA_COMPANION_SCALE_STORAGE_KEY = "auris.nia.companion-scale";
export const NIA_COMPANION_SCALE_CHANGE_EVENT = "auris:nia-companion-scale-change";
export const DEFAULT_NIA_COMPANION_SCALE = 100;
export const MIN_NIA_COMPANION_SCALE = 50;
export const MAX_NIA_COMPANION_SCALE = 120;
export const NIA_COMPANION_SCALE_STEP = 5;

export function normalizeNiaCompanionScale(value: unknown): number {
  if (value === null || value === undefined || value === "") {
    return DEFAULT_NIA_COMPANION_SCALE;
  }
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return DEFAULT_NIA_COMPANION_SCALE;

  const steppedValue = Math.round(numericValue / NIA_COMPANION_SCALE_STEP)
    * NIA_COMPANION_SCALE_STEP;
  return Math.min(MAX_NIA_COMPANION_SCALE, Math.max(MIN_NIA_COMPANION_SCALE, steppedValue));
}

export function loadNiaCompanionScale(): number {
  if (typeof window === "undefined") return DEFAULT_NIA_COMPANION_SCALE;
  return normalizeNiaCompanionScale(
    window.localStorage.getItem(NIA_COMPANION_SCALE_STORAGE_KEY),
  );
}

export function saveNiaCompanionScale(value: unknown): number {
  const normalizedValue = normalizeNiaCompanionScale(value);
  if (typeof window === "undefined") return normalizedValue;

  window.localStorage.setItem(
    NIA_COMPANION_SCALE_STORAGE_KEY,
    String(normalizedValue),
  );
  window.dispatchEvent(new CustomEvent<number>(NIA_COMPANION_SCALE_CHANGE_EVENT, {
    detail: normalizedValue,
  }));
  return normalizedValue;
}

export function subscribeToNiaCompanionScale(
  listener: (scale: number) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;

  const handleStorage = (event: StorageEvent) => {
    if (event.key === NIA_COMPANION_SCALE_STORAGE_KEY) {
      listener(normalizeNiaCompanionScale(event.newValue));
    }
  };
  const handleChange = (event: Event) => {
    listener(normalizeNiaCompanionScale((event as CustomEvent<unknown>).detail));
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(NIA_COMPANION_SCALE_CHANGE_EVENT, handleChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(NIA_COMPANION_SCALE_CHANGE_EVENT, handleChange);
  };
}
