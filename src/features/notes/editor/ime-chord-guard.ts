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

/** One glyph: an astral plane character (surrogate pair) is two UTF-16 code units. */
const MAX_ARTIFACT_LENGTH = 2;

/** KeyboardEvent.key values for the modifiers that arm the veto. */
const COMMAND_MODIFIER_KEYS: Readonly<Record<string, "ctrl" | "meta">> = {
  Control: "ctrl",
  Meta: "meta",
  OS: "meta",
};

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

  // Which modifiers mean "command" on THIS platform. Off macOS the Super key
  // is not one of them, so it must not arm the veto.
  const commandHeld = platform === "mac" ? held.ctrl || held.meta : held.ctrl;
  if (!commandHeld) return false;

  // On non-macOS platforms, Ctrl+Alt represents AltGr, which legitimately types characters.
  if (platform !== "mac" && held.alt) return false;
  return true;
}

/**
 * Installs the IME chord guard on the specified Window.
 * Returns an uninstallation / cleanup disposer function.
 *
 * An arming modifier counts only once we have seen its own physical keydown.
 * It is never inferred from event.ctrlKey / event.metaKey on an unrelated key,
 * because an OS-level swallowed keyup leaves the flag permanently true.
 */
export function installImeChordGuard(target: Window): () => void {
  let armed = { ctrl: false, meta: false };
  let altHeld = false;

  const track = (event: Event): void => {
    const e = event as KeyboardEvent;
    const altGraph =
      typeof e.getModifierState === "function" &&
      e.getModifierState("AltGraph") === true;
    altHeld = Boolean(e.altKey || altGraph);

    // Negative evidence: taken from every keyboard event.
    // The aggregate flag is the authority on release.
    if (!e.ctrlKey && !altGraph) armed = { ...armed, ctrl: false };
    if (!e.metaKey) armed = { ...armed, meta: false };

    // Positive evidence: only a command modifier's OWN keydown arms the veto.
    if (e.type === "keydown") {
      const slot = COMMAND_MODIFIER_KEYS[e.key];
      if (slot) armed = { ...armed, [slot]: true };
    }
  };

  const clear = (): void => {
    armed = { ctrl: false, meta: false };
    altHeld = false;
  };

  const onBeforeInput = (event: Event): void => {
    const e = event as InputEvent;
    const facts: InsertionFacts = {
      cancelable: e.cancelable,
      data: e.data,
      inputType: e.inputType,
      isComposing: Boolean(e.isComposing),
    };
    const held: ChordModifierState = {
      alt: altHeld,
      ctrl: armed.ctrl,
      meta: armed.meta,
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
  target.addEventListener("focus", clear);
  target.addEventListener("pointerdown", clear, true);
  target.document?.addEventListener?.("visibilitychange", clear);
  target.addEventListener("beforeinput", onBeforeInput, true);

  return () => {
    target.removeEventListener("keydown", track, true);
    target.removeEventListener("keyup", track, true);
    target.removeEventListener("blur", clear);
    target.removeEventListener("focus", clear);
    target.removeEventListener("pointerdown", clear, true);
    target.document?.removeEventListener?.("visibilitychange", clear);
    target.removeEventListener("beforeinput", onBeforeInput, true);
  };
}
