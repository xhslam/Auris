import type { NoteDocument } from "@/features/notes/documents/document-types";

export type VaultEntryKind = "directory" | "file";

export type VaultEntry = {
  kind: VaultEntryKind;
  mtime: string | null;
  name: string;
  path: string;
  size: number | null;
};

export type VaultSnapshot = {
  backlinks: Record<string, string[]>;
  documents: NoteDocument[];
  entries: VaultEntry[];
  generatedAt: string;
  rootPath: string | null;
};

export type VaultClient = {
  copyEntry?: (fromPath: string, toPath: string) => Promise<void>;
  createDirectory: (path: string) => Promise<void>;
  deleteEntry: (path: string) => Promise<void>;
  listEntries: () => Promise<VaultEntry[]>;
  moveEntry: (fromPath: string, toPath: string) => Promise<void>;
  readFile: (path: string) => Promise<string | null>;
  renameEntry: (fromPath: string, toPath: string) => Promise<void>;
  restoreLastDeletedEntry?: () => Promise<string | null>;
  revealEntry?: (path: string) => Promise<void>;
  rootPath: string | null;
  subscribeToChanges: (listener: () => void) => () => void;
  writeFile: (path: string, content: string) => Promise<void>;
};
