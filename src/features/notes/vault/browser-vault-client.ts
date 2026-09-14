import {
  loadDirectoryHandle,
  saveDirectoryHandle,
  verifyDirectoryPermission,
} from "@/features/notes/file-system-access";
import {
  ensureMarkdownPath,
  isHiddenVaultPath,
  normalizeVaultPath,
} from "@/features/notes/vault/vault-path";
import type { VaultClient, VaultEntry } from "@/features/notes/vault/vault-types";

const DEFAULT_BROWSER_NOTE = `# Welcome\n\n- This browser vault is a graceful fallback for notes.\n- Markdown files remain the source of truth.\n`;
const DEFAULT_BROWSER_NOTE_PATH = "Welcome.md";
const BROWSER_VAULT_STORAGE_KEY = "shadowing-browser-vault-v2";

type BrowserVaultDirectoryInfo = {
  directoryName: string | null;
  isConfigured: boolean;
  isSupported: boolean;
  vaultPath: string | null;
};

type IterableDirectoryHandle = FileSystemDirectoryHandle & {
  removeEntry: (name: string, options?: { recursive?: boolean }) => Promise<void>;
  values: () => AsyncIterable<FileSystemHandle>;
};

type DirectoryPickerWindow = Window &
  typeof globalThis & {
    showDirectoryPicker: (options?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
  };

type FileHandle = FileSystemHandle & {
  getFile: () => Promise<File>;
  name: string;
};

type BrowserVaultFileRecord = {
  content: string;
  mtime: string;
};

type BrowserVaultDirectoryRecord = {
  mtime: string;
};

type BrowserVaultState = {
  directories: Record<string, BrowserVaultDirectoryRecord>;
  files: Record<string, BrowserVaultFileRecord>;
};

export type BrowserVaultClient = VaultClient & {
  getDirectoryInfo: () => Promise<BrowserVaultDirectoryInfo>;
  pickDirectory: () => Promise<BrowserVaultDirectoryInfo>;
};

function getDefaultVaultState(): BrowserVaultState {
  const now = new Date().toISOString();

  return {
    directories: {},
    files: {
      [DEFAULT_BROWSER_NOTE_PATH]: {
        content: DEFAULT_BROWSER_NOTE,
        mtime: now,
      },
    },
  };
}

function isFileSystemAccessSupported() {
  return (
    typeof window !== "undefined" &&
    "indexedDB" in window &&
    "showDirectoryPicker" in window
  );
}

function toDirectoryInfo(handle: FileSystemDirectoryHandle | null): BrowserVaultDirectoryInfo {
  return {
    directoryName: handle?.name ?? "Browser Vault",
    isConfigured: handle !== null || typeof window !== "undefined",
    isSupported: true,
    vaultPath: handle ? `browser-fsa://${handle.name}` : "browser://vault",
  };
}

function readStoredState(storage: Storage | null) {
  if (!storage) {
    return getDefaultVaultState();
  }

  const raw = storage.getItem(BROWSER_VAULT_STORAGE_KEY);

  if (!raw) {
    const fallback = getDefaultVaultState();
    storage.setItem(BROWSER_VAULT_STORAGE_KEY, JSON.stringify(fallback));
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as BrowserVaultState;

    if (!parsed.files || typeof parsed.files !== "object") {
      return getDefaultVaultState();
    }

    return {
      directories:
        parsed.directories && typeof parsed.directories === "object"
          ? parsed.directories
          : {},
      files: parsed.files,
    };
  } catch {
    return getDefaultVaultState();
  }
}

function writeStoredState(storage: Storage | null, state: BrowserVaultState) {
  if (!storage) {
    return;
  }

  storage.setItem(BROWSER_VAULT_STORAGE_KEY, JSON.stringify(state));
}

function normalizeStoragePath(path: string) {
  return ensureMarkdownPath(normalizeVaultPath(path));
}

function collectDirectoryPaths(path: string) {
  const segments = normalizeVaultPath(path).split("/").filter(Boolean);

  return segments.map((_segment, index) => segments.slice(0, index + 1).join("/"));
}

function isPathOrChild(path: string, targetPath: string) {
  return path === targetPath || path.startsWith(`${targetPath}/`);
}

function renamePathPrefix(path: string, fromPath: string, toPath: string) {
  if (path === fromPath) {
    return toPath;
  }

  if (path.startsWith(`${fromPath}/`)) {
    return `${toPath}/${path.slice(fromPath.length + 1)}`;
  }

  return path;
}

function addDirectoryWithParents(
  directories: Record<string, BrowserVaultDirectoryRecord>,
  path: string,
) {
  const now = new Date().toISOString();

  collectDirectoryPaths(path).forEach((directoryPath) => {
    directories[directoryPath] ??= { mtime: now };
  });
}

function listEntriesFromState(state: BrowserVaultState): VaultEntry[] {
  const directoryPaths = new Set(
    Object.keys(state.directories ?? {})
      .map(normalizeVaultPath)
      .filter((path) => path && !isHiddenVaultPath(path)),
  );
  const fileEntries = Object.entries(state.files)
    .map<VaultEntry | null>(([path, file]) => {
      const normalizedPath = normalizeVaultPath(path);

      if (isHiddenVaultPath(normalizedPath)) {
        return null;
      }

      const segments = normalizedPath.split("/").filter(Boolean);
      const parents = segments.slice(0, -1);

      parents.forEach((_segment, index) => {
        directoryPaths.add(parents.slice(0, index + 1).join("/"));
      });

      return {
        kind: "file",
        mtime: file.mtime,
        name: segments.at(-1) ?? normalizedPath,
        path: normalizedPath,
        size: file.content.length,
      };
    })
    .filter((entry): entry is VaultEntry => entry !== null);

  const directories = Array.from(directoryPaths).map((path) => ({
    kind: "directory" as const,
    mtime: state.directories?.[path]?.mtime ?? null,
    name: path.split("/").at(-1) ?? path,
    path,
    size: null,
  }));

  return [...directories, ...fileEntries];
}

async function withFileSystemHandle<T>(
  cachedHandle: FileSystemDirectoryHandle | null,
  callback: (handle: FileSystemDirectoryHandle | null) => Promise<T>,
) {
  if (!isFileSystemAccessSupported()) {
    return callback(null);
  }

  const handle = cachedHandle ?? (await loadDirectoryHandle());

  if (!handle) {
    return callback(null);
  }

  const hasPermission = await verifyDirectoryPermission(handle);
  return callback(hasPermission ? handle : null);
}

async function ensureDirectory(
  rootHandle: FileSystemDirectoryHandle,
  pathSegments: string[],
) {
  let currentHandle = rootHandle;

  for (const segment of pathSegments) {
    currentHandle = await currentHandle.getDirectoryHandle(segment, { create: true });
  }

  return currentHandle;
}

async function listEntriesFromHandle(
  handle: FileSystemDirectoryHandle,
  parentPath = "",
): Promise<VaultEntry[]> {
  const entries: VaultEntry[] = [];
  const iterableHandle = handle as IterableDirectoryHandle;

  for await (const entry of iterableHandle.values()) {
    const path = normalizeVaultPath(parentPath ? `${parentPath}/${entry.name}` : entry.name);

    if (isHiddenVaultPath(path)) {
      continue;
    }

    if (entry.kind === "directory") {
      entries.push({
        kind: "directory",
        mtime: null,
        name: entry.name,
        path,
        size: null,
      });
      entries.push(...(await listEntriesFromHandle(entry as FileSystemDirectoryHandle, path)));
      continue;
    }

    const file = await (entry as FileHandle).getFile();
    entries.push({
      kind: "file",
      mtime: new Date(file.lastModified).toISOString(),
      name: entry.name,
      path,
      size: file.size,
    });
  }

  return entries;
}

async function readFileFromHandle(
  handle: FileSystemDirectoryHandle,
  path: string,
): Promise<string | null> {
  const segments = normalizeVaultPath(path).split("/").filter(Boolean);
  const fileName = segments.pop();

  if (!fileName) {
    return null;
  }

  let directory = handle;

  for (const segment of segments) {
    directory = await directory.getDirectoryHandle(segment);
  }

  const fileHandle = await directory.getFileHandle(fileName);
  return (await fileHandle.getFile()).text();
}

async function tryReadFileFromHandle(
  handle: FileSystemDirectoryHandle,
  path: string,
): Promise<string | null> {
  try {
    return await readFileFromHandle(handle, path);
  } catch {
    return null;
  }
}

async function writeFileToHandle(
  handle: FileSystemDirectoryHandle,
  path: string,
  content: string,
) {
  const segments = normalizeVaultPath(path).split("/").filter(Boolean);
  const fileName = segments.pop();

  if (!fileName) {
    return;
  }

  const directory = await ensureDirectory(handle, segments);
  const fileHandle = await directory.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();

  await writable.write(content);
  await writable.close();
}

async function copyDirectoryContentsToHandle(
  sourceHandle: FileSystemDirectoryHandle,
  targetHandle: FileSystemDirectoryHandle,
) {
  const iterableSource = sourceHandle as IterableDirectoryHandle;

  for await (const entry of iterableSource.values()) {
    if (entry.kind === "directory") {
      const nextTargetHandle = await targetHandle.getDirectoryHandle(entry.name, {
        create: true,
      });
      await copyDirectoryContentsToHandle(
        entry as FileSystemDirectoryHandle,
        nextTargetHandle,
      );
      continue;
    }

    const sourceFile = await (entry as FileHandle).getFile();
    const targetFileHandle = await targetHandle.getFileHandle(entry.name, {
      create: true,
    });
    const writable = await targetFileHandle.createWritable();

    await writable.write(await sourceFile.arrayBuffer());
    await writable.close();
  }
}

async function renameDirectoryFromHandle(
  handle: FileSystemDirectoryHandle,
  fromPath: string,
  toPath: string,
) {
  const sourceSegments = normalizeVaultPath(fromPath).split("/").filter(Boolean);
  const sourceName = sourceSegments.pop();
  const targetSegments = normalizeVaultPath(toPath).split("/").filter(Boolean);
  const targetName = targetSegments.pop();

  if (!sourceName || !targetName) {
    return;
  }

  const sourceParent = sourceSegments.length > 0
    ? await ensureDirectory(handle, sourceSegments)
    : handle;
  const sourceHandle = await sourceParent.getDirectoryHandle(sourceName);
  const targetParent = targetSegments.length > 0
    ? await ensureDirectory(handle, targetSegments)
    : handle;
  const targetHandle = await targetParent.getDirectoryHandle(targetName, {
    create: true,
  });

  await copyDirectoryContentsToHandle(sourceHandle, targetHandle);
  await removeEntryFromHandle(handle, fromPath);
}

async function removeEntryFromHandle(handle: FileSystemDirectoryHandle, path: string) {
  const segments = normalizeVaultPath(path).split("/").filter(Boolean);
  const name = segments.pop();

  if (!name) {
    return;
  }

  const directory = (segments.length > 0 ? await ensureDirectory(handle, segments) : handle) as IterableDirectoryHandle;
  await directory.removeEntry(name, { recursive: true });
}

export function createBrowserVaultClient(
  storage: Storage | null = typeof window !== "undefined" ? window.localStorage : null,
): BrowserVaultClient {
  let cachedHandle: FileSystemDirectoryHandle | null = null;
  const listeners = new Set<() => void>();

  function emitChange() {
    listeners.forEach((listener) => {
      listener();
    });
  }

  async function updateStorageState(
    updater: (state: BrowserVaultState) => BrowserVaultState,
  ): Promise<void> {
    const current = readStoredState(storage);
    const next = updater(current);
    writeStoredState(storage, next);
    emitChange();
  }

  const client: BrowserVaultClient = {
    async createDirectory(path: string) {
      await withFileSystemHandle(cachedHandle, async (handle) => {
        if (!handle) {
          await updateStorageState((state) => {
            const directories = { ...(state.directories ?? {}) };
            addDirectoryWithParents(directories, path);

            return {
              ...state,
              directories,
            };
          });
          return;
        }

        await ensureDirectory(handle, normalizeVaultPath(path).split("/").filter(Boolean));
        emitChange();
      });
    },
    async deleteEntry(path: string) {
      await withFileSystemHandle(cachedHandle, async (handle) => {
        if (handle) {
          await removeEntryFromHandle(handle, path);
          emitChange();
          return;
        }

        await updateStorageState((state) => {
          const normalized = normalizeVaultPath(path);
          const nextFiles = Object.fromEntries(
            Object.entries(state.files).filter(([key]) => {
              const currentPath = normalizeVaultPath(key);
              return !isPathOrChild(currentPath, normalized);
            }),
          );
          const nextDirectories = Object.fromEntries(
            Object.entries(state.directories ?? {}).filter(([key]) => {
              const currentPath = normalizeVaultPath(key);
              return !isPathOrChild(currentPath, normalized);
            }),
          );

          return {
            directories: nextDirectories,
            files: nextFiles,
          };
        });
      });
    },
    async getDirectoryInfo() {
      return withFileSystemHandle(cachedHandle, async (handle) => {
        if (handle) {
          cachedHandle = handle;
        }

        return toDirectoryInfo(handle);
      });
    },
    async listEntries() {
      return withFileSystemHandle(cachedHandle, async (handle) => {
        if (handle) {
          cachedHandle = handle;
          return listEntriesFromHandle(handle);
        }

        return listEntriesFromState(readStoredState(storage));
      });
    },
    async moveEntry(fromPath: string, toPath: string) {
      const sourcePath = normalizeStoragePath(fromPath);
      const targetPath = normalizeStoragePath(toPath);

      await withFileSystemHandle(cachedHandle, async (handle) => {
        if (handle) {
          const content = await readFileFromHandle(handle, sourcePath);

          if (content === null) {
            return;
          }

          await writeFileToHandle(handle, targetPath, content);
          await removeEntryFromHandle(handle, sourcePath);
          emitChange();
          return;
        }

        await updateStorageState((state) => {
          const file = state.files[sourcePath];

          if (!file) {
            return state;
          }

          const nextFiles = {
            ...state.files,
            [targetPath]: {
              ...file,
              mtime: new Date().toISOString(),
            },
          };
          delete nextFiles[sourcePath];

          return {
            ...state,
            files: nextFiles,
          };
        });
      });
    },
    async pickDirectory() {
      if (!isFileSystemAccessSupported()) {
        return toDirectoryInfo(null);
      }

      const nextHandle = await (window as DirectoryPickerWindow).showDirectoryPicker({
        mode: "readwrite",
      });
      await saveDirectoryHandle(nextHandle);
      cachedHandle = nextHandle;
      emitChange();
      return toDirectoryInfo(nextHandle);
    },
    async readFile(path: string) {
      const normalized = normalizeStoragePath(path);

      return withFileSystemHandle(cachedHandle, async (handle) => {
        if (handle) {
          return readFileFromHandle(handle, normalized);
        }

        return readStoredState(storage).files[normalized]?.content ?? null;
      });
    },
    async renameEntry(fromPath: string, toPath: string) {
      const sourcePath = normalizeVaultPath(fromPath);
      const targetPath = normalizeVaultPath(toPath);

      await withFileSystemHandle(cachedHandle, async (handle) => {
        if (handle) {
          const fileContent = await tryReadFileFromHandle(handle, sourcePath);

          if (fileContent !== null) {
            await writeFileToHandle(handle, targetPath, fileContent);
            await removeEntryFromHandle(handle, sourcePath);
          } else {
            await renameDirectoryFromHandle(handle, sourcePath, targetPath);
          }

          emitChange();
          return;
        }

        await updateStorageState((state) => {
          const normalizedSourcePath = normalizeVaultPath(fromPath);
          const normalizedTargetPath = normalizeVaultPath(toPath);
          const sourceFilePath = normalizeStoragePath(fromPath);
          const sourceFile = state.files[sourceFilePath];

          if (sourceFile) {
            const targetFilePath = normalizeStoragePath(toPath);
            const nextFiles = {
              ...state.files,
              [targetFilePath]: {
                ...sourceFile,
                mtime: new Date().toISOString(),
              },
            };
            delete nextFiles[sourceFilePath];

            return {
              ...state,
              files: nextFiles,
            };
          }

          const nextDirectories: BrowserVaultState["directories"] = {};
          let didRenameDirectory = false;

          Object.entries(state.directories ?? {}).forEach(([key, directory]) => {
            const currentPath = normalizeVaultPath(key);

            if (isPathOrChild(currentPath, normalizedSourcePath)) {
              didRenameDirectory = true;
              nextDirectories[
                renamePathPrefix(currentPath, normalizedSourcePath, normalizedTargetPath)
              ] = directory;
              return;
            }

            nextDirectories[currentPath] = directory;
          });

          const nextFiles: BrowserVaultState["files"] = {};

          Object.entries(state.files).forEach(([key, file]) => {
            const currentPath = normalizeVaultPath(key);

            if (isPathOrChild(currentPath, normalizedSourcePath)) {
              didRenameDirectory = true;
              nextFiles[
                renamePathPrefix(currentPath, normalizedSourcePath, normalizedTargetPath)
              ] = file;
              return;
            }

            nextFiles[currentPath] = file;
          });

          if (!didRenameDirectory) {
            return state;
          }

          addDirectoryWithParents(nextDirectories, normalizedTargetPath);

          return {
            directories: nextDirectories,
            files: nextFiles,
          };
        });
      });
    },
    rootPath: "browser://vault",
    subscribeToChanges(listener: () => void) {
      listeners.add(listener);

      const storageListener = (event: StorageEvent) => {
        if (event.key === BROWSER_VAULT_STORAGE_KEY) {
          listener();
        }
      };

      if (typeof window !== "undefined") {
        window.addEventListener("storage", storageListener);
      }

      return () => {
        listeners.delete(listener);

        if (typeof window !== "undefined") {
          window.removeEventListener("storage", storageListener);
        }
      };
    },
    async writeFile(path: string, content: string) {
      const normalized = normalizeStoragePath(path);

      await withFileSystemHandle(cachedHandle, async (handle) => {
        if (handle) {
          await writeFileToHandle(handle, normalized, content);
          emitChange();
          return;
        }

        await updateStorageState((state) => ({
          ...state,
          files: {
            ...state.files,
            [normalized]: {
              content,
              mtime: new Date().toISOString(),
            },
          },
        }));
      });
    },
  };

  return client;
}
