export type NotesCommandSurface =
  | "codemirror"
  | "global"
  | "prosemirror"
  | "terminal";

export type NotesCommandContext = {
  activeSurface: NotesCommandSurface;
  editorMode?: "source" | "split" | "wysiwyg";
  hasActiveDocument?: boolean;
};

export type NotesCommandHandler = (
  context: NotesCommandContext,
) => boolean | void | Promise<boolean | void>;

export type NotesCommandDefinition = {
  id: string;
  title: string;
  handler: NotesCommandHandler;
};

export class NotesCommandBus {
  private readonly commands = new Map<string, NotesCommandDefinition>();

  register(definition: NotesCommandDefinition) {
    if (this.commands.has(definition.id)) {
      throw new Error(`NOTES_COMMAND_ALREADY_REGISTERED:${definition.id}`);
    }

    this.commands.set(definition.id, definition);
    return () => this.commands.delete(definition.id);
  }

  has(commandId: string) {
    return this.commands.has(commandId);
  }

  list() {
    return [...this.commands.values()];
  }

  async execute(commandId: string, context: NotesCommandContext) {
    const command = this.commands.get(commandId);

    if (!command) {
      return false;
    }

    return (await command.handler(context)) !== false;
  }
}
