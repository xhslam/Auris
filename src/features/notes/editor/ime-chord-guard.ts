/**
 * IME chord guard — the half of chord consumption that `preventDefault()` on
 * keydown cannot reach.
 *
 * Under a macOS CJK input method (such as Pinyin with Chinese punctuation enabled),
 * an input method can rewrite physical keys (e.g. Backquote ` -> `·`) and commit
 * the character to the DOM BEFORE keydown is delivered to the page.
 * Consequently, `event.preventDefault()` in `keydown` listeners arrives too late,
 * leaving a stray character in the document and dirtying a clean note.
 *
 * This guard listens to `beforeinput` in the CAPTURE phase on the window.
 * When a command chord modifier (Ctrl or Cmd/Meta) is physically held, any single-glyph
 * `insertText` that is not part of an active composition is vetoed via `preventDefault()`.
 */

export interface ChordModifierState {
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
}

export interface InsertionFacts {
  cancelable: boolean;
  data: string | null;
  inputType: string;
  isComposing: boolean;
}

const NO_MODIFIERS: ChordModifierState = {
  alt: false,
  ctrl: false,
  meta: false,
};

/** One glyph: an astral plane character (surrogate pair) is two UTF-16 code units. */
const MAX_ARTIFACT_LENGTH = 2;

export function isMacPlatform(): boolean {
  if (typeof process !== "undefined" && process.platform) {
    return process.platform === "darwin";
  }
  if (typeof navigator !== "undefined") {
    return (
      /Macintosh|Mac OS X/i.test(navigator.userAgent) ||
      navigator.platform === "MacIntel"
    );
  }
  return false;
}

/**
 * Pure evaluation of whether an insertion is an IME artifact produced by a command chord.
 */
export function isChordArtifactInsertion(
  event: InsertionFacts,
  held: ChordModifierState,
  platform: "mac" | "other",
): boolean {
  if (!event.cancelable) return false;
  if (event.isComposing) return false;
  if (event.inputType !== "insertText") return false;
  if (!event.data || event.data.length > MAX_ARTIFACT_LENGTH) return false;
  if (!held.ctrl && !held.meta) return false;
  // On non-macOS platforms, Ctrl+Alt represents AltGr, which legitimately types characters.
  if (platform !== "mac" && held.alt) return false;
  return true;
}

/**
 * Installs the IME chord guard on the specified Window.
 * Returns an uninstallation / cleanup disposer function.
 */
export function installImeChordGuard(target: Window): () => void {
  let held: ChordModifierState = NO_MODIFIERS;

  const track = (event: Event): void => {
    const e = event as KeyboardEvent;
    held = {
      alt: Boolean(e.altKey),
      ctrl: Boolean(e.ctrlKey),
      meta: Boolean(e.metaKey),
    };
  };

  const clear = (): void => {
    held = NO_MODIFIERS;
  };

  const onBeforeInput = (event: Event): void => {
    const e = event as InputEvent;
    const facts: InsertionFacts = {
      cancelable: e.cancelable,
      data: e.data,
      inputType: e.inputType,
      isComposing: Boolean(e.isComposing),
    };
    if (
      !isChordArtifactInsertion(
        facts,
        held,
        isMacPlatform() ? "mac" : "other",
      )
    ) {
      return;
    }
    e.preventDefault();
  };

  target.addEventListener("keydown", track, true);
  target.addEventListener("keyup", track, true);
  target.addEventListener("blur", clear);
  target.addEventListener("pointerdown", clear, true);
  target.document?.addEventListener?.("visibilitychange", clear);
  target.addEventListener("beforeinput", onBeforeInput, true);

  return () => {
    target.removeEventListener("keydown", track, true);
    target.removeEventListener("keyup", track, true);
    target.removeEventListener("blur", clear);
    target.removeEventListener("pointerdown", clear, true);
    target.document?.removeEventListener?.("visibilitychange", clear);
    target.removeEventListener("beforeinput", onBeforeInput, true);
  };
}
