import type {
  NotesCommandContext,
  NotesCommandSurface,
} from "@/features/notes/commands/notes-command-bus";

export type NotesShortcutBinding = {
  commandId: string;
  key: string;
  surface: NotesCommandSurface;
  when?: (context: NotesCommandContext) => boolean;
};

export type NotesShortcutConflict = {
  bindings: NotesShortcutBinding[];
  key: string;
  surface: NotesCommandSurface;
};

function normalizeKeyPart(part: string) {
  const value = part.trim().toLowerCase();
  const aliases: Record<string, string> = {
    cmd: "mod",
    command: "mod",
    control: "ctrl",
    option: "alt",
  };
  return aliases[value] ?? value;
}

export function normalizeNotesShortcut(shortcut: string) {
  const parts = shortcut
    .split(/[+-]/)
    .map(normalizeKeyPart)
    .filter(Boolean);
  const key = parts.pop() ?? "";
  const modifiers = [...new Set(parts)].sort(
    (left, right) =>
      ["mod", "ctrl", "alt", "shift"].indexOf(left) -
      ["mod", "ctrl", "alt", "shift"].indexOf(right),
  );
  return [...modifiers, key].join("+");
}

export class NotesShortcutRegistry {
  private readonly bindings: NotesShortcutBinding[] = [];

  register(binding: NotesShortcutBinding) {
    const normalized = {
      ...binding,
      key: normalizeNotesShortcut(binding.key),
    };
    this.bindings.push(normalized);
    return () => {
      const index = this.bindings.indexOf(normalized);
      if (index >= 0) {
        this.bindings.splice(index, 1);
      }
    };
  }

  find(
    shortcut: string,
    context: NotesCommandContext,
  ): NotesShortcutBinding | null {
    const normalized = normalizeNotesShortcut(shortcut);

    return (
      [...this.bindings]
        .reverse()
        .find(
          (binding) =>
            binding.key === normalized &&
            binding.surface === context.activeSurface &&
            (binding.when?.(context) ?? true),
        ) ?? null
    );
  }

  getConflicts(context: NotesCommandContext): NotesShortcutConflict[] {
    const groups = new Map<string, NotesShortcutBinding[]>();

    this.bindings
      .filter((binding) => binding.when?.(context) ?? true)
      .forEach((binding) => {
        const key = `${binding.surface}:${binding.key}`;
        groups.set(key, [...(groups.get(key) ?? []), binding]);
      });

    return [...groups.values()]
      .filter(
        (bindings) =>
          new Set(bindings.map((binding) => binding.commandId)).size > 1,
      )
      .map((bindings) => ({
        bindings,
        key: bindings[0]?.key ?? "",
        surface: bindings[0]?.surface ?? "global",
      }));
  }

  list() {
    return [...this.bindings];
  }
}

export function shortcutFromKeyboardEvent(event: KeyboardEvent) {
  // Ctrl+Tab is a cross-platform tab-navigation chord, while ordinary Ctrl
  // shortcuts still map to Mod on Windows/Linux for existing bindings.
  const explicitCtrlTab =
    event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "tab";
  const modifiers = [
    explicitCtrlTab ? "ctrl" : event.metaKey || event.ctrlKey ? "mod" : "",
    event.altKey ? "alt" : "",
    event.shiftKey ? "shift" : "",
  ].filter(Boolean);
  return normalizeNotesShortcut([...modifiers, event.key].join("+"));
}
