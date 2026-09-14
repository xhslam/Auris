export type NotesFolderLocation = {
  id: string;
  name: string;
  path: string;
};

export type NotesLocation =
  | { type: "landing" }
  | { type: "folder"; folder: NotesFolderLocation }
  | { type: "note"; folder: NotesFolderLocation | null };

export const NOTES_FOLDER_NAVIGATE_EVENT = "auris:notes-folder-navigate";
export const NOTES_ROOT_NAVIGATE_EVENT = "auris:notes-root-navigate";
export const NOTES_LANDING_VISITED_SESSION_KEY =
  "auris.notes.landing-visited";
export const NOTES_LAST_FOLDER_SESSION_KEY = "auris.notes.last-folder";

type NotesFolderNavigateEventDetail = {
  folder: NotesFolderLocation;
};

export function createNotesFolderNavigateEvent(
  folder: NotesFolderLocation,
): CustomEvent<NotesFolderNavigateEventDetail> {
  return new CustomEvent<NotesFolderNavigateEventDetail>(
    NOTES_FOLDER_NAVIGATE_EVENT,
    { detail: { folder } },
  );
}

export function createNotesRootNavigateEvent() {
  return new Event(NOTES_ROOT_NAVIGATE_EVENT);
}

export function isNotesFolderNavigateEvent(
  event: Event,
): event is CustomEvent<NotesFolderNavigateEventDetail> {
  const detail = (event as CustomEvent<unknown>).detail;
  if (!detail || typeof detail !== "object") return false;

  const folder = (detail as NotesFolderNavigateEventDetail).folder;
  return Boolean(
    folder &&
      typeof folder.id === "string" &&
      typeof folder.name === "string" &&
      typeof folder.path === "string",
  );
}

export function readSessionValue(key: string) {
  if (typeof window === "undefined") return null;

  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSessionValue(key: string, value: string) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // 页面状态本身仍可正常工作；仅放弃跨页面会话恢复。
  }
}

export function readLastNotesFolder(): NotesFolderLocation | null {
  const raw = readSessionValue(NOTES_LAST_FOLDER_SESSION_KEY);
  if (!raw) return null;

  try {
    const folder = JSON.parse(raw) as NotesFolderLocation;
    return folder &&
      typeof folder.id === "string" &&
      typeof folder.name === "string" &&
      typeof folder.path === "string"
      ? folder
      : null;
  } catch {
    return null;
  }
}

export function writeLastNotesFolder(folder: NotesFolderLocation) {
  writeSessionValue(NOTES_LAST_FOLDER_SESSION_KEY, JSON.stringify(folder));
}

export function folderFromDirectoryInfo(directoryInfo: {
  directoryName: string | null;
  vaultPath?: string | null;
} | null | undefined): NotesFolderLocation | null {
  if (!directoryInfo?.vaultPath) return null;

  return {
    id: directoryInfo.vaultPath,
    name: directoryInfo.directoryName || "未命名笔记库",
    path: directoryInfo.vaultPath,
  };
}

export function getNotesRootLocation(): NotesLocation {
  const landingVisited =
    readSessionValue(NOTES_LANDING_VISITED_SESSION_KEY) === "true";
  const lastFolder = readLastNotesFolder();

  if (landingVisited && lastFolder) {
    return { type: "folder", folder: lastFolder };
  }

  return { type: "landing" };
}

export function getInitialNotesLocation({
  hasResumeNote,
}: {
  hasResumeNote: boolean;
}): NotesLocation {
  if (hasResumeNote) {
    return { type: "note", folder: readLastNotesFolder() };
  }

  return getNotesRootLocation();
}
