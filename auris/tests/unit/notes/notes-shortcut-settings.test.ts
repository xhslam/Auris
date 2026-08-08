import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultNotesShortcutRegistry,
} from "@/features/notes/commands/notes-command-catalog";
import {
  loadNotesShortcutOverrides,
  NOTES_SHORTCUTS_EVENT,
  parseNotesShortcutSettings,
  saveNotesShortcutOverrides,
  serializeNotesShortcutSettings,
  validateNotesShortcut,
} from "@/features/notes/commands/notes-shortcut-settings";

describe("notes shortcut settings", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("normalizes valid shortcuts and rejects modifier-only input", () => {
    expect(validateNotesShortcut("Cmd + Shift + K")).toBe("mod+shift+k");
    expect(validateNotesShortcut("Mod+Shift")).toBeNull();
    expect(validateNotesShortcut("")).toBeNull();
  });

  it("persists a versioned payload and broadcasts live changes", () => {
    const listener = vi.fn();
    window.addEventListener(NOTES_SHORTCUTS_EVENT, listener);

    const saved = saveNotesShortcutOverrides({
      "global:notes.save": "Cmd+Alt+S",
      "global:notes.split": "Mod",
    });

    expect(saved).toEqual({
      "global:notes.save": "mod+alt+s",
    });
    expect(loadNotesShortcutOverrides()).toEqual(saved);
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(NOTES_SHORTCUTS_EVENT, listener);
  });

  it("applies overrides to the live command registry", () => {
    const registry = createDefaultNotesShortcutRegistry({
      "global:notes.save": "mod+alt+s",
    });

    expect(
      registry.find("Mod+Alt+S", { activeSurface: "global" })?.commandId,
    ).toBe("notes.save");
    expect(
      registry.find("Mod+S", { activeSurface: "global" }),
    ).toBeNull();
  });

  it("imports and exports only schema-versioned shortcut data", () => {
    const source = serializeNotesShortcutSettings({
      "global:notes.palette": "mod+shift+p",
    });

    expect(parseNotesShortcutSettings(JSON.parse(source))).toEqual({
      "global:notes.palette": "mod+shift+p",
    });
    expect(
      parseNotesShortcutSettings({
        overrides: { "global:notes.palette": "mod+k" },
        schemaVersion: 2,
      }),
    ).toEqual({});
  });
});
