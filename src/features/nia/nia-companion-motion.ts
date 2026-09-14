"use client";

import { useEffect, useState } from "react";

export const NIA_COMPANION_DRIFT_KEY = "auris.nia.companion-drift";
const CHANGE_EVENT = "auris:nia-companion-drift-change";

function loadDrift(): boolean {
  try { return window.localStorage.getItem(NIA_COMPANION_DRIFT_KEY) !== "false"; }
  catch { return true; }
}

export function saveNiaCompanionDrift(enabled: boolean): void {
  try { window.localStorage.setItem(NIA_COMPANION_DRIFT_KEY, String(enabled)); }
  catch { /* Still apply the preference to this window when storage is unavailable. */ }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: enabled }));
}

/** Deterministic first render, then synchronize the workspace and companion windows. */
export function useNiaCompanionDrift(): boolean {
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    setEnabled(loadDrift());
    const onStorage = (event: StorageEvent) => {
      if (event.key === NIA_COMPANION_DRIFT_KEY || event.key === null) {
        setEnabled(event.newValue !== "false");
      }
    };
    const onChange = (event: Event) => {
      const value = (event as CustomEvent<unknown>).detail;
      if (typeof value === "boolean") setEnabled(value);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, onChange);
    };
  }, []);
  return enabled;
}
