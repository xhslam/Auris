const NOTES_RECOVERY_COMMAND_CHANNEL = "shadowing:notes-recovery:command";

function requireInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Notes recovery input must be an object.");
  }
  return input;
}

function createNotesRecoveryIpc({
  ipcMain,
  requireTrustedSender,
  store,
}) {
  if (!ipcMain || typeof ipcMain.handle !== "function") {
    throw new TypeError("Notes recovery IPC requires ipcMain.");
  }
  if (typeof requireTrustedSender !== "function") {
    throw new TypeError("Notes recovery IPC requires sender validation.");
  }
  if (!store) {
    throw new TypeError("Notes recovery IPC requires a store.");
  }

  const handle = async (event, rawInput) => {
    requireTrustedSender(event);
    const input = requireInput(rawInput);
    switch (input.action) {
      case "capture-draft":
        return store.captureDraft(input.draft);
      case "clear-draft":
        return store.clearDraft(input.path, input.vaultRoot ?? null);
      case "list-drafts":
        return store.listDrafts(input.vaultRoot ?? null);
      case "capture-workspace":
        return store.captureWorkspace({
          vaultRoot: input.vaultRoot ?? null,
          workspace: input.workspace,
        });
      case "load-workspace":
        return store.loadWorkspace(input.vaultRoot ?? null);
      case "record-history":
        return store.recordHistory(input.version);
      case "list-history":
        return store.listHistory(input.path, input.vaultRoot ?? null);
      case "import-legacy":
        return store.importLegacy({
          drafts: input.drafts,
          history: input.history,
        });
      default:
        throw new TypeError("Unsupported notes recovery action.");
    }
  };

  ipcMain.handle(NOTES_RECOVERY_COMMAND_CHANNEL, handle);
  return {
    dispose() {
      ipcMain.removeHandler?.(NOTES_RECOVERY_COMMAND_CHANNEL);
    },
  };
}

module.exports = {
  NOTES_RECOVERY_COMMAND_CHANNEL,
  createNotesRecoveryIpc,
};
