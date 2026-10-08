/**
 * Adapted from VMark v0.9.94 fontStacks.ts / terminalKeyHandler.ts,
 * commit 00ad428592dc5e80aab5afc8878a3f8c3bd27930 (ISC).
 * Copyright (c) 2026 Xiaolai Li
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
 * OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
 * CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */
import { DEFAULT_NOTES_TYPOGRAPHY } from "@/features/notes/formatting/notes-typography";

export const DEFAULT_TERMINAL_FONT_SIZE = 13;
export const TERMINAL_FONT_SIZE_STORAGE = "auris.notes.terminal.font-size";
type TerminalPlatform = "windows" | "macos" | "linux";

export function getTerminalPlatform(): TerminalPlatform {
  if (typeof navigator === "undefined") return "windows";
  if (/Mac/i.test(navigator.platform)) return "macos";
  if (/Linux/i.test(navigator.platform)) return "linux";
  return "windows";
}

export function preferredTerminalFontStack(preferred: string, platform = getTerminalPlatform()) {
  // The former shipping font stack was a coding-font preference, not a native
  // default. Match VMark's system tail while retaining explicit custom stacks.
  if (preferred && preferred !== DEFAULT_NOTES_TYPOGRAPHY.fontMono) return preferred;
  return platform === "linux" ? "monospace" : "ui-monospace, monospace";
}

export function clampTerminalFontSize(value: number) {
  return Number.isFinite(value) ? Math.min(32, Math.max(8, Math.round(value))) : DEFAULT_TERMINAL_FONT_SIZE;
}

export function loadTerminalFontSize() {
  if (typeof window === "undefined") return DEFAULT_TERMINAL_FONT_SIZE;
  try {
    const saved = window.localStorage.getItem(TERMINAL_FONT_SIZE_STORAGE);
    return saved === null ? DEFAULT_TERMINAL_FONT_SIZE : clampTerminalFontSize(Number(saved));
  } catch {
    return DEFAULT_TERMINAL_FONT_SIZE;
  }
}

type KeyActions = {
  copy: () => void;
  paste: () => void;
  clear: () => void;
  selectAll: () => void;
  search: () => void;
  zoom: (delta: number | null) => void;
  selectSession: (index: number) => void;
  hasSelection: () => boolean;
};

/** Terminal-local shortcuts. Do not copy VMark's IME gate without its paired
 * input owner: Auris leaves composition to xterm and never fires UI shortcuts
 * on composing/229 events. No arbitrary Shell/IPC behavior is added here. */
export function createNotesTerminalKeyHandler(actions: KeyActions, platform = getTerminalPlatform()) {
  return (event: KeyboardEvent) => {
    if (event.type !== "keydown" || event.isComposing || event.keyCode === 229) return true;
    const key = event.key.toLowerCase();
    const consume = (action: () => void) => {
      event.preventDefault();
      event.stopPropagation();
      action();
      return false;
    };
    if (event.altKey) return true;
    if (event.shiftKey && key === "insert") return consume(actions.paste);
    if (platform === "linux" && event.ctrlKey && key === "insert") return consume(actions.copy);
    if (platform === "macos" && event.ctrlKey && !event.metaKey) return true;
    if (!event.ctrlKey && !event.metaKey) return true;
    if (platform === "linux" && event.ctrlKey && !event.metaKey && !event.shiftKey && /^[abd-uw-z]$/i.test(key)) return true;
    switch (key) {
      case "c": return actions.hasSelection() ? consume(actions.copy) : true;
      case "v": return consume(actions.paste);
      case "k": return consume(actions.clear);
      case "a": return consume(actions.selectAll);
      case "f": return event.shiftKey && platform !== "linux" ? true : consume(actions.search);
      case "+":
      case "=": return consume(() => actions.zoom(2));
      case "-": return consume(() => actions.zoom(-2));
      case "0": return consume(() => actions.zoom(null));
      default:
        return /^[1-5]$/.test(key) ? consume(() => actions.selectSession(Number(key) - 1)) : true;
    }
  };
}

export function terminalTabGlyph(label: string, programTitle?: string | null) {
  if (!programTitle) return label.match(/^Terminal (\d+)$/)?.[1] ?? label.slice(0, 1).toUpperCase();
  const name = programTitle.trim();
  const first = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(name)[Symbol.iterator]().next().value;
  return first?.segment.toUpperCase() || "?";
}
