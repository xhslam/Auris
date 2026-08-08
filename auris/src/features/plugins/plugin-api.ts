export type PluginCommandDefinition = {
  id: string;
  run: () => Promise<void> | void;
  title: string;
};

export type PluginApi = {
  registerCommand: (command: PluginCommandDefinition) => void;
};

type CreatePluginApiInput = {
  registerCommand: (command: PluginCommandDefinition) => void;
};

export function createPluginApi({ registerCommand }: CreatePluginApiInput): PluginApi {
  return {
    registerCommand(command) {
      registerCommand(command);
    },
  };
}
