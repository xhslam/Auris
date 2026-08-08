import type {
  DesktopBridge,
  DesktopPluginRecord,
  DesktopVaultDirectoryInfo,
  DesktopVaultFileRecord,
} from "@/platform/desktop/desktop-bridge";
import type { NotesDirectoryInfo } from "@/features/notes/note-types";

export type DesktopVaultService = {
  copyEntry: (fromPath: string, toPath: string) => Promise<void>;
  createDirectory: (relativePath: string) => Promise<void>;
  getDirectoryInfo: () => Promise<NotesDirectoryInfo>;
  listFiles: () => Promise<DesktopVaultFileRecord[]>;
  listMarkdownFiles: () => Promise<DesktopVaultFileRecord[]>;
  moveMarkdownFile: (fromPath: string, toPath: string) => Promise<void>;
  openPluginsDirectory: () => Promise<void>;
  pickDirectory: () => Promise<NotesDirectoryInfo>;
  pickFile?: () => Promise<{ directoryInfo: NotesDirectoryInfo; selectedFilePath: string | null }>;
  readMarkdownFile: (relativePath: string) => Promise<string | null>;
  renameMarkdownFile: (fromPath: string, toPath: string) => Promise<void>;
  removeMarkdownFile: (relativePath: string) => Promise<void>;
  restoreLastDeletedEntry: () => Promise<string | null>;
  revealEntry: (relativePath: string) => Promise<void>;
  saveMarkdownFile: (relativePath: string, content: string) => Promise<void>;
  subscribeToChanges: (listener: () => void) => () => void;
};

function toNotesDirectoryInfo(directoryInfo: DesktopVaultDirectoryInfo): NotesDirectoryInfo {
  return {
    directoryName: directoryInfo.directoryName,
    isConfigured: directoryInfo.hasVault,
    isDesktopVault: directoryInfo.hasVault,
    isSupported: true,
    pluginDirectory: directoryInfo.pluginDirectory,
    vaultPath: directoryInfo.vaultPath,
  };
}

function sortFiles(files: DesktopVaultFileRecord[]) {
  return [...files].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function isMarkdownFile(record: DesktopVaultFileRecord) {
  return record.fileName.toLowerCase().endsWith(".md");
}

function requireVaultCapability<T>(
  capability: T | undefined,
  capabilityName: string,
): T {
  if (!capability) {
    throw new Error(`DESKTOP_VAULT_CAPABILITY_UNAVAILABLE:${capabilityName}`);
  }

  return capability;
}

export function createDesktopVaultService(bridge: DesktopBridge): DesktopVaultService {
  async function listFiles() {
    return sortFiles(await bridge.vault.listFiles());
  }

  const filePicker = bridge.vault.pickFile
    ? {
        async pickFile() {
          const selection = await bridge.vault.pickFile!();
          return {
            directoryInfo: toNotesDirectoryInfo(selection),
            selectedFilePath: selection.selectedFilePath,
          };
        },
      }
    : {};

  return {
    async copyEntry(fromPath: string, toPath: string) {
      await requireVaultCapability(bridge.vault.copyFile, "copyFile")(
        fromPath,
        toPath,
      );
    },
    async createDirectory(relativePath: string) {
      await requireVaultCapability(bridge.vault.createDirectory, "createDirectory")(relativePath);
    },
    async getDirectoryInfo() {
      return toNotesDirectoryInfo(await bridge.vault.getDirectoryInfo());
    },
    listFiles,
    async listMarkdownFiles() {
      const files = await listFiles();
      return sortFiles(files.filter(isMarkdownFile));
    },
    async moveMarkdownFile(fromPath: string, toPath: string) {
      await requireVaultCapability(bridge.vault.moveFile, "moveFile")(fromPath, toPath);
    },
    async openPluginsDirectory() {
      await bridge.vault.revealPluginsDirectory();
    },
    async pickDirectory() {
      return toNotesDirectoryInfo(await bridge.vault.pickDirectory());
    },
    ...filePicker,
    async readMarkdownFile(relativePath: string) {
      return bridge.vault.readFile(relativePath);
    },
    async renameMarkdownFile(fromPath: string, toPath: string) {
      await requireVaultCapability(bridge.vault.renameFile, "renameFile")(fromPath, toPath);
    },
    async removeMarkdownFile(relativePath: string) {
      await bridge.vault.removeFile(relativePath);
    },
    async restoreLastDeletedEntry() {
      return requireVaultCapability(
        bridge.vault.restoreLastDeleted,
        "restoreLastDeleted",
      )();
    },
    async revealEntry(relativePath: string) {
      await requireVaultCapability(bridge.vault.revealFile, "revealFile")(
        relativePath,
      );
    },
    async saveMarkdownFile(relativePath: string, content: string) {
      await bridge.vault.saveFile(relativePath, content);
    },
    subscribeToChanges(listener: () => void) {
      return bridge.vault.onDidChange(listener);
    },
  };
}

export type DesktopPluginService = {
  listPlugins: () => Promise<DesktopPluginRecord[]>;
  openPluginsDirectory: () => Promise<void>;
  setPluginEnabled: (pluginId: string, enabled: boolean) => Promise<DesktopPluginRecord[]>;
};

export function createDesktopPluginService(bridge: DesktopBridge): DesktopPluginService {
  return {
    async listPlugins() {
      return bridge.plugins.list();
    },
    async openPluginsDirectory() {
      await bridge.plugins.openDirectory();
    },
    async setPluginEnabled(pluginId: string, enabled: boolean) {
      return bridge.plugins.setEnabled(pluginId, enabled);
    },
  };
}
