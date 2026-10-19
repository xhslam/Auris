"use client";

import { useEffect, useState } from "react";

export const DESKTOP_CHROME_IDLE_MS = 3000;

/** Idle behavior for the Notes status bar, including portal activity. */
export function useDesktopChromeActivity(autoHide: boolean): boolean {
  const [active, setActive] = useState(true);

  useEffect(() => {
    setActive(true);
    if (!autoHide) return;

    let timer: ReturnType<typeof setTimeout>;
    const markActive = () => {
      setActive(true);
      clearTimeout(timer);
      timer = setTimeout(() => setActive(false), DESKTOP_CHROME_IDLE_MS);
    };
    const events = [
      "pointermove", "mousemove", "pointerdown", "keydown",
      "focusin", "wheel", "scroll", "focus",
    ] as const;
    for (const event of events) {
      window.addEventListener(event, markActive, { capture: true, passive: true });
    }
    markActive();
    return () => {
      clearTimeout(timer);
      for (const event of events) window.removeEventListener(event, markActive, true);
    };
  }, [autoHide]);

  return !autoHide || active;
}
