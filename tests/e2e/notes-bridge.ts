import type { Page } from "@playwright/test";
import type {
  AppRuntimeState,
  AppWorkspaceId,
  DesktopRuntimeState,
} from "@/features/app-runtime/app-runtime.types";

export async function installLocalNotesBridge(page: Page) {
  await page.addInitScript(() => {
    const runtimeStateStorageKey = "__desktopRuntimeState";
    const vaultFiles = new Map<string, string>([
      [
        "notes/rhythm-drill.md",
        "# Rhythm Drill\n\nRepeat the rhythm phrase until the stress pattern feels natural.\n",
      ],
      [
        "notes/pronunciation-sprint.md",
        "# Pronunciation Sprint\n\nFocus on connected speech and consonant release in longer phrases.\n",
      ],
    ]);
    let vaultListeners: Array<() => void> = [];

    function listVaultFiles() {
      return [...vaultFiles.keys()].map((relativePath) => ({
        absolutePath: `C:/vault/${relativePath}`,
        fileName: relativePath.split("/").at(-1) ?? relativePath,
        relativePath,
      }));
    }

    function notifyVaultChanged() {
      vaultListeners.forEach((listener) => listener());
    }

    const defaultRuntimeState: DesktopRuntimeState = {
      aiDock: {
        activeProvider: "gemini",
        activeView: "provider",
        isOpen: false,
        panelWidth: 420,
      },
      legacyRuntimeMigratedAt: null,
      lastRoute: "/notes",
      lastVisitedAt: null,
      lastWorkspace: "notes",
      primaryResumeId: null,
      primaryResumeType: null,
      updatedAt: null,
      windowBounds: null,
    };

    function readRuntimeState(): DesktopRuntimeState {
      const rawValue = window.localStorage.getItem(runtimeStateStorageKey);

      if (!rawValue) {
        return defaultRuntimeState;
      }

      try {
        return JSON.parse(rawValue) as DesktopRuntimeState;
      } catch {
        return defaultRuntimeState;
      }
    }

    function writeRuntimeState(nextState: DesktopRuntimeState) {
      window.localStorage.setItem(runtimeStateStorageKey, JSON.stringify(nextState));
      return nextState;
    }

    (
      window as Window & {
        __notesHarness?: {
          getFile: (relativePath: string) => string | null;
          listFiles: () => string[];
          replaceFile: (relativePath: string, content: string) => void;
        };
      }
    ).__notesHarness = {
      getFile(relativePath: string) {
        return vaultFiles.get(relativePath) ?? null;
      },
      listFiles() {
        return [...vaultFiles.keys()];
      },
      replaceFile(relativePath: string, content: string) {
        vaultFiles.set(relativePath, content);
        notifyVaultChanged();
      },
    };

    window.shadowingDesktop = {
      commands: {
        list: async () => [{ id: "notes.refresh", title: "Refresh vault" }],
        run: async () => ({ executed: true }),
      },
      downloads: {
        exportJson: async (filename: string) => ({
          path: `C:/Users/test/Downloads/${filename}`,
        }),
        getDirectoryInfo: async () => ({
          directoryPath: "C:/Users/test/Downloads",
        }),
        revealDirectory: async () => undefined,
      },
      plugins: {
        list: async () => [],
        openDirectory: async () => undefined,
        setEnabled: async () => [],
      },
      runtimeState: {
        get: async () => readRuntimeState(),
        importLegacy: async (legacyState: AppRuntimeState) =>
          writeRuntimeState({
            ...readRuntimeState(),
            ...legacyState,
            legacyRuntimeMigratedAt: "2026-03-26T00:00:00.000Z",
            updatedAt: "2026-03-26T00:00:00.000Z",
          }),
        setLastWorkspace: async (workspace: AppWorkspaceId) =>
          writeRuntimeState({
            ...readRuntimeState(),
            lastRoute:
              workspace === "home"
                ? "/"
                : workspace === "workspace"
                  ? "/notes"
                  : `/${workspace}`,
            lastVisitedAt: "2026-03-26T00:00:00.000Z",
            lastWorkspace: workspace,
            updatedAt: "2026-03-26T00:00:00.000Z",
          }),
      },
      system: {
        openUpgrade: async () => ({
          didOpen: true,
          targetUrl: "https://updates.example.com",
        }),
      },
      voiceEngine: {
        generate: async () => ({
          audioBase64: "",
          contentType: "audio/wav",
          durationMs: 0,
          transcriptWords: [],
        }),
        getCapabilities: async () => ({
          locales: ["en-US"],
          modes: ["preset"],
          supportsReferenceAudio: false,
          supportsStylePrompt: false,
        }),
        getStatus: async () => ({
          activeProvider: "windows",
          platform: "darwin",
          reason: null,
          state: "ready",
        }),
        start: async () => ({
          activeProvider: "windows",
          platform: "darwin",
          reason: null,
          state: "ready",
        }),
        stop: async () => ({
          activeProvider: "windows",
          platform: "darwin",
          reason: null,
          state: "ready",
        }),
      },
      vault: {
        createDirectory: async () => undefined,
        getDirectoryInfo: async () => ({
          directoryName: "English Vault",
          hasVault: true,
          pluginDirectory: "C:/vault/.shadowing/plugins",
          vaultPath: "C:/vault",
        }),
        listFiles: async () => listVaultFiles(),
        moveFile: async (fromPath: string, toPath: string) => {
          const content = vaultFiles.get(fromPath);
          if (content) {
            vaultFiles.delete(fromPath);
            vaultFiles.set(toPath, content);
            notifyVaultChanged();
          }
        },
        onDidChange: (listener: () => void) => {
          vaultListeners.push(listener);

          return () => {
            vaultListeners = vaultListeners.filter((entry) => entry !== listener);
          };
        },
        pickDirectory: async () => ({
          directoryName: "English Vault",
          hasVault: true,
          pluginDirectory: "C:/vault/.shadowing/plugins",
          vaultPath: "C:/vault",
        }),
        readFile: async (relativePath: string) => vaultFiles.get(relativePath) ?? null,
        removeFile: async (relativePath: string) => {
          vaultFiles.delete(relativePath);
          notifyVaultChanged();
        },
        renameFile: async (fromPath: string, toPath: string) => {
          const content = vaultFiles.get(fromPath);
          if (content) {
            vaultFiles.delete(fromPath);
            vaultFiles.set(toPath, content);
            notifyVaultChanged();
          }
        },
        revealPluginsDirectory: async () => undefined,
        saveFile: async (relativePath: string, content: string) => {
          vaultFiles.set(relativePath, content);
          notifyVaultChanged();
        },
      },
      window: {
        showInFolder: async () => undefined,
      },
    };
  });
}
