/** Adapted from VMark loadImageNearViewport.ts / BlockImageNodeView.ts @ 449fbc3e0.
 * ISC, Copyright (c) 2026 Xiaolai Li; docs/vmark-port/UPSTREAM-LICENSE.txt.
 * Auris uses synchronous protocol URL resolution and exports freshly rendered HTML,
 * so it needs neither an async path-IPC wait nor VMark's live-DOM print/busy store.
 */
import { scheduleNotesViewportRender } from "./notes-viewport-render-scheduler";

export function loadNotesImageNearViewport(
  image: HTMLImageElement,
  root: HTMLElement | null,
  source: () => string | null,
) {
  let cancelled = false;
  image.decoding = "async";
  // Explicit viewport scheduling owns the request; native lazy must not defer it again.
  image.loading = "eager";
  image.dataset.notesImagePending = "true";
  // Consecutive images must not collapse to zero-sized boxes and all intersect at once.
  image.style.minWidth = "min(160px, 100%)";
  image.style.minHeight = "120px";
  const settled = () => {
    delete image.dataset.notesImagePending;
    image.style.removeProperty("min-width");
    image.style.removeProperty("min-height");
    image.removeEventListener("load", settled);
    image.removeEventListener("error", settled);
  };
  image.addEventListener("load", settled);
  image.addEventListener("error", settled);
  const cancelRender = scheduleNotesViewportRender(image, root, () => {
    if (cancelled) return;
    const resolved = source();
    if (resolved) image.src = resolved;
    else settled();
    if (image.complete && image.naturalWidth > 0) settled();
  });
  return () => { cancelled = true; cancelRender(); settled(); };
}
