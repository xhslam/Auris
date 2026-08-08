/**
 * Platform-aware VaultClient factory, for code that needs raw file
 * read/write access to the vault root (not the page-level NotesStorage API).
 *
 *   import { getVaultClient } from "@/platform/notes/get-vault-client";
 */

import { createBrowserVaultClient } from "@/features/notes/vault/browser-vault-client";
import type { VaultClient } from "@/features/notes/vault/vault-types";
import { getDesktopBridge } from "@/platform/desktop/desktop-runtime";
import { createDesktopVaultClient } from "@/platform/desktop/vault-client";
import { createDesktopVaultService } from "@/platform/desktop/vault-service";
import { detectRuntime } from "@/platform/runtime";

let desktopClient: VaultClient | null = null;
let browserClient: VaultClient | null = null;

export function getVaultClient(): VaultClient | null {
  if (typeof window === "undefined") {
    return null;
  }

  const runtime = detectRuntime();

  if (runtime.isDesktopApp) {
    const desktopBridge = getDesktopBridge();

    if (!desktopBridge) {
      return null;
    }

    if (!desktopClient) {
      desktopClient = createDesktopVaultClient(createDesktopVaultService(desktopBridge));
    }

    return desktopClient;
  }

  if (!browserClient) {
    browserClient = createBrowserVaultClient();
  }

  return browserClient;
}
