const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const HISTORY_LIMIT_PER_DOCUMENT = 50;
const HISTORY_LIMIT_TOTAL = 250;
const HISTORY_MAX_SOURCE_BYTES = 512 * 1024;
const RECOVERY_MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const RECOVERY_LIMIT_TOTAL = 100;
const WORKSPACE_LIMIT_TOTAL = 25;
const COMPACT_AFTER_BYTES = 8 * 1024 * 1024;
const COMPACT_AFTER_LINES = 500;
const HOT_EXIT_SCHEMA_VERSION = 2;
const WORKSPACE_PATH_LIMIT = 100;

function utf8Length(value) {
  return Buffer.byteLength(value, "utf8");
}

function validWorkspaceValue(value) {
  return value === null || typeof value === "string";
}

function isWithinRecoveryLimit(value) {
  try {
    return utf8Length(JSON.stringify(value)) <= RECOVERY_MAX_SOURCE_BYTES;
  } catch {
    return false;
  }
}

function validDocumentInput(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.path === "string" &&
    value.path.length > 0 &&
    typeof value.rawSource === "string" &&
    (value.baseRawSource === undefined ||
      value.baseRawSource === null ||
      typeof value.baseRawSource === "string") &&
    validWorkspaceValue(value.vaultRoot)
  );
}

function sameDocument(left, right) {
  return left.path === right.path && left.vaultRoot === right.vaultRoot;
}

function salvageJsonArrayObjects(raw) {
  if (typeof raw !== "string") return [];
  const objects = [];
  const regex = /\{[\s\S]*?\}(?=(?:\s*,\s*\{|\s*\]))/g;
  let match;
  while ((match = regex.exec(raw)) !== null) {
    try {
      const parsed = JSON.parse(match[0]);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        objects.push(parsed);
      }
    } catch {
      // Ignore unparseable fragments
    }
  }
  return objects;
}

async function readJsonArray(fileSystem, targetPath, fallbackPath) {
  try {
    const value = JSON.parse(await fileSystem.readFile(targetPath, "utf8"));
    if (!Array.isArray(value)) {
      throw new SyntaxError("Notes recovery snapshot must be an array.");
    }
    return value;
  } catch (error) {
    if (
      fallbackPath &&
      (error?.code === "ENOENT" || error instanceof SyntaxError)
    ) {
      try {
        const fallback = JSON.parse(
          await fileSystem.readFile(fallbackPath, "utf8"),
        );
        if (Array.isArray(fallback)) return fallback;
      } catch {
        // Fallback also failed, proceed to salvage
      }
    }
    if (error?.code === "ENOENT") return [];
    if (error instanceof SyntaxError) {
      try {
        const raw = await fileSystem.readFile(targetPath, "utf8");
        return salvageJsonArrayObjects(raw);
      } catch {
        return [];
      }
    }
    throw error;
  }
}

async function syncDirectory(fileSystem, directoryPath) {
  let handle;
  try {
    handle = await fileSystem.open(directoryPath, "r");
    await handle.sync();
  } catch {
    // Directory fsync is not available on every supported filesystem.
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function writeAtomicJson({
  backupPath,
  fileSystem,
  randomId,
  targetPath,
  value,
}) {
  const directoryPath = path.dirname(targetPath);
  await fileSystem.mkdir(directoryPath, { mode: 0o700, recursive: true });
  const temporaryPath = path.join(
    directoryPath,
    `.${path.basename(targetPath)}.${process.pid}.${randomId()}.tmp`,
  );
  let handle;
  try {
    handle = await fileSystem.open(temporaryPath, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    if (backupPath) {
      try {
        const current = await fileSystem.readFile(targetPath, "utf8");
        const parsed = JSON.parse(current);
        if (Array.isArray(parsed)) {
          await writeAtomicJson({
            fileSystem,
            randomId,
            targetPath: backupPath,
            value: parsed,
          });
        }
      } catch (error) {
        if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) {
          throw error;
        }
      }
    }
    await fileSystem.rename(temporaryPath, targetPath);
    await syncDirectory(fileSystem, directoryPath);
  } finally {
    await handle?.close().catch(() => undefined);
    await fileSystem.rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

function validStringArray(value) {
  return (
    Array.isArray(value) &&
    value.length <= WORKSPACE_PATH_LIMIT &&
    value.every((entry) => typeof entry === "string" && entry.length > 0)
  );
}

function validEditorModes(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([documentPath, mode]) =>
        documentPath.length > 0 &&
        ["source", "split", "wysiwyg"].includes(mode),
    )
  );
}

function validWorkspaceState(value) {
  return (
    value &&
    typeof value === "object" &&
    (value.activePath === null || typeof value.activePath === "string") &&
    validStringArray(value.commandHistory) &&
    validEditorModes(value.editorModesByPath) &&
    typeof value.leftSidebarCollapsed === "boolean" &&
    ["files", "outline", "search"].includes(value.leftSidebarMode) &&
    validStringArray(value.openTabs) &&
    validStringArray(value.pinnedTabs) &&
    validStringArray(value.recentFiles) &&
    typeof value.rightSidebarCollapsed === "boolean" &&
    ["backlinks", "learning", "properties", "terminal"].includes(
      value.rightSidebarMode,
    )
  );
}

function validWorkspaceSession(value) {
  return (
    value &&
    typeof value === "object" &&
    value.schemaVersion === HOT_EXIT_SCHEMA_VERSION &&
    typeof value.capturedAt === "string" &&
    validWorkspaceValue(value.vaultRoot) &&
    validWorkspaceState(value.workspace)
  );
}

function repairWorkspaceState(value) {
  if (!value || typeof value !== "object") return null;

  const openTabs = Array.isArray(value.openTabs)
    ? Array.from(
        new Set(
          value.openTabs.filter(
            (tab) => typeof tab === "string" && tab.trim().length > 0,
          ),
        ),
      )
    : [];

  const activePath =
    typeof value.activePath === "string" && openTabs.includes(value.activePath)
      ? value.activePath
      : openTabs[0] ?? null;

  const commandHistory = Array.isArray(value.commandHistory)
    ? value.commandHistory.filter((item) => typeof item === "string")
    : [];

  const editorModesByPath =
    value.editorModesByPath &&
    typeof value.editorModesByPath === "object" &&
    !Array.isArray(value.editorModesByPath)
      ? Object.fromEntries(
          Object.entries(value.editorModesByPath).filter(
            ([docPath, mode]) =>
              typeof docPath === "string" &&
              ["source", "split", "wysiwyg"].includes(mode),
          ),
        )
      : {};

  const leftSidebarCollapsed = Boolean(value.leftSidebarCollapsed);
  const leftSidebarMode = ["files", "outline", "search"].includes(
    value.leftSidebarMode,
  )
    ? value.leftSidebarMode
    : "files";

  const pinnedTabs = Array.isArray(value.pinnedTabs)
    ? Array.from(
        new Set(
          value.pinnedTabs.filter(
            (tab) => typeof tab === "string" && tab.trim().length > 0,
          ),
        ),
      )
    : [];

  const recentFiles = Array.isArray(value.recentFiles)
    ? Array.from(
        new Set(
          value.recentFiles.filter(
            (file) => typeof file === "string" && file.trim().length > 0,
          ),
        ),
      )
    : [];

  const rightSidebarCollapsed = Boolean(value.rightSidebarCollapsed);
  const validRightSidebarModes = [
    "backlinks",
    "learning",
    "properties",
    "terminal",
  ];
  const rightSidebarMode = validRightSidebarModes.includes(
    value.rightSidebarMode,
  )
    ? value.rightSidebarMode
    : "properties";

  return {
    activePath,
    commandHistory,
    editorModesByPath,
    leftSidebarCollapsed,
    leftSidebarMode,
    openTabs,
    pinnedTabs,
    recentFiles,
    rightSidebarCollapsed,
    rightSidebarMode,
  };
}

function parseHistoryLines(source) {
  const events = [];
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (
        event?.type === "version" &&
        typeof event.id === "string" &&
        typeof event.savedAt === "string" &&
        validDocumentInput(event)
      ) {
        events.push(event);
      }
    } catch {
      // A partial/corrupt line is ignored; earlier durable events remain valid.
    }
  }
  return events;
}

function reduceHistory(events) {
  const versions = [];
  const perDocumentCounts = new Map();
  const seenIds = new Set();

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (seenIds.has(event.id)) continue;
    seenIds.add(event.id);
    const documentKey = `${event.vaultRoot ?? ""}\0${event.path}`;
    const count = perDocumentCounts.get(documentKey) ?? 0;
    if (count >= HISTORY_LIMIT_PER_DOCUMENT) continue;
    perDocumentCounts.set(documentKey, count + 1);
    versions.push({
      id: event.id,
      path: event.path,
      rawSource: event.rawSource,
      savedAt: event.savedAt,
      vaultRoot: event.vaultRoot,
    });
    if (versions.length >= HISTORY_LIMIT_TOTAL) break;
  }

  return versions;
}

async function readHistoryEvents(fileSystem, historyPath) {
  try {
    return parseHistoryLines(await fileSystem.readFile(historyPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function appendDurableLine(fileSystem, targetPath, value) {
  await fileSystem.mkdir(path.dirname(targetPath), {
    mode: 0o700,
    recursive: true,
  });
  const handle = await fileSystem.open(targetPath, "a+", 0o600);
  try {
    const stat = await handle.stat();
    if (stat.size > 0) {
      const tail = Buffer.alloc(1);
      await handle.read(tail, 0, 1, stat.size - 1);
      if (tail[0] !== 0x0a) {
        await handle.write("\n");
      }
    }
    await handle.write(`${JSON.stringify(value)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function createNotesRecoveryStore({
  baseDirectory,
  fileSystem = fs,
  now = () => new Date(),
  randomId = () => crypto.randomUUID(),
} = {}) {
  if (typeof baseDirectory !== "string" || !baseDirectory) {
    throw new TypeError("Notes recovery store requires a base directory.");
  }

  const recoveryPath = path.join(baseDirectory, "notes-hot-exit.json");
  const recoveryBackupPath = path.join(
    baseDirectory,
    "notes-hot-exit.previous.json",
  );
  const workspacePath = path.join(
    baseDirectory,
    "notes-hot-exit-workspaces.json",
  );
  const workspaceBackupPath = path.join(
    baseDirectory,
    "notes-hot-exit-workspaces.previous.json",
  );
  const historyPath = path.join(baseDirectory, "notes-history.jsonl");
  const migrationMarkerPath = path.join(
    baseDirectory,
    "notes-recovery-migrated-v1.json",
  );
  let mutationQueue = Promise.resolve();

  const mutate = (operation) => {
    const result = mutationQueue.then(operation, operation);
    mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  async function readDrafts() {
    const drafts = await readJsonArray(
      fileSystem,
      recoveryPath,
      recoveryBackupPath,
    );
    return drafts
      .filter((draft) => validDocumentInput(draft))
      .map((draft) => ({
        ...draft,
        captureId:
          typeof draft.captureId === "string" ? draft.captureId : randomId(),
        capturedAt:
          typeof draft.capturedAt === "string"
            ? draft.capturedAt
            : now().toISOString(),
      }));
  }

  async function readWorkspaceSessions() {
    const rawSessions = await readJsonArray(
      fileSystem,
      workspacePath,
      workspaceBackupPath,
    );
    const validSessions = [];
    for (const raw of rawSessions) {
      if (
        !raw ||
        typeof raw !== "object" ||
        !validWorkspaceValue(raw.vaultRoot)
      ) {
        continue;
      }
      if (validWorkspaceSession(raw)) {
        validSessions.push(raw);
        continue;
      }
      // Salvage workspace when strict validation fails (aligned with vmark audit B6)
      const repaired = repairWorkspaceState(raw.workspace);
      if (repaired) {
        validSessions.push({
          capturedAt:
            typeof raw.capturedAt === "string"
              ? raw.capturedAt
              : now().toISOString(),
          schemaVersion: HOT_EXIT_SCHEMA_VERSION,
          vaultRoot: raw.vaultRoot,
          workspace: repaired,
        });
      }
    }
    return validSessions;
  }

  async function maybeCompactHistory(events) {
    let stat;
    try {
      stat = await fileSystem.stat(historyPath);
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    if (stat.size < COMPACT_AFTER_BYTES && events.length < COMPACT_AFTER_LINES) {
      return;
    }
    const compacted = reduceHistory(events)
      .reverse()
      .map((version) => ({ type: "version", ...version }));
    const source = compacted.map((event) => JSON.stringify(event)).join("\n");
    const directoryPath = path.dirname(historyPath);
    const temporaryPath = path.join(
      directoryPath,
      `.${path.basename(historyPath)}.${process.pid}.${randomId()}.tmp`,
    );
    let handle;
    try {
      handle = await fileSystem.open(temporaryPath, "wx", 0o600);
      await handle.writeFile(source ? `${source}\n` : "", "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      await fileSystem.rename(temporaryPath, historyPath);
      await syncDirectory(fileSystem, directoryPath);
    } finally {
      await handle?.close().catch(() => undefined);
      await fileSystem.rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }

  return {
    captureDraft(input) {
      return mutate(async () => {
        if (
          !validDocumentInput(input) ||
          !isWithinRecoveryLimit(input)
        ) {
          return false;
        }
        const drafts = (await readDrafts()).filter(
          (draft) => !sameDocument(draft, input),
        );
        drafts.push({
          baseRawSource: input.baseRawSource ?? null,
          captureId: randomId(),
          capturedAt: now().toISOString(),
          path: input.path,
          rawSource: input.rawSource,
          schemaVersion: HOT_EXIT_SCHEMA_VERSION,
          vaultRoot: input.vaultRoot,
        });
        await writeAtomicJson({
          backupPath: recoveryBackupPath,
          fileSystem,
          randomId,
          targetPath: recoveryPath,
          value: drafts.slice(-RECOVERY_LIMIT_TOTAL),
        });
        return true;
      });
    },
    clearDraft(documentPath, vaultRoot) {
      return mutate(async () => {
        const drafts = (await readDrafts()).filter(
          (draft) =>
            draft.path !== documentPath || draft.vaultRoot !== vaultRoot,
        );
        await writeAtomicJson({
          backupPath: recoveryBackupPath,
          fileSystem,
          randomId,
          targetPath: recoveryPath,
          value: drafts,
        });
      });
    },
    async listDrafts(vaultRoot) {
      await mutationQueue;
      return (await readDrafts()).filter(
        (draft) => draft.vaultRoot === vaultRoot,
      );
    },
    captureWorkspace(input) {
      return mutate(async () => {
        if (
          !input ||
          typeof input !== "object" ||
          !validWorkspaceValue(input.vaultRoot) ||
          !validWorkspaceState(input.workspace)
        ) {
          return false;
        }
        const sessions = (await readWorkspaceSessions()).filter(
          (session) => session.vaultRoot !== input.vaultRoot,
        );
        sessions.push({
          capturedAt: now().toISOString(),
          schemaVersion: HOT_EXIT_SCHEMA_VERSION,
          vaultRoot: input.vaultRoot,
          workspace: input.workspace,
        });
        await writeAtomicJson({
          backupPath: workspaceBackupPath,
          fileSystem,
          randomId,
          targetPath: workspacePath,
          value: sessions.slice(-WORKSPACE_LIMIT_TOTAL),
        });
        return true;
      });
    },
    async loadWorkspace(vaultRoot) {
      await mutationQueue;
      return (
        (await readWorkspaceSessions()).find(
          (session) => session.vaultRoot === vaultRoot,
        ) ?? null
      );
    },
    recordHistory(input) {
      return mutate(async () => {
        if (
          !validDocumentInput(input) ||
          utf8Length(input.rawSource) > HISTORY_MAX_SOURCE_BYTES
        ) {
          return undefined;
        }
        const events = await readHistoryEvents(fileSystem, historyPath);
        const latest = reduceHistory(events).find((version) =>
          sameDocument(version, input),
        );
        if (latest?.rawSource === input.rawSource) return latest;

        const version = {
          id: randomId(),
          path: input.path,
          rawSource: input.rawSource,
          savedAt: now().toISOString(),
          vaultRoot: input.vaultRoot,
        };
        const event = { type: "version", ...version };
        await appendDurableLine(fileSystem, historyPath, event);
        await maybeCompactHistory([...events, event]);
        return version;
      });
    },
    async listHistory(documentPath, vaultRoot) {
      await mutationQueue;
      return reduceHistory(
        await readHistoryEvents(fileSystem, historyPath),
      ).filter(
        (version) =>
          version.path === documentPath && version.vaultRoot === vaultRoot,
      );
    },
    importLegacy(input) {
      return mutate(async () => {
        try {
          await fileSystem.access(migrationMarkerPath);
          return {
            draftsImported: 0,
            historyImported: 0,
            imported: false,
          };
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }

        const legacyDrafts = Array.isArray(input?.drafts)
          ? input.drafts.filter(
              (draft) =>
                validDocumentInput(draft) &&
                typeof draft.capturedAt === "string" &&
                isWithinRecoveryLimit(draft),
            )
          : [];
        const mergedDrafts = await readDrafts();
        for (const draft of legacyDrafts) {
          const existingIndex = mergedDrafts.findIndex((current) =>
            sameDocument(current, draft),
          );
          if (existingIndex >= 0) mergedDrafts.splice(existingIndex, 1);
          mergedDrafts.push(draft);
        }
        await writeAtomicJson({
          backupPath: recoveryBackupPath,
          fileSystem,
          randomId,
          targetPath: recoveryPath,
          value: mergedDrafts.slice(-RECOVERY_LIMIT_TOTAL),
        });

        const existingEvents = await readHistoryEvents(fileSystem, historyPath);
        const existingIds = new Set(existingEvents.map((event) => event.id));
        const legacyHistory = Array.isArray(input?.history)
          ? input.history.filter(
              (version) =>
                validDocumentInput(version) &&
                typeof version.id === "string" &&
                typeof version.savedAt === "string" &&
                !existingIds.has(version.id) &&
                utf8Length(version.rawSource) <= HISTORY_MAX_SOURCE_BYTES,
            )
          : [];
        for (const version of legacyHistory) {
          await appendDurableLine(fileSystem, historyPath, {
            type: "version",
            ...version,
          });
        }
        await maybeCompactHistory([
          ...existingEvents,
          ...legacyHistory.map((version) => ({
            type: "version",
            ...version,
          })),
        ]);
        await writeAtomicJson({
          fileSystem,
          randomId,
          targetPath: migrationMarkerPath,
          value: { importedAt: now().toISOString(), version: 1 },
        });
        return {
          draftsImported: legacyDrafts.length,
          historyImported: legacyHistory.length,
          imported: true,
        };
      });
    },
  };
}

module.exports = {
  createNotesRecoveryStore,
  parseHistoryLines,
  reduceHistory,
};
