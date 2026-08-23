import { describe, expect, it } from "vitest";
import { createDefaultNotesShortcutRegistry } from "@/features/notes/commands/notes-command-catalog";
import { shortcutFromKeyboardEvent } from "@/features/notes/commands/notes-shortcut-registry";

describe("notes editor mode shortcuts", () => {
  const context = {
    activeSurface: "global" as const,
    editorMode: "wysiwyg" as const,
    hasActiveDocument: true,
  };

  it("keeps VMark-style source and split mode shortcuts discoverable", () => {
    const shortcuts = createDefaultNotesShortcutRegistry();
    expect(shortcuts.find("F6", context)?.commandId).toBe("notes.source");
    expect(shortcuts.find("Shift+F6", context)?.commandId).toBe("notes.split");
    expect(shortcuts.find("Mod+\\", context)?.commandId).toBe("notes.split");
  });

  it("registers Ctrl+Tab as last-used navigation without a Mod conflict", () => {
    const shortcuts = createDefaultNotesShortcutRegistry();
    expect(shortcuts.find("Ctrl+Tab", context)?.commandId).toBe(
      "notes.lastUsedTab",
    );
    expect(shortcuts.find("Mod+Tab", context)).toBeNull();
    expect(
      shortcutFromKeyboardEvent(new KeyboardEvent("keydown", { key: "Tab", ctrlKey: true })),
    ).toBe("ctrl+tab");
  });
});
