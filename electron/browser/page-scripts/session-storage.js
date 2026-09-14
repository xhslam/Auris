function aurisSessionStorage(args) {
  "use strict";

  const expectedOrigin = typeof args?.expectedOrigin === "string" ? args.expectedOrigin : "";
  const mode = typeof args?.mode === "string" ? args.mode : "";

  try {
    if (!expectedOrigin || new URL(expectedOrigin).origin !== location.origin) {
      return { ok: false, reason: "origin-changed" };
    }
  } catch {
    return { ok: false, reason: "origin-changed" };
  }

  if (mode === "capture") {
    const items = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (typeof key !== "string") continue;
      items.push([key, localStorage.getItem(key) ?? ""]);
    }
    return { ok: true, items };
  }

  if (mode === "restore") {
    const pairs = Array.isArray(args?.items) ? args.items : [];
    for (const pair of pairs) {
      if (!Array.isArray(pair) || pair.length < 2) continue;
      const key = pair[0];
      const value = pair[1];
      if (typeof key !== "string" || typeof value !== "string") continue;
      try {
        localStorage.setItem(key, value);
      } catch {
        /* Quota or access errors stay fail-closed per item. */
      }
    }
    return { ok: true, applied: true };
  }

  return { ok: false, reason: "unsupported-mode" };
}
