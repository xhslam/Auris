import {
  formatVaultExportValidationIssues,
  validateVaultExportManifest,
} from "@/features/notes/vault/vault-export-validation";
import type { VaultExportManifest } from "@/features/notes/vault/vault-export-manifest";

export type VaultExportFileContent = string | Uint8Array;

export type VaultExportFolderReader = {
  readFile: (path: string) => Promise<VaultExportFileContent | null>;
};

export type VaultExportFolderWriter = {
  createDirectory?: (path: string) => Promise<void>;
  writeFile: (path: string, content: VaultExportFileContent) => Promise<void>;
};

export type VaultExportRestoreResult = {
  restoredPaths: string[];
};

function getParentDirectory(path: string) {
  const normalizedPath = path.replace(/\\/g, "/");
  const lastSlashIndex = normalizedPath.lastIndexOf("/");

  return lastSlashIndex > 0 ? normalizedPath.slice(0, lastSlashIndex) : null;
}

export async function restoreVaultExportFolder(
  manifest: VaultExportManifest,
  source: VaultExportFolderReader,
  target: VaultExportFolderWriter,
): Promise<VaultExportRestoreResult> {
  const validation = validateVaultExportManifest(manifest);

  if (!validation.valid) {
    throw new Error(formatVaultExportValidationIssues(validation.issues));
  }

  const restoredPaths: string[] = [];

  for (const file of manifest.files) {
    if (file.kind !== "file") {
      continue;
    }

    const content = await source.readFile(file.path);

    if (content === null) {
      throw new Error(`导出文件缺失：${file.path}`);
    }

    const parentDirectory = getParentDirectory(file.path);

    if (parentDirectory) {
      await target.createDirectory?.(parentDirectory);
    }

    await target.writeFile(file.path, content);
    restoredPaths.push(file.path);
  }

  return { restoredPaths };
}
