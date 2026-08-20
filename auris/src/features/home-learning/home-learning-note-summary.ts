import type { NotePageSummary, NotesStorage } from "@/features/notes/note-types";
import type { VaultClient, VaultEntry } from "@/features/notes/vault/vault-types";
import {
  EMPTY_HOME_LEARNING_NOTE_SUMMARY,
  type HomeLearningNoteSummary,
  type LearningNoteFoldersState,
} from "@/features/home-learning/home-learning.types";
import { normalizeLearningFolderPath } from "@/features/home-learning/learning-note-folders-store";

function normalizedDirectoryPaths(entries: VaultEntry[]): Set<string> {
  return new Set(
    entries
      .filter((entry) => entry.kind === "directory")
      .map((entry) => normalizeLearningFolderPath(entry.path))
      .filter((path): path is string => Boolean(path)),
  );
}

/** 目录边界感知匹配：math 不会错误匹配 mathematics。 */
export function isNoteInsideLearningFolder(relativePath: string, folder: string): boolean {
  const path = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  return path === folder || path.startsWith(`${folder}/`);
}

export function getHomeLearningNoteSummary({
  folders,
  entries,
  notes,
}: {
  folders: LearningNoteFoldersState | null;
  entries: VaultEntry[];
  notes: NotePageSummary[];
}): HomeLearningNoteSummary {
  const configuredFolders = folders?.relativePaths ?? [];
  if (configuredFolders.length === 0) {
    return { ...EMPTY_HOME_LEARNING_NOTE_SUMMARY };
  }

  const directories = normalizedDirectoryPaths(entries);
  const validFolders = configuredFolders.filter((path) => directories.has(path));
  const missingFolders = configuredFolders.filter((path) => !directories.has(path));
  if (validFolders.length === 0) {
    return {
      status: "unavailable",
      note: null,
      configuredFolders,
      missingFolders,
    };
  }

  const matchingNotes = notes
    .filter((note) => validFolders.some((folder) => isNoteInsideLearningFolder(note.relativePath, folder)))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));

  return {
    status: matchingNotes.length ? "ready" : "empty",
    note: matchingNotes[0] ?? null,
    configuredFolders,
    missingFolders,
  };
}

export async function loadHomeLearningNoteSummary(
  folders: LearningNoteFoldersState | null,
  vaultClient: VaultClient | null,
  notesStorage: NotesStorage | null,
): Promise<HomeLearningNoteSummary> {
  const configuredFolders = folders?.relativePaths ?? [];
  if (configuredFolders.length === 0) return { ...EMPTY_HOME_LEARNING_NOTE_SUMMARY };
  if (!vaultClient || !notesStorage) {
    return {
      status: "unavailable",
      note: null,
      configuredFolders,
      missingFolders: configuredFolders,
    };
  }

  try {
    const [entries, notes] = await Promise.all([
      vaultClient.listEntries(),
      notesStorage.listPages(),
    ]);
    return getHomeLearningNoteSummary({ folders, entries, notes });
  } catch {
    return {
      status: "unavailable",
      note: null,
      configuredFolders,
      missingFolders: [],
    };
  }
}
