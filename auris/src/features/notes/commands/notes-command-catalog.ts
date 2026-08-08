import {
  NotesShortcutRegistry,
  type NotesShortcutBinding,
} from "@/features/notes/commands/notes-shortcut-registry";
import {
  applyNotesShortcutOverrides,
  type NotesShortcutOverrides,
} from "@/features/notes/commands/notes-shortcut-settings";

export const NOTES_SHORTCUT_BINDINGS: readonly NotesShortcutBinding[] = [
  { commandId: "notes.save", key: "Mod+S", surface: "global" },
  { commandId: "notes.saveAll", key: "Mod+Shift+S", surface: "global" },
  { commandId: "notes.palette", key: "Mod+P", surface: "global" },
  { commandId: "notes.split", key: "Mod+\\", surface: "global" },
  { commandId: "notes.terminal", key: "Mod+`", surface: "global" },
  { commandId: "notes.find", key: "Mod+F", surface: "codemirror" },
  { commandId: "notes.find", key: "Mod+F", surface: "prosemirror" },
  { commandId: "notes.bold", key: "Mod+B", surface: "codemirror" },
  { commandId: "notes.bold", key: "Mod+B", surface: "prosemirror" },
  { commandId: "terminal.find", key: "Mod+F", surface: "terminal" },
] as const;

export function createDefaultNotesShortcutRegistry(
  overrides: NotesShortcutOverrides = {},
) {
  const registry = new NotesShortcutRegistry();
  applyNotesShortcutOverrides(NOTES_SHORTCUT_BINDINGS, overrides).forEach(
    (binding) => registry.register(binding),
  );
  return registry;
}
