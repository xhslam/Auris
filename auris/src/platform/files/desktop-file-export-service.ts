"use client";

import type { DesktopBridge } from "@/platform/desktop/desktop-bridge";
import type { VaultExportManifest } from "@/features/notes/vault/vault-export-manifest";
import { getDesktopBridge } from "@/platform/desktop/desktop-runtime";

export type DesktopFileExportService = {
  exportJson: (filename: string, payload: unknown) => Promise<void>;
  exportPdf: (filename: string, html: string) => Promise<void>;
  exportText: (
    filename: string,
    content: string,
    contentType?: string,
  ) => Promise<void>;
  exportVaultFolder: (
    folderName: string,
    manifest: VaultExportManifest,
  ) => Promise<void>;
  kind: "desktop";
};

type CreateDesktopFileExportServiceOptions = {
  bridge?: DesktopBridge | null;
};

export function createDesktopFileExportService(
  options?: CreateDesktopFileExportServiceOptions,
): DesktopFileExportService {
  const bridge = options?.bridge ?? getDesktopBridge();

  if (!bridge) {
    throw new Error("DESKTOP_FILE_EXPORT_UNAVAILABLE");
  }

  return {
    kind: "desktop",
    async exportJson(filename: string, payload: unknown) {
      await bridge.downloads.exportJson(filename, payload);
    },
    async exportPdf(filename: string, html: string) {
      if (!bridge.downloads.exportPdf) {
        throw new Error("DESKTOP_PDF_EXPORT_UNAVAILABLE");
      }

      await bridge.downloads.exportPdf(filename, html);
    },
    async exportText(filename: string, content: string, contentType?: string) {
      if (!bridge.downloads.exportText) {
        throw new Error("DESKTOP_TEXT_EXPORT_UNAVAILABLE");
      }

      await bridge.downloads.exportText(filename, content, contentType);
    },
    async exportVaultFolder(folderName: string, manifest: VaultExportManifest) {
      if (!bridge.downloads.exportVaultFolder) {
        throw new Error("DESKTOP_VAULT_FOLDER_EXPORT_UNAVAILABLE");
      }

      await bridge.downloads.exportVaultFolder(folderName, manifest);
    },
  };
}
