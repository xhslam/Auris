const { contextBridge, ipcRenderer } = require("electron");
const VAULT_CHANGED_CHANNEL = "shadowing:vault:changed";
const NOTES_MCP_REQUEST_CHANNEL = "shadowing:notes-mcp:request";
const TERMINAL_DATA_CHANNEL = "shadowing:terminal:data";
const TERMINAL_EXIT_CHANNEL = "shadowing:terminal:exit";
const UPDATES_STATE_CHANNEL = "shadowing:updates:state";
const {
  NIA_COMMAND_CHANNEL,
  NIA_EVENT_CHANNEL,
  NIA_IPC_COMMANDS,
} = require("./nia/nia-ipc.cjs");
const {
  HOST_COMMAND_CHANNEL: NIA_COMPANION_HOST_COMMAND_CHANNEL,
  HOST_EVENT_CHANNEL: NIA_COMPANION_HOST_EVENT_CHANNEL,
} = require("./nia/companion/companion-ipc.cjs");
const {
  WORKFLOW_COMMAND_CHANNEL,
  WORKFLOW_EVENT_CHANNEL,
  WORKFLOW_COMMANDS,
} = require("./workflows/workflow-ipc.cjs");
const {
  BROWSER_STATUS_COMMAND_CHANNEL,
  BROWSER_STATUS_EVENT_CHANNEL,
} = require("./browser/browser-status-ipc.cjs");
const {
  BROWSER_CHROME_COMMANDS,
  BROWSER_COMMAND_CHANNEL,
  BROWSER_SNAPSHOT_CHANNEL,
} = require("./browser/browser-ipc.cjs");
const {
  NOTES_RECOVERY_COMMAND_CHANNEL,
} = require("./notes/notes-recovery-ipc.cjs");

const NIA_ALLOWED = new Set(
  NIA_IPC_COMMANDS.filter((command) => command !== "subscribe" && command !== "unsubscribe"),
);
const WORKFLOW_ALLOWED = new Set(WORKFLOW_COMMANDS);
const BROWSER_CHROME_ALLOWED = new Set(BROWSER_CHROME_COMMANDS.filter(
  (command) => command !== "subscribe" && command !== "unsubscribe",
));

function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args);
}

const niaWrappers = new Map();
let niaMainSubscribed = false;
let niaSyncInFlight = false;
let niaRetryTimer = null;
let niaRetryDelayMs = 250;

function syncNiaSubscription() {
  if (niaSyncInFlight) return;
  const wants = niaWrappers.size > 0;
  if (wants === niaMainSubscribed) {
    if (niaRetryTimer !== null) {
      clearTimeout(niaRetryTimer);
      niaRetryTimer = null;
    }
    niaRetryDelayMs = 250;
    return;
  }
  if (niaRetryTimer !== null) return;
  const command = wants ? "subscribe" : "unsubscribe";
  niaSyncInFlight = true;
  let failed = false;
  void Promise.resolve()
    .then(() => invoke(NIA_COMMAND_CHANNEL, { command, payload: {} }))
    .then(() => {
      niaMainSubscribed = command === "subscribe";
      niaRetryDelayMs = 250;
    })
    .catch(() => {
      failed = true;
    })
    .finally(() => {
      niaSyncInFlight = false;
      if ((niaWrappers.size > 0) !== niaMainSubscribed) {
        if (failed) {
          niaRetryTimer = setTimeout(() => {
            niaRetryTimer = null;
            niaRetryDelayMs = Math.min(niaRetryDelayMs * 2, 5_000);
            syncNiaSubscription();
          }, niaRetryDelayMs);
        } else {
          syncNiaSubscription();
        }
      }
    });
}

const niaBridge = Object.freeze({
  invoke(command, payload = {}) {
    if (!NIA_ALLOWED.has(command)) {
      return Promise.reject(new TypeError("Unsupported Nia command"));
    }
    return invoke(NIA_COMMAND_CHANNEL, { command, payload });
  },
  subscribe(listener) {
    if (typeof listener !== "function" || niaWrappers.has(listener)) return false;
    const wrapper = (_event, niaEvent) => listener(niaEvent);
    niaWrappers.set(listener, wrapper);
    ipcRenderer.on(NIA_EVENT_CHANNEL, wrapper);
    syncNiaSubscription();
    return true;
  },
  unsubscribe(listener) {
    const wrapper = niaWrappers.get(listener);
    if (!wrapper) return false;
    niaWrappers.delete(listener);
    ipcRenderer.removeListener(NIA_EVENT_CHANNEL, wrapper);
    syncNiaSubscription();
    return true;
  },
});

const niaStandaloneListeners = new Set();
let pendingNiaStandaloneLaunch = null;
ipcRenderer.on("shadowing:nia-standalone:launch", (_event, launch) => {
  pendingNiaStandaloneLaunch = launch;
  for (const listener of niaStandaloneListeners) listener(launch);
});
const niaStandaloneBridge = Object.freeze({
  open: (launch = {}) => invoke("shadowing:nia-standalone:open", launch),
  subscribeLaunch(listener) {
    if (typeof listener !== "function") return () => undefined;
    niaStandaloneListeners.add(listener);
    if (pendingNiaStandaloneLaunch) queueMicrotask(() => listener(pendingNiaStandaloneLaunch));
    return () => niaStandaloneListeners.delete(listener);
  },
});
const NIA_COMPANION_HOST_ALLOWED = new Set(["snapshot", "wake", "rest", "mute", "text", "conversations", "conversation-turns", "conversation-detail", "conversation-search", "conversation-saving", "companion-visibility"]);
const niaCompanionHostListeners = new Map();
const niaCompanionHostBridge = Object.freeze({
  invoke(command, payload = {}) {
    if (!NIA_COMPANION_HOST_ALLOWED.has(command)) return Promise.reject(new TypeError("Unsupported Nia companion command"));
    return invoke(NIA_COMPANION_HOST_COMMAND_CHANNEL, { command, payload });
  },
  subscribe(listener) {
    if (typeof listener !== "function" || niaCompanionHostListeners.has(listener)) return false;
    const wrapper = (_event, value) => listener(value);
    niaCompanionHostListeners.set(listener, wrapper);
    ipcRenderer.on(NIA_COMPANION_HOST_EVENT_CHANNEL, wrapper);
    return true;
  },
  unsubscribe(listener) {
    const wrapper = niaCompanionHostListeners.get(listener);
    if (!wrapper) return false;
    niaCompanionHostListeners.delete(listener);
    ipcRenderer.removeListener(NIA_COMPANION_HOST_EVENT_CHANNEL, wrapper);
    return true;
  },
});
const workflowWrappers = new Map();
const workflowBridge = Object.freeze({
  invoke(command, payload = {}) {
    if (!WORKFLOW_ALLOWED.has(command)) return Promise.reject(new TypeError("Unsupported workflow command"));
    return invoke(WORKFLOW_COMMAND_CHANNEL, { command, payload });
  },
  subscribe(listener) {
    if (typeof listener !== "function" || workflowWrappers.has(listener)) return false;
    const wrapper = (_event, value) => listener(value);
    workflowWrappers.set(listener, wrapper);
    ipcRenderer.on(WORKFLOW_EVENT_CHANNEL, wrapper);
    if (workflowWrappers.size === 1) ipcRenderer.send(`${WORKFLOW_COMMAND_CHANNEL}:subscribe`);
    return true;
  },
  unsubscribe(listener) {
    const wrapper = workflowWrappers.get(listener);
    if (!wrapper) return false;
    workflowWrappers.delete(listener);
    ipcRenderer.removeListener(WORKFLOW_EVENT_CHANNEL, wrapper);
    if (workflowWrappers.size === 0) ipcRenderer.send(`${WORKFLOW_COMMAND_CHANNEL}:unsubscribe`);
    return true;
  },
});

const browserChromeWrappers = new Map();
let browserChromeMainSubscribed = false;
let browserChromeSync = Promise.resolve();

function syncBrowserChromeSubscription() {
  browserChromeSync = browserChromeSync.then(async () => {
    const wantsSubscription = browserChromeWrappers.size > 0;
    if (wantsSubscription === browserChromeMainSubscribed) return;
    const command = wantsSubscription ? "subscribe" : "unsubscribe";
    await invoke(BROWSER_COMMAND_CHANNEL, { command, payload: {} });
    browserChromeMainSubscribed = wantsSubscription;
  }).catch(() => {
    // Main remains authoritative; a later listener change will retry the sync.
  });
}

const browserChromeBridge = Object.freeze({
  invoke(command, payload = {}) {
    if (!BROWSER_CHROME_ALLOWED.has(command)) {
      return Promise.reject(new TypeError("Unsupported browser command"));
    }
    return invoke(BROWSER_COMMAND_CHANNEL, { command, payload });
  },
  subscribe(listener) {
    if (typeof listener !== "function" || browserChromeWrappers.has(listener)) return false;
    const wrapper = (_event, snapshot) => listener(snapshot);
    browserChromeWrappers.set(listener, wrapper);
    ipcRenderer.on(BROWSER_SNAPSHOT_CHANNEL, wrapper);
    syncBrowserChromeSubscription();
    return true;
  },
  unsubscribe(listener) {
    const wrapper = browserChromeWrappers.get(listener);
    if (!wrapper) return false;
    browserChromeWrappers.delete(listener);
    ipcRenderer.removeListener(BROWSER_SNAPSHOT_CHANNEL, wrapper);
    syncBrowserChromeSubscription();
    return true;
  },
});

contextBridge.exposeInMainWorld("aurisWorkflows", workflowBridge);
contextBridge.exposeInMainWorld("aurisBrowser", browserChromeBridge);

contextBridge.exposeInMainWorld("shadowingDesktop", {
  desktopIsland: {
    acknowledgeIntent: (actionId) =>
      invoke("shadowing:desktop-island:acknowledge-intent", actionId),
    getSettings: () => invoke("shadowing:desktop-island:get-settings"),
    listPendingIntents: () =>
      invoke("shadowing:desktop-island:list-pending-intents"),
    onIntent: (listener) => {
      if (typeof listener !== "function") return () => undefined;
      const handler = (_event, intent) => listener(intent);
      ipcRenderer.on("shadowing:desktop-island:intent", handler);
      return () => ipcRenderer.removeListener("shadowing:desktop-island:intent", handler);
    },
    syncSnapshot: (snapshot) =>
      invoke("shadowing:desktop-island:sync-snapshot", snapshot),
    updateSettings: (patch) =>
      invoke("shadowing:desktop-island:update-settings", patch),
  },
  menu: {
    onCommand: (listener) => {
      if (typeof listener !== "function") return () => undefined;
      const handler = (_event, commandId) => listener(commandId);
      ipcRenderer.on("shadowing:menu:command", handler);
      return () => ipcRenderer.removeListener("shadowing:menu:command", handler);
    },
  },
  nia: niaBridge,
  niaCompanion: niaCompanionHostBridge,
  niaStandalone: niaStandaloneBridge,
  workflows: workflowBridge,
  aiDock: {
    setActiveProvider: (providerId) =>
      invoke("shadowing:ai-dock:set-active-provider", providerId),
    setActiveView: (view) => invoke("shadowing:ai-dock:set-active-view", view),
    setVisibility: (isOpen) => invoke("shadowing:ai-dock:set-visibility", isOpen),
    syncLayout: (layout) => invoke("shadowing:ai-dock:sync-layout", layout),
  },
  aiHistory: {
    captureCurrentConversation: (providerId) =>
      invoke("shadowing:ai-history:capture-current-conversation", providerId),
    delete: (id) => invoke("shadowing:ai-history:delete", id),
    export: () => invoke("shadowing:ai-history:export"),
    import: (payload, mergeStrategy) =>
      invoke("shadowing:ai-history:import", payload, mergeStrategy),
    list: () => invoke("shadowing:ai-history:list"),
    save: (input) => invoke("shadowing:ai-history:save", input),
    search: (query) => invoke("shadowing:ai-history:search", query),
    toggleFavorite: (id) => invoke("shadowing:ai-history:toggle-favorite", id),
  },
  aiPrompts: {
    delete: (id) => invoke("shadowing:ai-prompts:delete", id),
    export: () => invoke("shadowing:ai-prompts:export"),
    import: (payload, mergeStrategy) =>
      invoke("shadowing:ai-prompts:import", payload, mergeStrategy),
    importDefaultLibrary: () => invoke("shadowing:ai-prompts:import-default-library"),
    list: () => invoke("shadowing:ai-prompts:list"),
    save: (input) => invoke("shadowing:ai-prompts:save", input),
    search: (query) => invoke("shadowing:ai-prompts:search", query),
    update: (id, input) => invoke("shadowing:ai-prompts:update", id, input),
  },
  commands: {
    list: () => invoke("shadowing:commands:list"),
    run: (commandId) => invoke("shadowing:commands:run", commandId),
  },
  clipboard: {
    readText: () => invoke("shadowing:clipboard:read-text"),
    writeHtml: (html, text) =>
      invoke("shadowing:clipboard:write-html", html, text),
    writeText: (text) => invoke("shadowing:clipboard:write-text", text),
  },
  downloads: {
    exportJson: (filename, payload) =>
      invoke("shadowing:downloads:export-json", filename, payload),
    exportPdf: (filename, html, options) =>
      invoke("shadowing:downloads:export-pdf", filename, html, options),
    exportText: (filename, content, contentType) =>
      invoke("shadowing:downloads:export-text", filename, content, contentType),
    exportVaultFolder: (folderName, manifest) =>
      invoke("shadowing:downloads:export-vault-folder", folderName, manifest),
    getDirectoryInfo: () => invoke("shadowing:downloads:get-directory-info"),
    revealDirectory: () => invoke("shadowing:downloads:reveal-directory"),
  },
  assessmentHistory: {
    delete: (assessmentId) => invoke("shadowing:assessment-history:delete", assessmentId),
    importLegacy: (records) => invoke("shadowing:assessment-history:import-legacy", records),
    list: () => invoke("shadowing:assessment-history:list"),
    save: (record) => invoke("shadowing:assessment-history:save", record),
  },
  browserGrants: {
    getSnapshot: () => invoke("shadowing:browser-grants:get-snapshot"),
    revoke: (grantId) => invoke("shadowing:browser-grants:revoke", grantId),
    subscribe: (listener) => {
      if (typeof listener !== "function") {
        return () => undefined;
      }
      const handler = (_event, snapshot) => {
        listener(snapshot);
      };
      ipcRenderer.on("shadowing:browser-grants:changed", handler);
      return () => {
        ipcRenderer.removeListener("shadowing:browser-grants:changed", handler);
      };
    },
  },
  browserSecurity: {
    getSnapshot: () => invoke("shadowing:browser-security:get-snapshot"),
    setAutomationEnabled: (enabled) =>
      invoke("shadowing:browser-security:set-automation-enabled", enabled),
    subscribe: (listener) => {
      if (typeof listener !== "function") {
        return () => undefined;
      }
      const handler = (_event, snapshot) => {
        listener(snapshot);
      };
      ipcRenderer.on("shadowing:browser-security:changed", handler);
      return () => {
        ipcRenderer.removeListener("shadowing:browser-security:changed", handler);
      };
    },
  },
  browserStatus: {
    getBrowserStatus: () => invoke(BROWSER_STATUS_COMMAND_CHANNEL, { command: "getBrowserStatus" }),
    focusBrowserWindow: (windowId) => invoke(BROWSER_STATUS_COMMAND_CHANNEL, { command: "focusBrowserWindow", windowId }),
    focusBrowserTab: (windowId, tabId) => invoke(BROWSER_STATUS_COMMAND_CHANNEL, { command: "focusBrowserTab", windowId, tabId }),
    subscribe: (listener) => {
      if (typeof listener !== "function") return () => undefined;
      const handler = (_event, snapshot) => listener(snapshot);
      ipcRenderer.on(BROWSER_STATUS_EVENT_CHANNEL, handler);
      void invoke(BROWSER_STATUS_COMMAND_CHANNEL, { command: "subscribe" }).catch(() => undefined);
      return () => {
        ipcRenderer.removeListener(BROWSER_STATUS_EVENT_CHANNEL, handler);
        void invoke(BROWSER_STATUS_COMMAND_CHANNEL, { command: "unsubscribe" }).catch(() => undefined);
      };
    },
  },
  notesMcp: {
    getServerInfo: () => invoke("shadowing:notes-mcp:get-server-info"),
    installClient: (clientId) => invoke("shadowing:notes-mcp:install-client", clientId),
    listClients: () => invoke("shadowing:notes-mcp:list-clients"),
    removeClient: (clientId) => invoke("shadowing:notes-mcp:remove-client", clientId),
    updatePolicy: (policy) => invoke("shadowing:notes-mcp:update-policy", policy),
    onRequest: (listener) => {
      if (typeof listener !== "function") {
        return () => undefined;
      }

      const handler = (_event, payload) => {
        const bridgeRequestId = payload?.bridgeRequestId;

        Promise.resolve(listener(payload?.request))
          .then((result) =>
            invoke("shadowing:notes-mcp:resolve-request", bridgeRequestId, result),
          )
          .catch((error) =>
            invoke(
              "shadowing:notes-mcp:reject-request",
              bridgeRequestId,
              error instanceof Error ? error.message : String(error),
            ),
          );
      };
      ipcRenderer.on(NOTES_MCP_REQUEST_CHANNEL, handler);

      return () => {
        ipcRenderer.removeListener(NOTES_MCP_REQUEST_CHANNEL, handler);
      };
    },
  },
  notesRecovery: {
    captureDraft: (draft) =>
      invoke(NOTES_RECOVERY_COMMAND_CHANNEL, {
        action: "capture-draft",
        draft,
      }),
    clearDraft: (path, vaultRoot) =>
      invoke(NOTES_RECOVERY_COMMAND_CHANNEL, {
        action: "clear-draft",
        path,
        vaultRoot,
      }),
    captureWorkspace: (vaultRoot, workspace) =>
      invoke(NOTES_RECOVERY_COMMAND_CHANNEL, {
        action: "capture-workspace",
        vaultRoot,
        workspace,
      }),
    importLegacy: (payload) =>
      invoke(NOTES_RECOVERY_COMMAND_CHANNEL, {
        action: "import-legacy",
        ...payload,
      }),
    listDrafts: (vaultRoot) =>
      invoke(NOTES_RECOVERY_COMMAND_CHANNEL, {
        action: "list-drafts",
        vaultRoot,
      }),
    listHistory: (path, vaultRoot) =>
      invoke(NOTES_RECOVERY_COMMAND_CHANNEL, {
        action: "list-history",
        path,
        vaultRoot,
      }),
    loadWorkspace: (vaultRoot) =>
      invoke(NOTES_RECOVERY_COMMAND_CHANNEL, {
        action: "load-workspace",
        vaultRoot,
      }),
    recordHistory: (version) =>
      invoke(NOTES_RECOVERY_COMMAND_CHANNEL, {
        action: "record-history",
        version,
      }),
  },
  plugins: {
    list: () => invoke("shadowing:plugins:list"),
    openDirectory: () => invoke("shadowing:plugins:open-directory"),
    setEnabled: (pluginId, enabled) =>
      invoke("shadowing:plugins:set-enabled", pluginId, enabled),
  },
  runtimeState: {
    get: () => invoke("shadowing:runtime-state:get"),
    importLegacy: (legacyState) =>
      invoke("shadowing:runtime-state:import-legacy", legacyState),
    setResumeTarget: (targetType, targetId) =>
      invoke("shadowing:runtime-state:set-resume-target", targetType, targetId),
    setLastWorkspace: (workspace) =>
      invoke("shadowing:runtime-state:set-last-workspace", workspace),
  },
  trainingHistory: {
    deleteSession: (sessionId) =>
      invoke("shadowing:training-history:delete-session", sessionId),
    getPlayback: (sessionId) =>
      invoke("shadowing:training-history:get-playback", sessionId),
    listRecent: () => invoke("shadowing:training-history:list-recent"),
    savePreparedSession: (input) =>
      invoke("shadowing:training-history:save-prepared-session", input),
  },
  system: {
    detectBinary: (name) => invoke("shadowing:system:detect-binary", name),
    openExternal: (url) => invoke("shadowing:system:open-external", url),
    openUpgrade: () => invoke("shadowing:system:open-upgrade"),
    pickFile: (options) => invoke("shadowing:system:pick-file", options),
  },
  voiceEngine: {
    generate: (input) => invoke("shadowing:voice-engine:generate", input),
    getCapabilities: () => invoke("shadowing:voice-engine:get-capabilities"),
    getStatus: () => invoke("shadowing:voice-engine:get-status"),
    start: () => invoke("shadowing:voice-engine:start"),
    stop: () => invoke("shadowing:voice-engine:stop"),
  },
  terminal: {
    create: (input) => invoke("shadowing:terminal:create", input),
    kill: (sessionId) => invoke("shadowing:terminal:kill", sessionId),
    list: () => invoke("shadowing:terminal:list"),
    resume: (input) => invoke("shadowing:terminal:resume", input),
    onData: (listener) => {
      if (typeof listener !== "function") {
        return () => undefined;
      }

      const handler = (_event, payload) => listener(payload);
      ipcRenderer.on(TERMINAL_DATA_CHANNEL, handler);

      return () => {
        ipcRenderer.removeListener(TERMINAL_DATA_CHANNEL, handler);
      };
    },
    onExit: (listener) => {
      if (typeof listener !== "function") {
        return () => undefined;
      }

      const handler = (_event, payload) => listener(payload);
      ipcRenderer.on(TERMINAL_EXIT_CHANNEL, handler);

      return () => {
        ipcRenderer.removeListener(TERMINAL_EXIT_CHANNEL, handler);
      };
    },
    resize: (sessionId, size) => invoke("shadowing:terminal:resize", sessionId, size),
    write: (sessionId, data) => invoke("shadowing:terminal:write", sessionId, data),
  },
  updates: {
    check: () => invoke("shadowing:updates:check"),
    download: () => invoke("shadowing:updates:download"),
    getState: () => invoke("shadowing:updates:get-state"),
    // 主进程是更新状态的唯一权威：这里只订阅推送，renderer 不维护第二份真相。
    onStateChange: (listener) => {
      if (typeof listener !== "function") {
        return () => undefined;
      }

      const handler = (_event, snapshot) => listener(snapshot);
      ipcRenderer.on(UPDATES_STATE_CHANNEL, handler);

      return () => {
        ipcRenderer.removeListener(UPDATES_STATE_CHANNEL, handler);
      };
    },
    openReleases: () => invoke("shadowing:updates:open-releases"),
    publishRelease: () => invoke("shadowing:updates:publish-release"),
    syncRepository: () => invoke("shadowing:updates:sync-repository"),
    quitAndInstall: () => invoke("shadowing:updates:quit-and-install"),
    reset: () => invoke("shadowing:updates:reset"),
    recover: () => invoke("shadowing:updates:recover"),
  },
  vault: {
    copyFile: (fromPath, toPath) =>
      invoke("shadowing:vault:copy-file", fromPath, toPath),
    createDirectory: (relativePath) => invoke("shadowing:vault:create-directory", relativePath),
    getDirectoryInfo: () => invoke("shadowing:vault:get-directory-info"),
    listFiles: () => invoke("shadowing:vault:list-files"),
    moveFile: (fromPath, toPath) => invoke("shadowing:vault:move-file", fromPath, toPath),
    onDidChange: (listener) => {
      if (typeof listener !== "function") {
        return () => undefined;
      }

      const handler = () => listener();
      ipcRenderer.on(VAULT_CHANGED_CHANNEL, handler);

      return () => {
        ipcRenderer.removeListener(VAULT_CHANGED_CHANNEL, handler);
      };
    },
    listRoots: () => invoke("shadowing:vault:list-roots"),
    removeRoot: (rootPath) => invoke("shadowing:vault:remove-root", rootPath),
    pickDirectory: () => invoke("shadowing:vault:pick-directory"),
    pickFile: () => invoke("shadowing:vault:pick-file"),
    readFile: (relativePath) => invoke("shadowing:vault:read-file", relativePath),
    renameFile: (fromPath, toPath) =>
      invoke("shadowing:vault:rename-file", fromPath, toPath),
    removeFile: (relativePath) => invoke("shadowing:vault:remove-file", relativePath),
    restoreLastDeleted: () => invoke("shadowing:vault:restore-last-deleted"),
    revealFile: (relativePath) => invoke("shadowing:vault:reveal-file", relativePath),
    revealPluginsDirectory: () => invoke("shadowing:vault:reveal-plugins-directory"),
    trashRoot: (rootPath) => invoke("shadowing:vault:trash-root", rootPath),
    saveFile: (relativePath, content) =>
      invoke("shadowing:vault:save-file", relativePath, content),
    // 在已授权的根之间切换。主进程只接受 list-roots 里出现过的路径——理由见
    // main.cjs 的 setVaultRoot 注释（否则笔记读写会被升级成任意文件读取）。
    setRoot: (rootPath) => invoke("shadowing:vault:set-root", rootPath),
  },
  videoLibrary: {
    getSnapshot: () => invoke("shadowing:video-library:get-snapshot"),
    getVideoDetails: (videoId) =>
      invoke("shadowing:video-library:get-video-details", videoId),
    importFiles: () => invoke("shadowing:video-library:import-files"),
    pickDirectory: () => invoke("shadowing:video-library:pick-directory"),
    refresh: () => invoke("shadowing:video-library:refresh"),
    revealDirectory: () => invoke("shadowing:video-library:reveal-directory"),
    saveThumbnail: (videoId, thumbnail) =>
      invoke("shadowing:video-library:save-thumbnail", videoId, thumbnail),
    updateSourceMetadata: (videoId, metadata) =>
      invoke("shadowing:video-library:update-source-metadata", videoId, metadata),
  },
  window: {
    showInFolder: (targetPath) => invoke("shadowing:window:show-in-folder", targetPath),
  },
});
