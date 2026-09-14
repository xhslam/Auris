import { describe, expect, it, vi } from "vitest";
import {
  NotesCommandBus,
} from "@/features/notes/commands/notes-command-bus";
import {
  NotesShortcutRegistry,
  normalizeNotesShortcut,
} from "@/features/notes/commands/notes-shortcut-registry";

describe("NotesCommandBus", () => {
  it("registers and dispatches a command with its active surface", async () => {
    const handler = vi.fn();
    const bus = new NotesCommandBus();
    bus.register({ handler, id: "notes.save", title: "Save" });

    await expect(
      bus.execute("notes.save", { activeSurface: "codemirror" }),
    ).resolves.toBe(true);
    expect(handler).toHaveBeenCalledWith({ activeSurface: "codemirror" });
  });

  it("rejects duplicate command ids and reports missing commands", async () => {
    const bus = new NotesCommandBus();
    bus.register({ handler: () => true, id: "notes.save", title: "Save" });

    expect(() =>
      bus.register({ handler: () => true, id: "notes.save", title: "Again" }),
    ).toThrow("NOTES_COMMAND_ALREADY_REGISTERED:notes.save");
    await expect(
      bus.execute("notes.missing", { activeSurface: "global" }),
    ).resolves.toBe(false);
  });
});

describe("NotesShortcutRegistry", () => {
  it("normalizes aliases and resolves by active surface", () => {
    expect(normalizeNotesShortcut("Cmd+Shift+P")).toBe("mod+shift+p");
    const registry = new NotesShortcutRegistry();
    registry.register({
      commandId: "notes.palette",
      key: "CmdOrCtrl+Shift+P".replace("CmdOrCtrl", "Mod"),
      surface: "global",
    });
    registry.register({
      commandId: "terminal.palette",
      key: "Mod+Shift+P",
      surface: "terminal",
    });

    expect(
      registry.find("Mod+Shift+P", { activeSurface: "global" })?.commandId,
    ).toBe("notes.palette");
    expect(
      registry.find("Mod+Shift+P", { activeSurface: "terminal" })?.commandId,
    ).toBe("terminal.palette");
  });

  it("detects only conflicts in the same active layer", () => {
    const registry = new NotesShortcutRegistry();
    registry.register({
      commandId: "notes.find",
      key: "Mod+F",
      surface: "prosemirror",
    });
    registry.register({
      commandId: "notes.replace",
      key: "Mod+F",
      surface: "prosemirror",
    });
    registry.register({
      commandId: "source.find",
      key: "Mod+F",
      surface: "codemirror",
    });

    const conflicts = registry.getConflicts({
      activeSurface: "prosemirror",
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.surface).toBe("prosemirror");
  });
});
