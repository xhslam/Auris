/**
 * Platform-aware notes storage factory.
 *
 * This is the single call site that knows about all three runtimes.
 * Features layer code (local-notes-store.ts) stays platform-free;
 * components that need a storage instance import from here.
 *
 *   import { getNotesStorage } from "@/platform/notes/get-notes-storage";
 */

import { getBrowserNotesStorage } from "@/features/notes/local-notes-store";
import type { NotesStorage } from "@/features/notes/note-types";
import { getDesktopBridge } from "@/platform/desktop/desktop-runtime";
import { createDesktopVaultService } from "@/platform/desktop/vault-service";
import { createDesktopNotesStorage } from "@/platform/notes/desktop-notes-storage";
import { detectRuntime } from "@/platform/runtime";

let desktopStorage: NotesStorage | null = null;

/**
 * Returns the appropriate `NotesStorage` for the current runtime:
 *   - Desktop (Electron): IPC-backed vault via `desktopBridge`
 *   - Web / browser: File System Access API
 *   - SSR: null (no file access on the server)
 */
export function getNotesStorage(): NotesStorage | null {
  if (typeof window === "undefined") {
    return null;
  }

  const runtime = detectRuntime();

  if (runtime.isDesktopApp) {
    const desktopBridge = getDesktopBridge();

    if (!desktopBridge) {
      return null;
    }

    if (!desktopStorage) {
      desktopStorage = createDesktopNotesStorage(createDesktopVaultService(desktopBridge));
    }

    return desktopStorage;
  }

  return getBrowserNotesStorage();
}
