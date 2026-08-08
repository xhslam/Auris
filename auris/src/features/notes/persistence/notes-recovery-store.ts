import type {
  DesktopNotesHotExitWorkspace,
  DesktopNotesHotExitWorkspaceSession,
  DesktopNotesHistoryVersion,
  DesktopNotesRecoveryBridge,
  DesktopNotesRecoveryDraft,
} from "@/platform/desktop/desktop-bridge";

const RECOVERY_KEY = "auris.notes.hot-exit.v1";
const WORKSPACE_RECOVERY_KEY = "auris.notes.hot-exit.workspaces.v2";
const HISTORY_KEY = "auris.notes.history.v1";
const HISTORY_LIMIT = 50;
const HISTORY_MAX_SOURCE_BYTES = 512 * 1024;
const RECOVERY_MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const RECOVERY_LIMIT_TOTAL = 100;
const WORKSPACE_LIMIT_TOTAL = 25;

export type NotesRecoveryDraft = DesktopNotesRecoveryDraft;
export type NotesHistoryVersion = DesktopNotesHistoryVersion;
export type NotesHotExitWorkspace = DesktopNotesHotExitWorkspace;
export type NotesHotExitWorkspaceSession =
  DesktopNotesHotExitWorkspaceSession;

let migrationPromise: Promise<void> | null = null;

function readArray<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeArray<T>(key: string, value: T[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function getBridge(): DesktopNotesRecoveryBridge | null {
  if (typeof window === "undefined") return null;
  return window.shadowingDesktop?.notesRecovery ?? null;
}

function sameWorkspace(
  entry: { vaultRoot: string | null },
  vaultRoot: string | null,
) {
  return entry.vaultRoot === vaultRoot;
}

async function ensureLegacyMigration(bridge: DesktopNotesRecoveryBridge) {
  if (!migrationPromise) {
    migrationPromise = bridge
      .importLegacy({
        drafts: readArray<NotesRecoveryDraft>(RECOVERY_KEY),
        history: readArray<NotesHistoryVersion>(HISTORY_KEY),
      })
      .then(() => {
        window.localStorage.removeItem(RECOVERY_KEY);
        window.localStorage.removeItem(HISTORY_KEY);
      })
      .catch((error) => {
        migrationPromise = null;
        throw error;
      });
  }
  await migrationPromise;
}

export async function captureNotesRecoveryDraft(
  draft: Omit<NotesRecoveryDraft, "capturedAt">,
) {
  const bridge = getBridge();
  if (bridge) {
    await ensureLegacyMigration(bridge);
    return bridge.captureDraft(draft);
  }
  if (
    new TextEncoder().encode(draft.rawSource).byteLength >
    RECOVERY_MAX_SOURCE_BYTES
  ) {
    return false;
  }
  const drafts = readArray<NotesRecoveryDraft>(RECOVERY_KEY).filter(
    (entry) =>
      !(entry.path === draft.path && sameWorkspace(entry, draft.vaultRoot)),
  );
  return writeArray(RECOVERY_KEY, [
    ...drafts,
    { ...draft, capturedAt: new Date().toISOString() },
  ].slice(-RECOVERY_LIMIT_TOTAL));
}

export async function clearNotesRecoveryDraft(
  path: string,
  vaultRoot: string | null,
) {
  const bridge = getBridge();
  if (bridge) {
    await ensureLegacyMigration(bridge);
    await bridge.clearDraft(path, vaultRoot);
    return;
  }
  writeArray(
    RECOVERY_KEY,
    readArray<NotesRecoveryDraft>(RECOVERY_KEY).filter(
      (entry) => !(entry.path === path && sameWorkspace(entry, vaultRoot)),
    ),
  );
}

export async function listNotesRecoveryDrafts(vaultRoot: string | null) {
  const bridge = getBridge();
  if (bridge) {
    await ensureLegacyMigration(bridge);
    return bridge.listDrafts(vaultRoot);
  }
  return readArray<NotesRecoveryDraft>(RECOVERY_KEY).filter((entry) =>
    sameWorkspace(entry, vaultRoot),
  );
}

export async function captureNotesHotExitWorkspace(
  vaultRoot: string | null,
  workspace: NotesHotExitWorkspace,
) {
  const bridge = getBridge();
  if (bridge) {
    await ensureLegacyMigration(bridge);
    return bridge.captureWorkspace(vaultRoot, workspace);
  }
  const sessions = readArray<NotesHotExitWorkspaceSession>(
    WORKSPACE_RECOVERY_KEY,
  ).filter((entry) => !sameWorkspace(entry, vaultRoot));
  return writeArray(WORKSPACE_RECOVERY_KEY, [
    ...sessions,
    {
      capturedAt: new Date().toISOString(),
      schemaVersion: 2,
      vaultRoot,
      workspace,
    },
  ].slice(-WORKSPACE_LIMIT_TOTAL));
}

export async function loadNotesHotExitWorkspace(
  vaultRoot: string | null,
) {
  const bridge = getBridge();
  if (bridge) {
    await ensureLegacyMigration(bridge);
    return bridge.loadWorkspace(vaultRoot);
  }
  return (
    readArray<NotesHotExitWorkspaceSession>(WORKSPACE_RECOVERY_KEY).find(
      (entry) => sameWorkspace(entry, vaultRoot),
    ) ?? null
  );
}

export async function recordNotesHistoryVersion(
  input: Omit<NotesHistoryVersion, "id" | "savedAt">,
) {
  const bridge = getBridge();
  if (bridge) {
    await ensureLegacyMigration(bridge);
    return bridge.recordHistory(input);
  }
  if (
    new TextEncoder().encode(input.rawSource).byteLength >
    HISTORY_MAX_SOURCE_BYTES
  ) {
    return undefined;
  }
  const versions = readArray<NotesHistoryVersion>(HISTORY_KEY);
  const latest = versions.find(
    (entry) =>
      entry.path === input.path && sameWorkspace(entry, input.vaultRoot),
  );
  if (latest?.rawSource === input.rawSource) return latest;

  const version = {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: new Date().toISOString(),
  };
  const sameDocumentVersions = versions.filter(
    (entry) =>
      entry.path === input.path && sameWorkspace(entry, input.vaultRoot),
  );
  const otherVersions = versions.filter(
    (entry) =>
      entry.path !== input.path || !sameWorkspace(entry, input.vaultRoot),
  );
  writeArray(
    HISTORY_KEY,
    [
      version,
      ...sameDocumentVersions.slice(0, HISTORY_LIMIT - 1),
      ...otherVersions,
    ].slice(0, 250),
  );
  return version;
}

export async function listNotesHistoryVersions(
  path: string,
  vaultRoot: string | null,
) {
  const bridge = getBridge();
  if (bridge) {
    await ensureLegacyMigration(bridge);
    return bridge.listHistory(path, vaultRoot);
  }
  return readArray<NotesHistoryVersion>(HISTORY_KEY).filter(
    (entry) => entry.path === path && sameWorkspace(entry, vaultRoot),
  );
}

export function resetNotesRecoveryMigrationForTests() {
  migrationPromise = null;
}
