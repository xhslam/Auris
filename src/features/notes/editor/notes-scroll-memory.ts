export type NotesScrollSurface = "source" | "wysiwyg" | "preview";

type ScrollMemory = Partial<Record<NotesScrollSurface, number>>;

const offsetsByPath: Record<string, ScrollMemory> = {};
const userGestureEvents = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
const maxRestoreFrames = 90;
const saveThrottleMs = 150;

let activeRestore: (() => void) | null = null;
let restoreEpoch = 0;
// Explicit navigation outranks remembered pixels, including a not-yet-run frame.
// Adapted invariant: VMark 8887701db, sourcePendingNav/restoreChoice (#1561).
let navigationVersion = 0;

function isUsablePath(path: string | null | undefined): path is string {
  return Boolean(path && path.trim());
}

export function setNotesScrollOffset(
  path: string | null | undefined,
  surface: NotesScrollSurface,
  offset: number,
): void {
  if (!isUsablePath(path) || !Number.isFinite(offset) || offset < 0) return;
  const entry = offsetsByPath[path] ?? (offsetsByPath[path] = {});
  entry[surface] = offset;
}

export function getNotesScrollOffset(
  path: string | null | undefined,
  surface: NotesScrollSurface,
): number | undefined {
  return isUsablePath(path) ? offsetsByPath[path]?.[surface] : undefined;
}

export function clearNotesScrollOffsets(path: string | null | undefined): void {
  if (isUsablePath(path)) delete offsetsByPath[path];
}

export function resetNotesScrollMemoryForTests(): void {
  for (const path of Object.keys(offsetsByPath)) delete offsetsByPath[path];
  cancelNotesScrollRestore();
  restoreEpoch = 0;
  navigationVersion = 0;
}

/** Captured by mount-time frames so an intervening explicit jump wins. */
export function getNotesScrollNavigationVersion(): number {
  return navigationVersion;
}

/** Finds the editor-owned scrolling element before falling back to an ancestor surface. */
export function findNotesScrollContainer(from: HTMLElement | null): HTMLElement | null {
  if (!from) return null;
  const codeMirrorScroller = from.querySelector<HTMLElement>(".cm-scroller");
  if (codeMirrorScroller) return codeMirrorScroller;
  let current: HTMLElement | null = from;
  while (current) {
    try {
      const style = getComputedStyle(current);
      if (style.overflowY === "auto" || style.overflowY === "scroll") return current;
    } catch {
      break;
    }
    current = current.parentElement;
  }
  return from.parentElement;
}

/** Captures user-owned scrolling and ignores layout/focus scrolling while restoring. */
export function trackNotesScroll(
  container: HTMLElement | null,
  path: string | null | undefined,
  surface: NotesScrollSurface,
): () => void {
  if (!container || !isUsablePath(path)) return () => {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingOffset: number | null = null;
  let pendingEpoch = restoreEpoch;
  const flush = () => {
    timer = null;
    const offset = pendingOffset;
    pendingOffset = null;
    if (offset === null || activeRestore || pendingEpoch !== restoreEpoch) return;
    setNotesScrollOffset(path, surface, offset);
  };
  const onScroll = () => {
    if (activeRestore || container.scrollHeight <= container.clientHeight) return;
    pendingOffset = container.scrollTop;
    pendingEpoch = restoreEpoch;
    if (timer === null) timer = setTimeout(flush, saveThrottleMs);
  };
  container.addEventListener("scroll", onScroll, { passive: true });
  return () => {
    container.removeEventListener("scroll", onScroll);
    if (timer !== null) clearTimeout(timer);
    flush();
  };
}

/** Restores only when the layout can reach the saved offset and yields to user input. */
export function restoreNotesScroll(
  container: HTMLElement | null,
  offset: number | undefined,
): void {
  // Replacing an internal restore is not a new navigation intent: another
  // surface's pending mount frame must not be invalidated by this one.
  activeRestore?.();
  if (!container || offset === undefined || !Number.isFinite(offset)) return;
  restoreEpoch += 1;
  if (offset <= 0) {
    container.scrollTop = 0;
    return;
  }
  let frames = 0;
  let finished = false;
  let landed = false;
  const documentRef = container.ownerDocument;
  const finish = (allowClamp: boolean) => {
    if (finished) return;
    finished = true;
    if (activeRestore === stop) activeRestore = null;
    for (const eventName of userGestureEvents) documentRef?.removeEventListener(eventName, stop, true);
    if (allowClamp && !landed) container.scrollTop = offset;
  };
  const stop = () => finish(false);
  for (const eventName of userGestureEvents) documentRef?.addEventListener(eventName, stop, true);
  activeRestore = stop;
  const step = () => {
    if (finished) return;
    if (container.scrollHeight - container.clientHeight >= offset) {
      if (container.scrollTop !== offset) container.scrollTop = offset;
      landed = landed || container.scrollTop === offset;
    }
    frames += 1;
    if (frames >= maxRestoreFrames) {
      finish(true);
      return;
    }
    requestAnimationFrame(step);
  };
  step();
}

/** Explicit navigation (outline, search, links or selection) takes viewport ownership. */
export function cancelNotesScrollRestore(): void {
  navigationVersion += 1;
  restoreEpoch += 1;
  activeRestore?.();
}
