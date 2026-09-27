import { describe, expect, it, vi } from "vitest";
import {
  installImeChordGuard,
  isChordArtifactInsertion,
  type ChordModifierState,
  type InsertionFacts,
} from "@/features/notes/editor/ime-chord-guard";

describe("isChordArtifactInsertion", () => {
  const baseEvent: InsertionFacts = {
    cancelable: true,
    data: "·",
    inputType: "insertText",
    isComposing: false,
  };

  const ctrlHeld: ChordModifierState = { alt: false, ctrl: true, meta: false };
  const metaHeld: ChordModifierState = { alt: false, ctrl: false, meta: true };
  const noneHeld: ChordModifierState = { alt: false, ctrl: false, meta: false };

  it("vetoes single-glyph insertText when Ctrl or Cmd is held", () => {
    expect(isChordArtifactInsertion(baseEvent, ctrlHeld, "mac")).toBe(true);
    expect(isChordArtifactInsertion(baseEvent, metaHeld, "mac")).toBe(true);
    expect(isChordArtifactInsertion(baseEvent, ctrlHeld, "other")).toBe(true);
  });

  it("permits insertion when no command modifier is held", () => {
    expect(isChordArtifactInsertion(baseEvent, noneHeld, "mac")).toBe(false);
    expect(isChordArtifactInsertion(baseEvent, noneHeld, "other")).toBe(false);
  });

  it("permits active composition text", () => {
    const composingEvent: InsertionFacts = {
      ...baseEvent,
      isComposing: true,
    };
    expect(isChordArtifactInsertion(composingEvent, ctrlHeld, "mac")).toBe(false);
  });

  it("permits non-cancelable events", () => {
    const nonCancelable: InsertionFacts = {
      ...baseEvent,
      cancelable: false,
    };
    expect(isChordArtifactInsertion(nonCancelable, ctrlHeld, "mac")).toBe(false);
  });

  it("permits paste (insertFromPaste)", () => {
    const pasteEvent: InsertionFacts = {
      ...baseEvent,
      data: "pasted text",
      inputType: "insertFromPaste",
    };
    expect(isChordArtifactInsertion(pasteEvent, metaHeld, "mac")).toBe(false);
  });

  it("permits multi-glyph insertions", () => {
    const multiGlyph: InsertionFacts = {
      ...baseEvent,
      data: "abc",
    };
    expect(isChordArtifactInsertion(multiGlyph, ctrlHeld, "mac")).toBe(false);
  });

  it("permits surrogate pair glyph (length 2)", () => {
    const emojiEvent: InsertionFacts = {
      ...baseEvent,
      data: "🌟", // 2 UTF-16 units
    };
    expect(isChordArtifactInsertion(emojiEvent, ctrlHeld, "mac")).toBe(true);
  });

  it("spares AltGr (Ctrl+Alt) on non-macOS platforms", () => {
    const altGrHeld: ChordModifierState = { alt: true, ctrl: true, meta: false };
    expect(isChordArtifactInsertion(baseEvent, altGrHeld, "other")).toBe(false);
    // On macOS, Option+Command does not type characters, so still vetoed
    expect(isChordArtifactInsertion(baseEvent, altGrHeld, "mac")).toBe(true);
  });

  it("does not veto insertion on non-macOS when only Meta/Super is held (fixes #1445)", () => {
    // Windows/Linux users pressing Super key or with stuck Super must NOT have punctuation swallowed
    expect(isChordArtifactInsertion(baseEvent, metaHeld, "other")).toBe(false);
    // But on macOS, Meta/Cmd is the primary command modifier and must be vetoed
    expect(isChordArtifactInsertion(baseEvent, metaHeld, "mac")).toBe(true);
  });
});

describe("installImeChordGuard window integration", () => {
  it("tracks keydown modifiers and vetoes beforeinput, clearing on blur/pointerdown/focus", () => {
    const listeners: Record<string, EventListenerOrEventListenerObject[]> = {};
    const mockWindow = {
      addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        listeners[type] = listeners[type] || [];
        listeners[type].push(listener);
      }),
      removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        if (listeners[type]) {
          listeners[type] = listeners[type].filter((l) => l !== listener);
        }
      }),
      document: {
        addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
          listeners[type] = listeners[type] || [];
          listeners[type].push(listener);
        }),
        removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
          if (listeners[type]) {
            listeners[type] = listeners[type].filter((l) => l !== listener);
          }
        }),
      },
    } as unknown as Window;

    const dispose = installImeChordGuard(mockWindow);

    const trigger = (type: string, event: unknown) => {
      listeners[type]?.forEach((l) => {
        if (typeof l === "function") {
          l(event as Event);
        }
      });
    };

    // 1. Positive evidence: a normal key with ctrlKey:true does NOT arm the guard
    trigger("keydown", { type: "keydown", key: "a", ctrlKey: true, metaKey: false, altKey: false });
    const mockPreventDefaultNoArm = vi.fn();
    trigger("beforeinput", {
      cancelable: true,
      data: "·",
      inputType: "insertText",
      isComposing: false,
      preventDefault: mockPreventDefaultNoArm,
    });
    expect(mockPreventDefaultNoArm).not.toHaveBeenCalled();

    // 2. Press Control key itself: this arms the guard
    trigger("keydown", { type: "keydown", key: "Control", ctrlKey: true, metaKey: false, altKey: false });

    // beforeinput fires with "·"
    const mockPreventDefault = vi.fn();
    trigger("beforeinput", {
      cancelable: true,
      data: "·",
      inputType: "insertText",
      isComposing: false,
      preventDefault: mockPreventDefault,
    });
    expect(mockPreventDefault).toHaveBeenCalledTimes(1);

    // 3. After pointerdown (e.g. user clicked or emoji picker opened)
    trigger("pointerdown", {});

    const mockPreventDefault2 = vi.fn();
    trigger("beforeinput", {
      cancelable: true,
      data: "·",
      inputType: "insertText",
      isComposing: false,
      preventDefault: mockPreventDefault2,
    });
    // Modifier state was cleared, so beforeinput is NOT prevented
    expect(mockPreventDefault2).not.toHaveBeenCalled();

    // 4. Arm again with Control, then clear with focus
    trigger("keydown", { type: "keydown", key: "Control", ctrlKey: true, metaKey: false, altKey: false });
    trigger("focus", {});
    const mockPreventDefault3 = vi.fn();
    trigger("beforeinput", {
      cancelable: true,
      data: "·",
      inputType: "insertText",
      isComposing: false,
      preventDefault: mockPreventDefault3,
    });
    expect(mockPreventDefault3).not.toHaveBeenCalled();

    // 5. Release via keyup with ctrlKey: false
    trigger("keydown", { type: "keydown", key: "Control", ctrlKey: true, metaKey: false, altKey: false });
    trigger("keyup", { type: "keyup", key: "Control", ctrlKey: false, metaKey: false, altKey: false });
    const mockPreventDefault4 = vi.fn();
    trigger("beforeinput", {
      cancelable: true,
      data: "·",
      inputType: "insertText",
      isComposing: false,
      preventDefault: mockPreventDefault4,
    });
    expect(mockPreventDefault4).not.toHaveBeenCalled();

    dispose();
  });
});
