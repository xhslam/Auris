import type { DesktopVaultService } from "@/platform/desktop/vault-service";
import type { VaultClient, VaultEntry } from "@/features/notes/vault/vault-types";
import { isHiddenVaultPath } from "@/features/notes/vault/vault-path";

export type DesktopVaultClient = VaultClient & {
  getDirectoryInfo: () => Promise<Awaited<ReturnType<DesktopVaultService["getDirectoryInfo"]>>>;
  openPluginsDirectory: () => Promise<void>;
  pickDirectory: () => Promise<Awaited<ReturnType<DesktopVaultService["pickDirectory"]>>>;
  pickFile?: () => Promise<Awaited<ReturnType<NonNullable<DesktopVaultService["pickFile"]>>>>;
};

function toVaultEntry(
  record: Awaited<ReturnType<DesktopVaultService["listFiles"]>>[number],
): VaultEntry {
  return {
    kind: record.isDirectory ? "directory" : "file",
    mtime: null,
    name: record.fileName,
    path: record.relativePath,
    size: null,
  };
}

export function createDesktopVaultClient(service: DesktopVaultService): DesktopVaultClient {
  const client: DesktopVaultClient = {
    async copyEntry(fromPath: string, toPath: string) {
      await service.copyEntry(fromPath, toPath);
    },
    async createDirectory(path: string) {
      await service.createDirectory(path);
    },
    async deleteEntry(path: string) {
      await service.removeMarkdownFile(path);
    },
    async getDirectoryInfo() {
      const info = await service.getDirectoryInfo();
      client.rootPath = info.vaultPath ?? null;
      return info;
    },
    async listEntries() {
      return (await service.listFiles())
        .map(toVaultEntry)
        .filter((entry) => !isHiddenVaultPath(entry.path));
    },
    async moveEntry(fromPath: string, toPath: string) {
      await service.moveMarkdownFile(fromPath, toPath);
    },
    async openPluginsDirectory() {
      await service.openPluginsDirectory();
    },
    async pickDirectory() {
      const info = await service.pickDirectory();
      client.rootPath = info.vaultPath ?? null;
      return info;
    },
    async pickFile() {
      if (!service.pickFile) {
        throw new Error("DESKTOP_VAULT_CAPABILITY_UNAVAILABLE:pickFile");
      }
      const selection = await service.pickFile();
      client.rootPath = selection.directoryInfo.vaultPath ?? null;
      return selection;
    },
    async readFile(path: string) {
      return service.readMarkdownFile(path);
    },
    async renameEntry(fromPath: string, toPath: string) {
      await service.renameMarkdownFile(fromPath, toPath);
    },
    async restoreLastDeletedEntry() {
      return service.restoreLastDeletedEntry();
    },
    async revealEntry(path: string) {
      await service.revealEntry(path);
    },
    rootPath: null,
    subscribeToChanges(listener: () => void) {
      return service.subscribeToChanges(listener);
    },
    async writeFile(path: string, content: string) {
      await service.saveMarkdownFile(path, content);
    },
  };

  return client;
}
