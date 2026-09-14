import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import type {
  DesktopCommandRecord,
  DesktopCommandRunResult,
  DesktopPluginRecord,
} from "@/platform/desktop/desktop-bridge";
import {
  createPluginApi,
  type PluginApi,
  type PluginCommandDefinition,
} from "@/features/plugins/plugin-api";
import {
  parsePluginManifestJson,
  type PluginManifest,
} from "@/features/plugins/plugin-manifest";

type PluginActivator = (api: PluginApi) => Promise<unknown> | unknown;
type PluginCleanup = (() => Promise<void> | void) | null;

type PluginHostInput = {
  loadEnabledState: () => Promise<Record<string, boolean>>;
  pluginsDirectory: string;
  saveEnabledState: (nextState: Record<string, boolean>) => Promise<void>;
};

type RegisteredPluginCommand = PluginCommandDefinition & {
  pluginId: string;
};

type ActivePluginState = {
  cleanup: PluginCleanup;
};

export type PluginHost = {
  listCommands: () => DesktopCommandRecord[];
  listPlugins: () => DesktopPluginRecord[];
  reload: () => Promise<void>;
  runCommand: (commandId: string) => Promise<DesktopCommandRunResult>;
  setPluginEnabled: (pluginId: string, enabled: boolean) => Promise<DesktopPluginRecord[]>;
};

function sortCommands(commands: DesktopCommandRecord[]) {
  return [...commands].sort((left, right) => left.title.localeCompare(right.title));
}

function sortPlugins(plugins: DesktopPluginRecord[]) {
  return [...plugins].sort((left, right) => left.manifest.name.localeCompare(right.manifest.name));
}

function toPluginErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown plugin error.";
}

function createFallbackPluginRecord(
  directoryName: string,
  entryPath: string | null,
  errorMessage: string,
): DesktopPluginRecord {
  return {
    enabled: true,
    entryPath,
    errorMessage,
    manifest: {
      id: directoryName,
      name: directoryName,
      version: "0.0.0",
    },
  };
}

async function listPluginDirectories(pluginsDirectory: string) {
  await fs.mkdir(pluginsDirectory, { recursive: true });
  const entries = await fs.readdir(pluginsDirectory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      directoryName: entry.name,
      directoryPath: path.join(pluginsDirectory, entry.name),
    }))
    .sort((left, right) => left.directoryName.localeCompare(right.directoryName));
}

function resolvePluginActivator(moduleExports: Record<string, unknown>): PluginActivator {
  const candidate =
    typeof moduleExports.default === "function"
      ? moduleExports.default
      : typeof moduleExports.activate === "function"
        ? moduleExports.activate
        : typeof moduleExports === "function"
          ? moduleExports
          : null;

  if (!candidate) {
    throw new Error("Plugin entry must export an activate(api) function.");
  }

  return candidate as PluginActivator;
}

function normalizeCleanup(cleanup: unknown): PluginCleanup {
  if (typeof cleanup === "function") {
    return cleanup as () => Promise<void> | void;
  }

  if (
    cleanup &&
    typeof cleanup === "object" &&
    "dispose" in cleanup &&
    typeof cleanup.dispose === "function"
  ) {
    const disposable = cleanup as {
      dispose: () => Promise<void> | void;
    };

    return () => disposable.dispose();
  }

  return null;
}

async function loadPluginModule(entryPath: string) {
  const pluginRequire = createRequire(import.meta.url);
  return pluginRequire(entryPath) as Record<string, unknown>;
}

export function createPluginHost({
  loadEnabledState,
  pluginsDirectory,
  saveEnabledState,
}: PluginHostInput): PluginHost {
  const commandRegistry = new Map<string, RegisteredPluginCommand>();
  const activePlugins = new Map<string, ActivePluginState>();
  let pluginRecords: DesktopPluginRecord[] = [];
  let enabledState: Record<string, boolean> = {};

  async function clearActivePlugins() {
    const cleanups = [...activePlugins.values()].map((plugin) => plugin.cleanup).filter(Boolean);

    activePlugins.clear();
    commandRegistry.clear();

    for (const cleanup of cleanups) {
      await cleanup?.();
    }
  }

  async function activatePlugin(manifest: PluginManifest) {
    const pendingCommands = new Map<string, PluginCommandDefinition>();
    const api = createPluginApi({
      registerCommand(command) {
        if (pendingCommands.has(command.id) || commandRegistry.has(command.id)) {
          throw new Error(`Duplicate plugin command id: ${command.id}`);
        }

        pendingCommands.set(command.id, command);
      },
    });

    const pluginModule = await loadPluginModule(manifest.entryPath);
    const activate = resolvePluginActivator(pluginModule as Record<string, unknown>);
    const activationResult = await activate(api);

    for (const command of pendingCommands.values()) {
      commandRegistry.set(command.id, {
        ...command,
        pluginId: manifest.id,
      });
    }

    activePlugins.set(manifest.id, {
      cleanup: normalizeCleanup(activationResult),
    });
  }

  async function readPluginRecord(
    directoryName: string,
    directoryPath: string,
  ): Promise<DesktopPluginRecord> {
    const manifestPath = path.join(directoryPath, "manifest.json");

    try {
      const manifestJson = await fs.readFile(manifestPath, "utf8");
      const manifest = parsePluginManifestJson(manifestJson, directoryPath);
      const isEnabled = enabledState[manifest.id] ?? true;

      if (!isEnabled) {
        return {
          enabled: false,
          entryPath: manifest.entryPath,
          errorMessage: null,
          manifest,
        };
      }

      try {
        await activatePlugin(manifest);

        return {
          enabled: true,
          entryPath: manifest.entryPath,
          errorMessage: null,
          manifest,
        };
      } catch (error) {
        return {
          enabled: true,
          entryPath: manifest.entryPath,
          errorMessage: toPluginErrorMessage(error),
          manifest,
        };
      }
    } catch (error) {
      return createFallbackPluginRecord(directoryName, manifestPath, toPluginErrorMessage(error));
    }
  }

  async function reload() {
    const persistedState = await loadEnabledState();
    enabledState = {
      ...persistedState,
      ...enabledState,
    };
    await clearActivePlugins();

    const pluginDirectories = await listPluginDirectories(pluginsDirectory);
    const nextPluginRecords = await Promise.all(
      pluginDirectories.map((pluginDirectory) =>
        readPluginRecord(pluginDirectory.directoryName, pluginDirectory.directoryPath),
      ),
    );

    pluginRecords = sortPlugins(nextPluginRecords);
  }

  return {
    listCommands() {
      return sortCommands(
        [...commandRegistry.values()].map((command) => ({
          id: command.id,
          title: command.title,
        })),
      );
    },
    listPlugins() {
      return [...pluginRecords];
    },
    async reload() {
      await reload();
    },
    async runCommand(commandId: string) {
      const command = commandRegistry.get(commandId);

      if (!command) {
        return { executed: false };
      }

      await command.run();
      return { executed: true };
    },
    async setPluginEnabled(pluginId: string, enabled: boolean) {
      enabledState = {
        ...enabledState,
        [pluginId]: enabled,
      };
      await saveEnabledState(enabledState);
      await reload();
      return [...pluginRecords];
    },
  };
}
