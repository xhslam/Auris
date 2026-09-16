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
  { commandId: "notes.lastUsedTab", key: "Ctrl+Tab", surface: "global" },
  // Mod+J 而不是 vmark 的 Cmd+Y：全局绑定会回落进编辑器 surface，而
  // CodeMirror 的默认 keymap 在 Windows/Linux 上把 `Mod-y` 绑给了 redo
  // （mac 上是 Mod-Shift-z，所以 vmark 用 Cmd+Y 不出问题）。在源码编辑器里
  // 按下去会同时重做一次并打开选择器。Mod+J 在两套 keymap 里都空着。
  { commandId: "notes.niaPicker", key: "Mod+J", surface: "global" },
  { commandId: "notes.source", key: "F6", surface: "global" },
  { commandId: "notes.source", key: "F6", surface: "codemirror" },
  { commandId: "notes.source", key: "F6", surface: "prosemirror" },
  { commandId: "notes.split", key: "Shift+F6", surface: "global" },
  { commandId: "notes.split", key: "Shift+F6", surface: "codemirror" },
  { commandId: "notes.split", key: "Shift+F6", surface: "prosemirror" },
  { commandId: "notes.split", key: "Mod+\\", surface: "global" },
  { commandId: "notes.split", key: "Mod+\\", surface: "codemirror" },
  { commandId: "notes.split", key: "Mod+\\", surface: "prosemirror" },
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
