const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  app,
  BrowserWindow,
  WebContentsView,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  protocol,
  safeStorage,
  screen,
  session,
  shell,
  utilityProcess,
} = require("electron");
const { createApplicationMenuTemplate } = require("./menu-template.cjs");
const { createAiLibraryRepository } = require("./ai-library-db.cjs");
const { getExtractorScriptForProvider } = require("./ai-extractors/index.cjs");
const { createLocalHistoryRepository } = require("./local-history-db.cjs");
const {
  createDefaultRuntimeState,
  createRuntimeStateRepository,
} = require("./runtime-state-db.cjs");
const {
  createTerminalSessionManager,
} = require("./terminal-session-manager.cjs");
const { AI_PROVIDER_IDS } = require("./ai-provider-config.cjs");
const { createAiViewManager } = require("./ai-view-manager.cjs");
const { createAiDockStateBuffer } = require("./ai-dock-state-buffer.cjs");
const {
  createTerminalSessionInput,
  normalizeTerminalSize,
  normalizeTerminalString,
} = require("./terminal-session-policy.cjs");
const { createNotesMcpBridge } = require("./notes-mcp-bridge.cjs");
const {
  createDefaultMcpPolicy,
  getMcpClientCredentialsPath,
  getNotesMcpDiscoveryPath: resolveNotesMcpDiscoveryPath,
  normalizeMcpPolicy,
  parseMcpDiscovery,
} = require("./auris-mcp-config.cjs");
const {
  installMcpClient,
  listMcpClients,
  removeMcpClient,
} = require("./auris-mcp-installer.cjs");
const {
  createMcpClientCredentialStore,
} = require("./mcp/client-credential-store.cjs");
const {
  MEDIA_PROTOCOL_SCHEME,
  createVideoStreamResponse,
  createVideoVariantPlaybackUrl,
  getMediaMimeType,
  parseVaultMediaUrl,
  parseVideoVariantPlaybackUrl,
} = require("./video-media-protocol.cjs");
const { createVideoLibraryRepository } = require("./video-library-db.cjs");
const { createVoiceEngineRuntime } = require("./voice-engine-runtime.cjs");
const {
  findOpenPort,
  findResponsiveServerUrl,
  waitForPort,
} = require("./utils/find-open-port.cjs");
const { createNextServerLaunchPlan } = require("./next-server-launch.cjs");
const { createBrowserCapabilities } = require("./browser/browser-capabilities.cjs");
const { createBrowserApprovalManager } = require("./browser/browser-approvals.cjs");
const { createBrowserAuditLog } = require("./browser/browser-audit.cjs");
const { createBrowserCommandDispatcher } = require("./browser/browser-command-dispatcher.cjs");
const { createBrowserGrantManager } = require("./browser/browser-grants.cjs");
const { createBrowserGrantsIpc } = require("./browser/browser-grants-ipc.cjs");
const { createBrowserHumanReclaim } = require("./browser/browser-human-reclaim.cjs");
const { createBrowserIpc } = require("./browser/browser-ipc.cjs");
const { createBrowserLeaseManager } = require("./browser/browser-lease.cjs");
const { createBrowserNavigationPolicy } = require("./browser/browser-navigation-policy.cjs");
const { createBrowserOperationGuard } = require("./browser/browser-operation-guard.cjs");
const { createBrowserPageExecutor } = require("./browser/browser-page-executor.cjs");
const { createBrowserPagePolicy } = require("./browser/browser-page-policy.cjs");
const { createBrowserPartitionSelector } = require("./browser/browser-partitions.cjs");
const { createBrowserRegistry } = require("./browser/browser-registry.cjs");
const {
  createBrowserSecurityGates,
} = require("./browser/browser-security-gates.cjs");
const { createBrowserSecurityIpc } = require("./browser/browser-security-ipc.cjs");
const {
  createBrowserSessionCapabilities,
} = require("./browser/browser-session-capabilities.cjs");
const {
  createBrowserStateRepository,
} = require("./browser/browser-state-repository.cjs");
const { createBrowserStatusIpc } = require("./browser/browser-status-ipc.cjs");
const { createBrowserStatusService } = require("./browser/browser-status-service.cjs");
const { createBrowserSurfaceManager } = require("./browser/browser-surface-manager.cjs");
const { createBrowserWindowManager } = require("./browser/browser-window-manager.cjs");
const { createBrowserUxPolicy } = require("./browser/browser-ux-policy.cjs");
const { createBrowserDialogService } = require("./browser/browser-dialog-service.cjs");
const { createBrowserDownloadService } = require("./browser/browser-download-service.cjs");
const { createBrowserRecovery } = require("./browser/browser-recovery.cjs");
const { createBrowserHibernation } = require("./browser/browser-hibernation.cjs");
const {
  createBrowserPublicError,
} = require("./shared/browser-contract.cjs");
const { createKeychainSecretStore } = require("./security/keychain-secret-store.cjs");
const { createNiaProviderStore } = require("./nia/nia-provider-store.cjs");
const { createNiaProviderRuntime } = require("./nia/nia-provider-runtime.cjs");
const { createNiaIpc } = require("./nia/nia-ipc.cjs");
const { createNiaDefinitionStore } = require("./nia/nia-definition-store.cjs");
const { BUILT_IN_NIA_DEFINITIONS } = require("./shared/nia-builtin-definitions.cjs");
const { createNiaWorkflowRuntime } = require("./workflows/nia-workflow-runtime.cjs");
const { createBrowserWorkflowApiService } = require("./workflows/browser-workflow-api-service.cjs");
const { createBrowserWorkflowRuntime } = require("./workflows/browser-workflow-runtime.cjs");
const {
  MAIN_WORKFLOW_RUNTIME_CAPABILITIES,
  createWorkflowCapabilities,
} = require("./workflows/workflow-capabilities.cjs");
const { createWorkflowFacade } = require("./workflows/workflow-facade.cjs");
const { createWorkflowIpc } = require("./workflows/workflow-ipc.cjs");
const { createWorkflowRunRegistry } = require("./workflows/workflow-run-registry.cjs");
const { createNotesRecoveryStore } = require("./notes/notes-recovery-store.cjs");
const { createNotesRecoveryIpc } = require("./notes/notes-recovery-ipc.cjs");
const { normalizePdfExportOptions } = require("./pdf-export-options.cjs");
const {
  createVaultFileOperations,
} = require("./notes/vault-file-operations.cjs");
// 换根的授权判定。别名导入：本文件里已有一个读 desktopConfig 的同名薄封装
// `rememberVaultRoot`，模块导出的是它的纯函数内核。
const {
  AUTHORIZATION_ERRORS: VAULT_ROOT_ERRORS,
  authorizeVaultRoot,
  normalizeKnownVaultRoots,
  rememberVaultRoot: rememberKnownVaultRoot,
} = require("./vault/vault-roots.cjs");
const { walkVaultFiles } = require("./vault/vault-file-walker.cjs");
const { createAppUpdater } = require("./updates/app-updater.cjs");
const { createTerminalSessionRecoveryStore } = require("./terminal-session-recovery-store.cjs");
const { createCloseAttemptTracker } = require("./close-attempt-tracker.cjs");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const APP_ICON_PATH = path.join(PROJECT_ROOT, "assets", "app-icon.png");
const AURIS_APP_VERSION = (() => {
  if (app.isPackaged) return app.getVersion();
  try {
    const manifest = JSON.parse(
      fsSync.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf8"),
    );
    return typeof manifest.version === "string" && manifest.version
      ? manifest.version
      : app.getVersion();
  } catch {
    return app.getVersion();
  }
})();
const AI_LIBRARY_DB_FILE = "shadowing-ai-library.db";
const DESKTOP_CONFIG_FILE = "shadowing-desktop-config.json";
const DESKTOP_PLUGIN_DIR = path.join(".shadowing", "plugins");
const NOTES_MCP_DISCOVERY_FILE = "auris-notes-mcp-port";
const LOCAL_HISTORY_DB_FILE = "shadowing-local-history.db";
const BROWSER_STATE_DB_FILE = "auris-browser-state.db";
const RUNTIME_STATE_DB_FILE = "shadowing-runtime-state.db";
const TRAINING_AUDIO_DIR = "training-audio";
const TERMINAL_RECOVERY_FILE = "terminal-session-recovery.json";
const VIDEO_LIBRARY_DATA_DIR = "video-libraries";
const VIDEO_LIBRARY_DB_FILE = "shadowing-video-library.db";
const VIDEO_LIBRARY_EXTENSIONS = new Set([
  ".avi",
  ".flv",
  ".m2ts",
  ".m4v",
  ".mkv",
  ".mov",
  ".mp4",
  ".ogv",
  ".ts",
  ".webm",
  ".wmv",
]);
// 库自己生成的子目录，扫描时跳过，避免把缩略图/转码产物当成源视频
const VIDEO_LIBRARY_MANAGED_DIRS = new Set([
  "analysis",
  "thumbnails",
  "transcodes",
]);
const DEV_SERVER_TIMEOUT_MS = 90_000;
const DEFAULT_WINDOW_HEIGHT = 900;
const DEFAULT_WINDOW_WIDTH = 1400;
const MAX_RICH_CLIPBOARD_HTML_BYTES = 40 * 1024 * 1024;
const MAX_RICH_CLIPBOARD_TEXT_BYTES = 4 * 1024 * 1024;
const isDevMode = process.argv.includes("--dev");
const packagedSmokeUserData = process.env.AURIS_PACKAGED_SMOKE_USER_DATA;
if (process.env.AURIS_PACKAGED_SMOKE === "1" && packagedSmokeUserData) {
  const resolvedSmokeUserData = path.resolve(packagedSmokeUserData);
  fsSync.mkdirSync(resolvedSmokeUserData, { recursive: true });
  app.setPath("userData", resolvedSmokeUserData);
}
// app.asar is read-only. Keep packaged diagnostics beside the user's other
// desktop state so renderer launch failures remain observable after release.
const DESKTOP_LOG_ROOT = app.isPackaged ? app.getPath("userData") : PROJECT_ROOT;
const STARTUP_LOG_PATH = path.join(DESKTOP_LOG_ROOT, "electron-startup.log");
const NEXT_PROCESS_LOG_PATH = path.join(DESKTOP_LOG_ROOT, "electron-next.log");
const TERMINAL_DATA_CHANNEL = "shadowing:terminal:data";
const TERMINAL_EXIT_CHANNEL = "shadowing:terminal:exit";

let mainWindow = null;
let niaStandaloneWindow = null;
let mainWindowCreationPromise = null;
let nextProcess = null;
let nextProcessReady = false;
let nextServerStartPromise = null;
let nextServerUrl = null;
let desktopConfig = createDefaultDesktopConfig();
let pluginRuntime = createEmptyPluginRuntime();
let pendingVaultChangeSignal = null;
let runtimeStateFallback = createDefaultRuntimeState();
let runtimeStateRepository = null;
let aiLibraryRepository = null;
let localHistoryRepository = null;
let videoLibraryRepository = null;
let videoLibraryRepositoryPath = null;
let vaultWatcher = null;
let vaultMutationChain = Promise.resolve();
let terminalSessionManager = null;
let notesRecoveryStore = null;
let terminalSessionUnsubscribers = [];
let voiceEngineRuntime = null;
let aiViewManager = null;
let notesMcpBridge = null;
let mcpClientCredentialStore = null;
let browserMcpDispatcher = null;
let browserCapabilities = null;
let browserSecurityGates = null;
let browserSessionCapabilities = null;
let browserLeaseManager = null;
let browserRegistry = null;
let browserPartitionSelector = null;
let browserPageExecutor = null;
let browserSecurityIpc = null;
let browserStatusIpc = null;
let browserStatusService = null;
let browserAuditLog = null;
const aiDockStateBuffer = createAiDockStateBuffer({
  onCommit: (nextAiDockState) =>
    updateRuntimeState({
      aiDock: nextAiDockState,
    }),
});

let browserWindowManager = null;
let browserIpc = null;
let browserApprovalManager = null;
let browserGrantManager = null;
let browserGrantsIpc = null;
let browserStateRepository = null;
let niaIpc = null;
let niaProviderRuntime = null;
let niaDefinitions = null;
let browserOperationGuard = null;
let workflowIpc = null;
let browserWorkflowRuntime = null;
let workflowFacade = null;
let workflowCapabilities = null;
let browserWorkflowRunRegistry = null;

/**
 * 唯一的 Nia 定义存储。
 *
 * 两处需要它：nia IPC（列出/读取定义，供 Nia Picker 用）与 workflow 子系统
 * （把定义当作 step 仓库）。它们的初始化顺序不固定，所以这里做成惰性单例，
 * 而不是在任一个子系统内部创建——后者会让先初始化的那个持有一份、另一个再建
 * 一份，同一批定义出现两个实例。
 *
 * `builtins` 传入真实内置定义。此前 workflow 子系统用 `builtins: []` 创建它，
 * 于是 `BUILT_IN_NIA_DEFINITIONS` 里的两个定义从未真正装载过——只有测试读到它们。
 */
function getNiaDefinitionStore() {
  if (niaDefinitions) return niaDefinitions;
  niaDefinitions = createNiaDefinitionStore({
    baseDir: path.join(app.getPath("userData"), "nia", "definitions"),
    builtins: BUILT_IN_NIA_DEFINITIONS,
  });
  return niaDefinitions;
}

function createNiaSecretPersistence(baseDir) {
  const secretsDir = path.join(baseDir, "secrets");
  const resolvePath = (key) => {
    if (typeof key !== "string" || key.length === 0 || key.length > 256) {
      throw new TypeError("Invalid Nia secret persistence key.");
    }
    return path.join(secretsDir, `${Buffer.from(key, "utf8").toString("base64url")}.bin`);
  };
  return Object.freeze({
    async get(key) {
      try {
        return await fs.readFile(resolvePath(key));
      } catch (error) {
        if (error?.code === "ENOENT") return null;
        throw error;
      }
    },
    async set(key, value) {
      if (!Buffer.isBuffer(value) || value.length === 0) {
        throw new TypeError("Nia secret ciphertext must be a non-empty buffer.");
      }
      await fs.mkdir(secretsDir, { recursive: true, mode: 0o700 });
      const target = resolvePath(key);
      const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(temporary, value, { mode: 0o600 });
      await fs.rename(temporary, target);
    },
    async delete(key) {
      try {
        await fs.unlink(resolvePath(key));
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    },
  });
}

function initializeNiaSubsystem() {
  if (niaIpc) return niaIpc;
  const baseDir = path.join(app.getPath("userData"), "nia");
  const secretStore = createKeychainSecretStore({
    persistence: createNiaSecretPersistence(baseDir),
    safeStorage,
  });
  const providerStore = createNiaProviderStore({ baseDir, secretStore });
  niaProviderRuntime = createNiaProviderRuntime({
    providerStore,
    browserDispatcher: () => {
      const active = syncBrowserMcpDispatcher();
      if (!active) return null;
      return {
        dispatch(input) {
          return active.dispatch(input);
        },
        releaseOwnership(connectionId) {
          return active.releaseOwnership?.(connectionId);
        },
      };
    },
    isBrowserAutomationAllowed: () => {
      try {
        return Boolean(syncBrowserMcpDispatcher());
      } catch {
        return false;
      }
    },
  });
  niaIpc = createNiaIpc({
    definitionStore: getNiaDefinitionStore(),
    ipcMain,
    providerStore,
    runtime: niaProviderRuntime,
    resolveCallerKind: resolveTrustedAssistantCaller,
  });
  niaIpc.register();
  return niaIpc;
}

function resolveTrustedAssistantCaller(event) {
  const sender = event?.sender;
  if (sender && sender === mainWindow?.webContents && isTrustedDesktopOrigin(
    event?.senderFrame?.url,
    getSenderUrl(event),
  )) return "notes";
  if (sender && browserWindowManager?.getControllerForWebContents(sender)) return "browser-chrome";
  if (sender && sender === niaStandaloneWindow?.webContents && isTrustedDesktopOrigin(
    event?.senderFrame?.url,
    getSenderUrl(event),
  )) return "nia-standalone";
  return null;
}

function normalizeNiaStandaloneLaunch(input) {
  const value = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const origin = ["browser", "command", "home", "note", "reading", "video", "voice"].includes(value.origin) ? value.origin : "home";
  const browserTarget = value.browserTarget && typeof value.browserTarget === "object"
    && typeof value.browserTarget.windowId === "string" && typeof value.browserTarget.tabId === "string"
    ? Object.freeze({ windowId: value.browserTarget.windowId, tabId: value.browserTarget.tabId }) : null;
  const context = value.context && typeof value.context === "object" && typeof value.context.kind === "string"
    ? value.context : null;
  return Object.freeze({ browserTarget, context, origin });
}
function isTrustedNiaStandaloneLauncher(event) {
  const sender = event?.sender;
  return Boolean(
    (sender === mainWindow?.webContents && isTrustedDesktopOrigin(event?.senderFrame?.url, getSenderUrl(event)))
    || (browserWindowManager?.getControllerForWebContents(sender)
      && isTrustedDesktopOrigin(event?.senderFrame?.url, getSenderUrl(event))),
  );
}
async function openNiaStandaloneWindow(event, launch) {
  if (!isTrustedNiaStandaloneLauncher(event)) throw new Error("Untrusted Nia launcher.");
  const payload = normalizeNiaStandaloneLaunch(launch);
  const targetUrl = await startNextServer();
  if (!niaStandaloneWindow || niaStandaloneWindow.isDestroyed()) {
    niaStandaloneWindow = new BrowserWindow({
      width: 520, height: 780, minWidth: 400, minHeight: 560, show: false, title: "Nia · Auris",
      ...(process.platform === "darwin" ? { titleBarStyle: "hiddenInset" } : {}),
      webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, "preload.cjs"), sandbox: false },
    });
    niaStandaloneWindow.once("ready-to-show", () => niaStandaloneWindow?.show());
    niaStandaloneWindow.on("closed", () => { niaStandaloneWindow = null; });
    const url = new URL("/nia", targetUrl + "/").toString();
    await niaStandaloneWindow.loadURL(url);
  }
  if (niaStandaloneWindow.isMinimized?.()) niaStandaloneWindow.restore();
  niaStandaloneWindow.show();
  niaStandaloneWindow.focus();
  niaStandaloneWindow.webContents.send("shadowing:nia-standalone:launch", payload);
  return true;
}
async function reviewImportedBrowserWorkflow(summary) {
  const reviewsPath = path.join(app.getPath("userData"), "nia", "browser-workflow-reviews.json");
  const digest = `sha256:${crypto.createHash("sha256").update(summary.normalizedSource).digest("hex")}`;
  let approved = [];
  try {
    const parsed = JSON.parse(await fs.readFile(reviewsPath, "utf8"));
    approved = Array.isArray(parsed?.approvedSourceHashes)
      ? parsed.approvedSourceHashes.filter((value) => typeof value === "string")
      : [];
  } catch { /* first run or corrupt review store */ }
  if (approved.includes(digest)) return true;
  const result = await dialog.showMessageBox(mainWindow ?? undefined, {
    buttons: ["取消", "审阅并允许"],
    cancelId: 0,
    defaultId: 0,
    detail: [
      `来源：${summary.requestedOrigins.join(", ") || "无"}`,
      `操作：${summary.requestedOperations.join(", ") || "无"}`,
      `Secrets：${summary.requestedSecrets.join(", ") || "无"}`,
      "",
      summary.normalizedSource.slice(0, 16_000),
    ].join("\n"),
    message: "首次运行导入的浏览器工作流",
    type: "warning",
  });
  if (result.response !== 1) return false;
  const next = [...new Set([digest, ...approved])].slice(0, 256);
  await fs.mkdir(path.dirname(reviewsPath), { recursive: true });
  await fs.writeFile(
    reviewsPath,
    JSON.stringify({ approvedSourceHashes: next }, null, 2),
    { mode: 0o600 },
  );
  return true;
}

function initializeWorkflowSubsystem() {
  if (workflowIpc) return workflowIpc;
  const niaDefinitionStore = getNiaDefinitionStore();
  // `prompt` 是合约层用 definition.body 合成好的最终提示词；`input` 只是用户原文。
  // 必须优先用前者——只发 input 等于把定义的指令整条丢掉（见
  // `electron/shared/nia-prompt-composition.cjs` 的模块注释）。
  const executePrompt = ({ input, prompt, model, ownerId, signal }) => new Promise((resolve, reject) => {
    const ownerWebContentsId = 0x80000000 + (crypto.createHash("sha256")
      .update(String(ownerId))
      .digest()
      .readUInt32BE(0) % 0x7fffffff);
    let providerRunId = null;
    const unsubscribe = niaProviderRuntime.subscribe(ownerWebContentsId, (event) => {
      if (event.type === "started" && !providerRunId) providerRunId = event.runId;
      if (!providerRunId || event.runId !== providerRunId) return;
      if (event.type === "completed") { unsubscribe(); resolve({ text: event.text || "" }); }
      if (event.type === "failed") { unsubscribe(); reject(Object.assign(new Error(event.message || "Nia provider failed."), { code: event.code })); }
      if (event.type === "cancelled") { unsubscribe(); reject(Object.assign(new Error("Nia provider cancelled."), { code: "CANCELLED" })); }
    });
    const onAbort = () => {
      if (providerRunId) {
        try { niaProviderRuntime.cancelRun({ runId: providerRunId, ownerWebContentsId }); } catch { /* settled */ }
      }
    };
    signal?.addEventListener?.("abort", onAbort, { once: true });
    void niaProviderRuntime.startRun({
      ownerWebContentsId,
      modelOverride: model || null,
      prompt: String(prompt || input || ""),
    }).then((started) => { providerRunId = started.runId; }).catch((error) => {
      unsubscribe(); reject(error);
    });
  });
  const niaWorkflowRuntime = createNiaWorkflowRuntime({
    definitionRepository: niaDefinitionStore,
    executePrompt,
  });
  const apiService = createBrowserWorkflowApiService({
    navigationPolicy: createBrowserNavigationPolicy({ allowLoopback: false }),
    async authorize(input) {
      const decision = await browserOperationGuard?.authorizeWorkflowApi(input, {
        connectionId: input.connectionId,
        signal: input.signal,
      });
      if (decision?.kind === "allowed") return { allowed: true };
      if (decision?.kind === "approval-required") {
        return {
          allowed: false,
          approvalId: decision.approval.approvalId,
          code: "APPROVAL_REQUIRED",
        };
      }
      return { allowed: false, code: decision?.error?.code || "CAPABILITY_NOT_VERIFIED" };
    },
  });
  browserWorkflowRunRegistry = createWorkflowRunRegistry();
  browserWorkflowRuntime = createBrowserWorkflowRuntime({
    apiService,
    dispatcher: {
      dispatch(input) {
        const active = syncBrowserMcpDispatcher();
        if (!active) {
          throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
            capability: "browser-workflow",
          });
        }
        return active.dispatch(input);
      },
    },
    registry: browserWorkflowRunRegistry,
    reviewDefinition: reviewImportedBrowserWorkflow,
    niaPropose: async ({ prompt, runId, signal }) => {
      const result = await executePrompt({
        input: [
          "You are reviewing a browser workflow goal step.",
          "Propose a short, bounded next action description for human review.",
          "Do not invent credentials, executable code, or unrestricted navigation.",
          "",
          String(prompt || ""),
        ].join("\n"),
        model: null,
        ownerId: `browser-workflow:goal:${runId || "unknown"}`,
        signal,
      });
      const text = typeof result?.text === "string" ? result.text.slice(0, 4_000) : "";
      return Object.freeze({
        kind: "nia_compile_proposal",
        text,
      });
    },
  });
  workflowCapabilities = createWorkflowCapabilities(MAIN_WORKFLOW_RUNTIME_CAPABILITIES);
  workflowFacade = createWorkflowFacade({
    browserRuntime: browserWorkflowRuntime,
    capabilities: workflowCapabilities,
    definitions: {
      async list() {
        return (await niaDefinitionStore.list()).map((definition) => ({
          definitionId: definition.canonicalId,
          family: "nia_yaml",
          label: definition.name,
          sourceCompatibility: definition.sourceCompatibility,
        }));
      },
      inspect(family, definitionId) {
        return family === "nia_yaml" ? niaDefinitionStore.get(definitionId) : null;
      },
    },
    niaRuntime: niaWorkflowRuntime,
  });
  workflowIpc = createWorkflowIpc({
    ipcMain,
    resolveCallerKind: resolveTrustedAssistantCaller,
    runtime: workflowFacade,
  });
  workflowIpc.register();
  return workflowIpc;
}

function requireTrustedMainEvent(event) {
  if (
    event?.sender !== mainWindow?.webContents
    || !isTrustedDesktopOrigin(event?.senderFrame?.url, getSenderUrl(event))
  ) {
    throw new Error("This request requires the trusted main Auris renderer.");
  }
}

function requireTrustedMainFrameEvent(event) {
  requireTrustedMainEvent(event);

  if (
    event?.senderFrame !== event?.sender?.mainFrame
    || !isTrustedDesktopOrigin(event?.senderFrame?.url)
  ) {
    throw new Error("This request requires the trusted top-level Auris renderer.");
  }
}

function initializeBrowserStatusSubsystem() {
  if (browserStatusIpc) return browserStatusIpc;
  browserStatusService = createBrowserStatusService({
    approvals: browserApprovalManager,
    getMainWindows: () => {
      if (!mainWindow || mainWindow.isDestroyed()) return [];
      return [{
        focused: mainWindow.isFocused?.() === true,
        lifecycle: "ready",
        title: mainWindow.getTitle?.() || "Auris",
        visible: mainWindow.isVisible?.() !== false,
        windowId: `auris-${mainWindow.id}`,
      }];
    },
    grants: browserGrantManager,
    leases: browserLeaseManager,
    registry: browserRegistry,
    workflows: browserWorkflowRunRegistry,
  });
  browserStatusIpc = createBrowserStatusIpc({
    focusBrowserTab: (windowId, tabId) => browserWindowManager?.focusTab?.(windowId, tabId) ?? false,
    focusBrowserWindow: (windowId) => browserWindowManager?.focusTarget?.(windowId) ?? false,
    ipcMain,
    requireTrustedMainEvent,
    statusService: browserStatusService,
  });
  browserStatusIpc.register();
  return browserStatusIpc;
}

function initializeBrowserSubsystem(targetUrl) {
  if (browserWindowManager) return browserWindowManager;
  browserRegistry = createBrowserRegistry();
  const registry = browserRegistry;
  browserLeaseManager = createBrowserLeaseManager();
  browserSecurityGates = createBrowserSecurityGates();
  browserSessionCapabilities = createBrowserSessionCapabilities();
  browserCapabilities = createBrowserCapabilities({
    getAutomationEnabled: isBrowserAutomationEnabled,
    securityGates: browserSecurityGates,
    sessionCapabilities: browserSessionCapabilities,
  });
  // Task 8 composes the Browser dispatcher with this same main-owned authority
  // only after compiled security gates verify and the user enables automation.
  browserGrantManager = createBrowserGrantManager();
  browserApprovalManager = createBrowserApprovalManager({ grants: browserGrantManager });
  const browserStatePath = path.join(app.getPath("userData"), BROWSER_STATE_DB_FILE);
  browserStateRepository = createBrowserStateRepository(browserStatePath);
  try {
    browserAuditLog = createBrowserAuditLog({
      database: browserStateRepository.getDatabase(),
    });
  } catch (error) {
    writeStartupLog(`browser-audit:init-failed ${error?.stack ?? error}`);
    browserAuditLog = null;
  }
  browserOperationGuard = createBrowserOperationGuard({
    approvals: browserApprovalManager,
    audit: browserAuditLog,
    grants: browserGrantManager,
    leases: browserLeaseManager,
    navigationPolicy: createBrowserNavigationPolicy({ allowLoopback: false }),
    registry: browserRegistry,
  });
  browserPartitionSelector = createBrowserPartitionSelector({
    createPagePolicy: createBrowserPagePolicy,
    getSession: (partitionName) => session.fromPartition(partitionName),
  });
  const partitionSelector = browserPartitionSelector;
  const humanReclaim = createBrowserHumanReclaim({
    reclaim: ({ reason, tabId, windowId }) => {
      if (browserMcpDispatcher && typeof browserMcpDispatcher.humanReclaim === "function") {
        return browserMcpDispatcher.humanReclaim(windowId, tabId, { reason });
      }
      const tab = registry.getTab(windowId, tabId);
      if (!tab) return { reclaimed: false };
      const controlEpoch = registry.rotateControlEpoch(windowId, tabId);
      browserLeaseManager?.controlChanged?.(windowId, tabId, controlEpoch);
      browserApprovalManager?.controlChanged?.(windowId, tabId);
      browserGrantManager?.controlChanged?.(windowId, tabId);
      return { reclaimed: true, controlEpoch, reason };
    },
  });
  const browserUxPolicy = createBrowserUxPolicy({
    isDevelopmentBuild: () => !app.isPackaged,
  });
  const browserDialogService = createBrowserDialogService({
    showNativeDialog: async ({ kind, message }) => {
      if (kind === "upload") {
        const result = await dialog.showOpenDialog({
          properties: ["openFile", "multiSelections"],
          title: "选择要上传的文件",
        });
        if (result.canceled || !result.filePaths?.length) {
          return { action: "cancel" };
        }
        return { action: "select", paths: result.filePaths };
      }
      if (kind === "prompt") {
        return { accept: false };
      }
      const result = await dialog.showMessageBox({
        buttons: kind === "confirm" ? ["取消", "确定"] : ["确定"],
        cancelId: 0,
        defaultId: kind === "confirm" ? 1 : 0,
        detail: typeof message === "string" ? message.slice(0, 2_000) : "",
        message: kind === "confirm" ? "页面请求确认" : "页面提示",
        type: "question",
      });
      if (kind === "confirm") {
        return { accept: result.response === 1 };
      }
      return { accept: true };
    },
    uxPolicy: browserUxPolicy,
  });
  const browserDownloadService = createBrowserDownloadService({
    showSaveDialog: async ({ defaultPath }) => {
      const result = await dialog.showSaveDialog({
        defaultPath: typeof defaultPath === "string" ? defaultPath : "download",
        title: "保存下载文件",
      });
      if (result.canceled || !result.filePath) return null;
      return { filePath: result.filePath };
    },
    uxPolicy: browserUxPolicy,
  });
  const browserRecovery = createBrowserRecovery();
  const browserHibernation = createBrowserHibernation();
  const surfaceManager = createBrowserSurfaceManager({
    WebContentsView,
    attachDialogService: browserDialogService.attach,
    attachDownloadService: browserDownloadService.attach,
    attachHumanReclaim: humanReclaim.attach,
    createPagePolicy: () => createBrowserPagePolicy({
      isDevelopmentBuild: () => !app.isPackaged,
      showHttpAuthPrompt: async ({ host, realm }) => {
        await dialog.showMessageBox({
          buttons: ["取消"],
          detail: [
            host ? `主机：${String(host).slice(0, 256)}` : "",
            realm ? `Realm：${String(realm).slice(0, 256)}` : "",
            "当前不会把 HTTP 认证凭据交给页面、MCP 或日志。请取消后在站点内自行登录。",
          ].filter(Boolean).join("\n"),
          message: "页面请求 HTTP 认证",
          type: "warning",
        });
        return null;
      },
      uxPolicy: browserUxPolicy,
    }),
    onEvent(event) {
      if (browserWindowManager?.handleSurfaceEvent) {
        browserWindowManager.handleSurfaceEvent(event);
      } else if (event.type === "navigated") {
        registry.commitNavigation(event.windowId, event.tabId, {
          expectedGeneration: event.expectedGeneration,
          url: event.url,
        });
      } else if (event.type === "loading-started") {
        registry.updateTab(event.windowId, event.tabId, { loading: true });
      } else if (event.type === "loading-stopped") {
        registry.updateTab(event.windowId, event.tabId, { loading: false });
        registry.setTabLifecycle(event.windowId, event.tabId, "ready");
      } else if (event.type === "crashed") {
        registry.setTabLifecycle(event.windowId, event.tabId, "crashed");
      }
      browserIpc?.publish(browserWindowManager?.snapshot() ?? registry.snapshot());
    },
  });
  browserWindowManager = createBrowserWindowManager({
    BrowserWindow,
    capabilities: browserCapabilities,
    hibernation: browserHibernation,
    logger: writeStartupLog,
    onAuthorityPurge: (windowId, tabId, meta) => {
      browserApprovalManager?.controlChanged?.(windowId, tabId);
      browserGrantManager?.controlChanged?.(windowId, tabId);
      if (browserMcpDispatcher && typeof browserMcpDispatcher.humanReclaim === "function") {
        browserMcpDispatcher.humanReclaim(windowId, tabId, {
          reason: meta?.kind || "close",
        });
      } else {
        browserLeaseManager?.controlChanged?.(windowId, tabId);
      }
    },
    partitionSelector,
    preloadPath: path.join(__dirname, "browser", "browser-preload.cjs"),
    recovery: browserRecovery,
    registry,
    screen,
    stateRepository: browserStateRepository,
    surfaceManager,
    targetUrl,
  });
  browserIpc = createBrowserIpc({
    approvalAuthority: browserApprovalManager,
    getControllerForWebContents: (sender) =>
      browserWindowManager?.getControllerForWebContents(sender) ?? null,
    ipcMain,
    windowAuthority: {
      closeWindow: ({ windowId }) => browserWindowManager?.closeWindow?.(windowId) ?? false,
      createTabInWindow: ({ windowId, ...input }) => browserWindowManager?.createTabInWindow?.(windowId, input),
      createWindow: (input) => browserWindowManager?.openBrowser?.({ ...input, newWindow: true }),
      focusWindow: ({ windowId }) => browserWindowManager?.focusTarget?.(windowId) ?? false,
    },
  });
  browserIpc.register();
  browserGrantsIpc = createBrowserGrantsIpc({
    grantAuthority: browserGrantManager,
    ipcMain,
    requireTrustedDesktopEvent,
    webContentsFromEvent: (event) => event?.sender ?? null,
  });
  browserGrantsIpc.register();
  browserSecurityIpc = createBrowserSecurityIpc({
    getCapabilitiesSnapshot: () => browserCapabilities.snapshot(),
    ipcMain,
    requireTrustedDesktopEvent,
    setAutomationEnabled: (enabled) => setBrowserAutomationEnabled(enabled),
    webContentsFromEvent: (event) => event?.sender ?? null,
  });
  browserSecurityIpc.register();
  syncBrowserMcpDispatcher();
  return browserWindowManager;
}

protocol.registerSchemesAsPrivileged([
  {
    privileges: {
      corsEnabled: true,
      secure: true,
      standard: true,
      supportFetchAPI: true,
    },
    scheme: MEDIA_PROTOCOL_SCHEME,
  },
]);

function focusExistingWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return false;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.focus();
  return true;
}

function createAppIcon() {
  const icon = nativeImage.createFromPath(APP_ICON_PATH);
  return icon.isEmpty() ? undefined : icon;
}

function writeStartupLog(message) {
  try {
    fsSync.appendFileSync(
      STARTUP_LOG_PATH,
      `[${new Date().toISOString()}] ${message}\n`,
      "utf8",
    );
  } catch {
    // Ignore logging failures during startup diagnostics.
  }
}

function writeNextProcessLog(message) {
  try {
    fsSync.appendFileSync(
      NEXT_PROCESS_LOG_PATH,
      `[${new Date().toISOString()}] ${message}\n`,
      "utf8",
    );
  } catch {
    // Ignore child-process logging failures during startup diagnostics.
  }
}

process.on("uncaughtException", (error) => {
  writeStartupLog(`uncaughtException: ${error?.stack ?? error}`);
});

process.on("unhandledRejection", (error) => {
  writeStartupLog(`unhandledRejection: ${error?.stack ?? error}`);
});

function createDefaultDesktopConfig() {
  return {
    browserAutomationEnabled: false,
    // 用户历史上通过目录选择器授权过的 vault 根，供 Workspace Rail 免对话框切换。
    // 它同时是 `vault:set-root` 的白名单——见 setVaultRoot() 的安全说明。
    knownVaultRoots: [],
    mcp: createDefaultMcpPolicy(),
    pluginsEnabled: {},
    videoLibraryPath: null,
    vaultPath: null,
  };
}

function isBrowserAutomationEnabled() {
  return desktopConfig?.browserAutomationEnabled === true;
}

function syncBrowserMcpDispatcher() {
  if (!browserWindowManager || !browserCapabilities || !browserRegistry) {
    browserMcpDispatcher = null;
    return null;
  }
  try {
    browserCapabilities.assertAutomationAllowed();
  } catch {
    browserMcpDispatcher = null;
    return null;
  }
  if (browserMcpDispatcher) return browserMcpDispatcher;

  if (!browserPageExecutor) {
    const evidenceDirectory = path.join(app.getPath("userData"), "browser-evidence");
    fsSync.mkdirSync(evidenceDirectory, { recursive: true });
    browserPageExecutor = createBrowserPageExecutor({
      closeTarget: async ({ windowId, tabId }) => {
        await browserWindowManager.destroyTarget({ windowId, tabId });
        return true;
      },
      evidenceDirectory,
      focusTarget: async ({ windowId, tabId }) => {
        browserWindowManager.focusTarget(windowId);
        browserRegistry?.activateTab?.(windowId, tabId);
        return true;
      },
      getWebContents: ({ windowId, tabId }) =>
        browserWindowManager.getPageWebContents(windowId, tabId),
    });
  }

  browserMcpDispatcher = createBrowserCommandDispatcher({
    approvals: browserApprovalManager,
    audit: browserAuditLog,
    capabilities: browserCapabilities,
    createAiSandboxTarget: (input) => browserWindowManager.createAiSandboxTarget(input),
    destroyTarget: (input) => browserWindowManager.destroyTarget(input),
    executor: browserPageExecutor,
    grants: browserGrantManager,
    leases: browserLeaseManager,
    navigationPolicy: createBrowserNavigationPolicy({
      allowLoopback: false,
    }),
    operationGuard: browserOperationGuard,
    partitionSelector: browserPartitionSelector,
    registry: browserRegistry,
    sessionCapabilities: browserSessionCapabilities,
  });
  return browserMcpDispatcher;
}

async function setBrowserAutomationEnabled(enabled) {
  if (!browserCapabilities?.snapshot()?.securityVerified) {
    throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
      capability: "browser-automation",
      reason: browserCapabilities?.snapshot()?.securityReason || "phase4-security-incomplete",
    });
  }
  await writeDesktopConfig({
    ...desktopConfig,
    browserAutomationEnabled: enabled === true,
  });
  syncBrowserMcpDispatcher();
  browserSecurityIpc?.publish?.();
  installApplicationMenu();
  return browserCapabilities.snapshot();
}

function normalizeRoutePath(value) {
  return typeof value === "string" && value.startsWith("/") ? value : "/";
}

function normalizeWindowBounds(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value;

  if (typeof candidate.width !== "number" || typeof candidate.height !== "number") {
    return null;
  }

  return {
    height: candidate.height,
    width: candidate.width,
    x: typeof candidate.x === "number" ? candidate.x : undefined,
    y: typeof candidate.y === "number" ? candidate.y : undefined,
  };
}

function normalizeAiDockProviderId(value) {
  return AI_PROVIDER_IDS.includes(value) ? value : "chatgpt";
}

function normalizeAiDockView(value) {
  return value === "provider" || value === "prompts" || value === "history"
    ? value
    : "provider";
}

function normalizeAiDockPanelWidth(value, fallback = 560) {
  return typeof value === "number" && value > 0 ? Math.round(value) : fallback;
}

function normalizeAiDockBounds(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value;

  if (
    typeof candidate.x !== "number" ||
    typeof candidate.y !== "number" ||
    typeof candidate.width !== "number" ||
    typeof candidate.height !== "number"
  ) {
    return null;
  }

  return {
    height: Math.round(candidate.height),
    width: Math.round(candidate.width),
    x: Math.round(candidate.x),
    y: Math.round(candidate.y),
  };
}

function createAiDockLayoutFromRuntimeState(runtimeState, bounds) {
  const aiDock = runtimeState?.aiDock ?? null;
  const normalizedBounds =
    arguments.length > 1 ? normalizeAiDockBounds(bounds) : undefined;

  return {
    activeProvider: normalizeAiDockProviderId(aiDock?.activeProvider),
    activeView: normalizeAiDockView(aiDock?.activeView),
    isOpen: Boolean(aiDock?.isOpen),
    panelWidth: normalizeAiDockPanelWidth(aiDock?.panelWidth),
    ...(normalizedBounds !== undefined ? { bounds: normalizedBounds } : {}),
  };
}

function extractRoutePath(targetUrl) {
  if (typeof targetUrl !== "string" || !targetUrl.trim()) {
    return "/";
  }

  try {
    const parsed = new URL(targetUrl);
    return normalizeRoutePath(`${parsed.pathname}${parsed.search}${parsed.hash}`);
  } catch {
    return normalizeRoutePath(targetUrl);
  }
}

function createEmptyPluginRuntime() {
  return {
    commands: new Map(),
    plugins: [],
    unloaders: new Map(),
  };
}

function getNodeCommand() {
  return process.platform === "win32" ? "node.exe" : "node";
}

function getDesktopConfigPath() {
  return path.join(app.getPath("userData"), DESKTOP_CONFIG_FILE);
}

function getNotesRecoveryStore() {
  if (!notesRecoveryStore) {
    notesRecoveryStore = createNotesRecoveryStore({
      baseDirectory: path.join(app.getPath("userData"), "notes-recovery"),
    });
  }
  return notesRecoveryStore;
}

function getMcpClientCredentialStore() {
  if (!mcpClientCredentialStore) {
    mcpClientCredentialStore = createMcpClientCredentialStore({
      registryPath: getMcpClientCredentialsPath(),
    });
  }
  return mcpClientCredentialStore;
}

function getNotesMcpDiscoveryPath() {
  // Pinned to the app-name-independent location shared with the stdio MCP
  // server, so discovery works in dev (app name "Electron") and packaged
  // builds alike. See auris-mcp-config.cjs.
  return resolveNotesMcpDiscoveryPath();
}

function writeNotesMcpDiscovery(content) {
  const targetPath = getNotesMcpDiscoveryPath();
  const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;

  fsSync.mkdirSync(path.dirname(targetPath), { recursive: true });
  fsSync.writeFileSync(temporaryPath, content, { encoding: "utf8", mode: 0o600 });
  fsSync.renameSync(temporaryPath, targetPath);
  fsSync.chmodSync(targetPath, 0o600);
}

function removeNotesMcpDiscovery(instanceId) {
  try {
    const discoveryPath = getNotesMcpDiscoveryPath();
    const discovery = parseMcpDiscovery(fsSync.readFileSync(discoveryPath, "utf8"));

    if (discovery.instanceId !== instanceId) {
      return;
    }

    fsSync.rmSync(discoveryPath, { force: true });
  } catch (error) {
    if (error?.code !== "ENOENT") {
      writeStartupLog(`notes-mcp:discovery-remove-error ${error?.stack ?? error}`);
    }
  }
}

function getAiLibraryDbPath() {
  return path.join(app.getPath("userData"), AI_LIBRARY_DB_FILE);
}

function getRuntimeStateDbPath() {
  return path.join(app.getPath("userData"), RUNTIME_STATE_DB_FILE);
}

function getLocalHistoryDbPath() {
  return path.join(app.getPath("userData"), LOCAL_HISTORY_DB_FILE);
}

function getTrainingAudioDirectory() {
  return path.join(app.getPath("userData"), TRAINING_AUDIO_DIR);
}

function getRuntimeStateRepository() {
  if (runtimeStateRepository) {
    return runtimeStateRepository;
  }

  try {
    runtimeStateRepository = createRuntimeStateRepository(getRuntimeStateDbPath());
    runtimeStateFallback = runtimeStateRepository.getRuntimeState();
  } catch (error) {
    writeStartupLog(`runtimeStateRepository:error ${error?.stack ?? error}`);
    runtimeStateRepository = null;
  }

  return runtimeStateRepository;
}

function getAiLibraryRepository() {
  if (aiLibraryRepository) {
    return aiLibraryRepository;
  }

  try {
    aiLibraryRepository = createAiLibraryRepository(getAiLibraryDbPath());
  } catch (error) {
    writeStartupLog(`aiLibraryRepository:error ${error?.stack ?? error}`);
    aiLibraryRepository = null;
  }

  return aiLibraryRepository;
}

function getLocalHistoryRepository() {
  if (localHistoryRepository) {
    return localHistoryRepository;
  }

  try {
    localHistoryRepository = createLocalHistoryRepository({
      databasePath: getLocalHistoryDbPath(),
      trainingAudioDirectory: getTrainingAudioDirectory(),
    });
  } catch (error) {
    writeStartupLog(`localHistoryRepository:error ${error?.stack ?? error}`);
    localHistoryRepository = null;
  }

  return localHistoryRepository;
}

function getAiViewManager() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return null;
  }

  if (!aiViewManager) {
    aiViewManager = createAiViewManager({
      window: mainWindow,
    });
  }

  return aiViewManager;
}

function closeAiLibraryRepository() {
  aiLibraryRepository?.close?.();
  aiLibraryRepository = null;
}

async function captureCurrentAiConversation(providerId) {
  const normalizedProviderId = normalizeAiDockProviderId(providerId);
  const manager = getAiViewManager();
  const repository = getAiLibraryRepository();
  const webContents = manager?.getWebContents?.(normalizedProviderId) ?? null;

  if (!repository || !webContents || typeof webContents.executeJavaScript !== "function") {
    return null;
  }

  try {
    const extractedConversation = await webContents.executeJavaScript(
      getExtractorScriptForProvider(normalizedProviderId),
      true,
    );

    return extractedConversation ? repository.saveHistory(extractedConversation) : null;
  } catch (error) {
    writeStartupLog(
      `ai-history:capture-error provider=${normalizedProviderId} ${error?.stack ?? error}`,
    );
    return null;
  }
}

function readRuntimeState() {
  const repository = getRuntimeStateRepository();

  if (!repository) {
    return runtimeStateFallback;
  }

  try {
    runtimeStateFallback = repository.getRuntimeState();
    return runtimeStateFallback;
  } catch (error) {
    writeStartupLog(`runtimeStateRepository:read-error ${error?.stack ?? error}`);
    return runtimeStateFallback;
  }
}

function updateRuntimeState(patch) {
  const repository = getRuntimeStateRepository();

  if (!repository) {
    runtimeStateFallback = {
      ...runtimeStateFallback,
      ...patch,
      lastRoute:
        Object.prototype.hasOwnProperty.call(patch, "lastRoute")
          ? normalizeRoutePath(patch.lastRoute)
          : runtimeStateFallback.lastRoute,
      lastWorkspace:
        patch.lastWorkspace === "workspace" ||
        patch.lastWorkspace === "notes" ||
        patch.lastWorkspace === "assessment" ||
        patch.lastWorkspace === "home"
          ? patch.lastWorkspace
          : runtimeStateFallback.lastWorkspace,
      updatedAt: new Date().toISOString(),
      windowBounds:
        Object.prototype.hasOwnProperty.call(patch, "windowBounds")
          ? normalizeWindowBounds(patch.windowBounds)
          : runtimeStateFallback.windowBounds,
    };
    return runtimeStateFallback;
  }

  try {
    runtimeStateFallback = repository.updateRuntimeState(patch);
    return runtimeStateFallback;
  } catch (error) {
    writeStartupLog(`runtimeStateRepository:update-error ${error?.stack ?? error}`);
    return runtimeStateFallback;
  }
}

function importLegacyRuntimeState(legacyState) {
  const repository = getRuntimeStateRepository();

  if (!repository) {
    runtimeStateFallback = {
      ...runtimeStateFallback,
      lastVisitedAt:
        typeof legacyState?.lastVisitedAt === "string" && legacyState.lastVisitedAt.trim()
          ? legacyState.lastVisitedAt
          : runtimeStateFallback.lastVisitedAt,
      lastWorkspace:
        legacyState?.lastWorkspace === "workspace" ||
        legacyState?.lastWorkspace === "notes" ||
        legacyState?.lastWorkspace === "assessment" ||
        legacyState?.lastWorkspace === "home"
          ? legacyState.lastWorkspace
          : runtimeStateFallback.lastWorkspace,
      legacyRuntimeMigratedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return runtimeStateFallback;
  }

  try {
    runtimeStateFallback = repository.importLegacyRuntimeState(legacyState);
    return runtimeStateFallback;
  } catch (error) {
    writeStartupLog(`runtimeStateRepository:legacy-import-error ${error?.stack ?? error}`);
    return runtimeStateFallback;
  }
}

function listRecentTrainingSessions() {
  const repository = getLocalHistoryRepository();

  if (!repository) {
    return [];
  }

  try {
    return repository.listRecentTrainingSessions();
  } catch (error) {
    writeStartupLog(`localHistoryRepository:list-training-error ${error?.stack ?? error}`);
    return [];
  }
}

function getTrainingPlayback(sessionId) {
  const repository = getLocalHistoryRepository();

  if (!repository) {
    return null;
  }

  try {
    return repository.getTrainingPlayback(sessionId);
  } catch (error) {
    writeStartupLog(`localHistoryRepository:get-playback-error ${error?.stack ?? error}`);
    return null;
  }
}

function savePreparedTrainingSession(input) {
  const repository = getLocalHistoryRepository();

  if (!repository) {
    return;
  }

  try {
    repository.savePreparedTrainingSession(input);
  } catch (error) {
    writeStartupLog(`localHistoryRepository:save-training-error ${error?.stack ?? error}`);
  }
}

function deleteTrainingSession(sessionId) {
  const repository = getLocalHistoryRepository();

  if (!repository) {
    return;
  }

  try {
    repository.deleteTrainingSession(sessionId);
  } catch (error) {
    writeStartupLog(`localHistoryRepository:delete-training-error ${error?.stack ?? error}`);
  }
}

function listAssessmentHistory() {
  const repository = getLocalHistoryRepository();

  if (!repository) {
    return [];
  }

  try {
    return repository.listAssessments();
  } catch (error) {
    writeStartupLog(`localHistoryRepository:list-assessment-error ${error?.stack ?? error}`);
    return [];
  }
}

function deleteAssessmentHistory(assessmentId) {
  const repository = getLocalHistoryRepository();

  if (!repository) {
    return [];
  }

  try {
    return repository.deleteAssessment(assessmentId);
  } catch (error) {
    writeStartupLog(`localHistoryRepository:delete-assessment-error ${error?.stack ?? error}`);
    return [];
  }
}

function saveAssessmentHistory(record) {
  const repository = getLocalHistoryRepository();

  if (!repository) {
    return [];
  }

  try {
    return repository.saveAssessment(record);
  } catch (error) {
    writeStartupLog(`localHistoryRepository:save-assessment-error ${error?.stack ?? error}`);
    return [];
  }
}

function importLegacyAssessmentHistory(records) {
  const repository = getLocalHistoryRepository();

  if (!repository) {
    return [];
  }

  try {
    return repository.importLegacyAssessments(records);
  } catch (error) {
    writeStartupLog(`localHistoryRepository:import-assessment-error ${error?.stack ?? error}`);
    return [];
  }
}

function closeVaultWatcher() {
  if (!vaultWatcher) {
    return;
  }

  try {
    vaultWatcher.close();
  } catch {
    // Ignore watcher disposal failures during shutdown/reconfiguration.
  }

  vaultWatcher = null;
}

function emitVaultChanged() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send("shadowing:vault:changed");
}

function scheduleVaultChanged() {
  if (pendingVaultChangeSignal) {
    clearTimeout(pendingVaultChangeSignal);
  }

  pendingVaultChangeSignal = setTimeout(() => {
    pendingVaultChangeSignal = null;
    emitVaultChanged();
  }, 120);
}

function getTerminalRecoveryStore() {
  return createTerminalSessionRecoveryStore(
    path.join(app.getPath("userData"), TERMINAL_RECOVERY_FILE),
  );
}
function persistTerminalRecovery() {
  if (!terminalSessionManager) return [];
  return getTerminalRecoveryStore().save(terminalSessionManager.listSessions());
}
function sendTerminalEvent(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(channel, payload);
}

function getTerminalSessionManager() {
  if (terminalSessionManager) {
    return terminalSessionManager;
  }

  terminalSessionManager = createTerminalSessionManager({
    cwdExistsSync: (candidate) => {
      // Defensive existence check: if the cwd (typically a configured vault
      // path that may have moved between machines) is gone, the manager will
      // fall back to the user's home directory instead of letting
      // posix_spawnp throw at the renderer.
      if (typeof candidate !== "string" || !candidate.trim()) {
        return false;
      }
      try {
        return fsSync.statSync(candidate).isDirectory();
      } catch {
        return false;
      }
    },
    logger: writeStartupLog,
  });
  terminalSessionUnsubscribers = [
    terminalSessionManager.onData((payload) =>
      sendTerminalEvent(TERMINAL_DATA_CHANNEL, payload),
    ),
    terminalSessionManager.onExit((payload) => {
      persistTerminalRecovery();
      sendTerminalEvent(TERMINAL_EXIT_CHANNEL, payload);
    }),
  ];
  for (const descriptor of getTerminalRecoveryStore().load()) {
    try {
      terminalSessionManager.createSession(descriptor);
    } catch (error) {
      writeStartupLog(`terminal:${descriptor.id}:restore-failed ${error?.message ?? error}`);
    }
  }
  persistTerminalRecovery();
  return terminalSessionManager;
}
function getNotesMcpBridge() {
  if (notesMcpBridge) {
    return notesMcpBridge;
  }

  notesMcpBridge = createNotesMcpBridge({
    cancelBrowserApprovals: (connectionId) =>
      browserMcpDispatcher?.cancelPendingApprovals?.(connectionId),
    dispatchBrowserRequest: (request) => {
      if (!browserMcpDispatcher || typeof browserMcpDispatcher.dispatch !== "function") {
        throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
          capability: "browser-automation-disabled",
        });
      }
      return browserMcpDispatcher.dispatch(request);
    },
    dispatchWorkflowRequest: ({ connectionId, params, principal }) => {
      if (!workflowFacade) {
        throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
          capability: "workflow-facade",
        });
      }
      return workflowFacade.request({
        ownerId: connectionId,
        principal,
        ...params,
      });
    },
    getWindow: () => mainWindow,
    logger: writeStartupLog,
    removeDiscovery: removeNotesMcpDiscovery,
    releaseBrowserOwnership: (connectionId) =>
      browserMcpDispatcher?.releaseOwnership?.(connectionId),
    releaseWorkflowOwnership: (connectionId) =>
      workflowFacade?.disconnect?.(connectionId),
    verifyClientCredential: ({ clientId, clientToken }) =>
      getMcpClientCredentialStore().verify(clientId, clientToken),
    writeDiscovery: writeNotesMcpDiscovery,
  });

  return notesMcpBridge;
}

function closeTerminalSessionManager() {
  terminalSessionUnsubscribers.forEach((unsubscribe) => {
    try {
      unsubscribe();
    } catch {
      // Ignore listener cleanup failures during shutdown.
    }
  });
  terminalSessionUnsubscribers = [];
  persistTerminalRecovery();
  terminalSessionManager?.killAll();
  terminalSessionManager = null;
}

async function createTerminalSession(input) {
  const vaultPath = await getVaultPath();

  const record = getTerminalSessionManager().createSession(
    createTerminalSessionInput(input, {
      homePath: app.getPath("home"),
      vaultPath,
    }),
  );
  persistTerminalRecovery();
  return record;
}

function requireTerminalSessionId(value) {
  const sessionId = normalizeTerminalString(value);

  if (!sessionId) {
    throw new Error("Terminal session id is required.");
  }

  return sessionId;
}

async function refreshVaultWatcher() {
  closeVaultWatcher();

  const vaultPath = await getVaultPath();

  if (!vaultPath) {
    return;
  }

  try {
    vaultWatcher = fsSync.watch(
      vaultPath,
      { recursive: process.platform !== "linux" },
      () => {
        scheduleVaultChanged();
      },
    );
  } catch (error) {
    writeStartupLog(`vaultWatcher:error ${error?.stack ?? error}`);
  }
}

function getDownloadsDirectoryInfo() {
  return {
    directoryPath: app.getPath("downloads"),
  };
}

function sanitizeDownloadFileName(filename) {
  const trimmed = typeof filename === "string" ? filename.trim() : "";
  const baseName = trimmed || "shadowing-export.json";
  return baseName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-");
}

async function exportJsonToDownloads(filename, payload) {
  const downloadsDirectory = app.getPath("downloads");
  const safeFileName = sanitizeDownloadFileName(filename);
  const targetPath = path.join(downloadsDirectory, safeFileName);
  const content = JSON.stringify(payload, null, 2);

  await fs.mkdir(downloadsDirectory, { recursive: true });
  await fs.writeFile(targetPath, content, "utf8");
  shell.showItemInFolder(targetPath);

  return {
    path: targetPath,
  };
}

async function exportTextToDownloads(filename, content) {
  const downloadsDirectory = app.getPath("downloads");
  const safeFileName = sanitizeDownloadFileName(filename || "shadowing-export.txt");
  const targetPath = path.join(downloadsDirectory, safeFileName);

  await fs.mkdir(downloadsDirectory, { recursive: true });
  await fs.writeFile(targetPath, String(content), "utf8");
  shell.showItemInFolder(targetPath);

  return {
    path: targetPath,
  };
}

async function exportPdfToDownloads(filename, html, options) {
  const downloadsDirectory = app.getPath("downloads");
  const safeFileName = sanitizeDownloadFileName(filename || "shadowing-export.pdf")
    .replace(/\.(?!.*\.)[^.]*$/, ".pdf");
  const targetPath = path.join(downloadsDirectory, safeFileName);
  const pdfWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });

  try {
    await fs.mkdir(downloadsDirectory, { recursive: true });
    await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(String(html))}`);
    const pdfBuffer = await pdfWindow.webContents.printToPDF(
      normalizePdfExportOptions(options),
    );
    await fs.writeFile(targetPath, pdfBuffer);
    shell.showItemInFolder(targetPath);

    return {
      path: targetPath,
    };
  } finally {
    pdfWindow.destroy();
  }
}

function createExportTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function getUniqueDirectoryPath(baseDirectory) {
  if (!(await pathExists(baseDirectory))) {
    return baseDirectory;
  }

  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${baseDirectory}-${index}`;

    if (!(await pathExists(candidate))) {
      return candidate;
    }
  }

  throw new Error("Unable to create a unique export folder.");
}

function resolveExportTargetPath(exportDirectory, relativePath) {
  const safeRelativePath = assertRelativePath(relativePath);
  const targetPath = path.resolve(exportDirectory, safeRelativePath);
  const normalizedExportDirectory = path.resolve(exportDirectory);
  const insideExportDirectory =
    targetPath === normalizedExportDirectory ||
    targetPath.startsWith(`${normalizedExportDirectory}${path.sep}`);

  if (!insideExportDirectory) {
    throw new Error("The requested export file path escapes the export folder.");
  }

  return targetPath;
}

async function writeFileAtomically(targetPath, content, options) {
  const temporaryPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`,
  );

  try {
    await fs.writeFile(temporaryPath, content, options);
    await fs.rename(temporaryPath, targetPath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function exportVaultFolderToDownloads(folderName, manifest) {
  const vaultPath = await getVaultPath();

  if (!vaultPath) {
    throw new Error("Please choose a local vault folder first.");
  }

  const downloadsDirectory = app.getPath("downloads");
  const safeFolderName = sanitizeDownloadFileName(folderName || "shadowing-vault-export");
  const exportDirectory = await getUniqueDirectoryPath(
    path.join(downloadsDirectory, `${safeFolderName}-${createExportTimestamp()}`),
  );
  const files = await walkVaultFiles(vaultPath);

  await fs.mkdir(exportDirectory, { recursive: true });

  for (const file of files) {
    const targetPath = resolveExportTargetPath(exportDirectory, file.relativePath);

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.copyFile(file.absolutePath, targetPath);
  }

  const manifestPath = path.join(exportDirectory, "manifest.json");

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  shell.showItemInFolder(exportDirectory);

  return {
    filesCopied: files.length,
    manifestPath,
    path: exportDirectory,
  };
}

function getUpgradeUrl() {
  const targetUrl = process.env.SHADOWING_DESKTOP_UPGRADE_URL;
  return typeof targetUrl === "string" && targetUrl.trim() ? targetUrl.trim() : null;
}

/* ------------------------------------------------------------------ */
/* 自动更新（对齐 vmark updater；底座换成 electron-updater）            */
/* ------------------------------------------------------------------ */

let appUpdater = null;
let appUpdaterStallWatchdog = null;
let closeAttemptTracker = null;
let cachedInstallCapability = null;

/**
 * macOS 上 `electron-updater` 就地安装要求 app 带有效代码签名。Auris 当前
 * `electron-builder.yml` 用 ad-hoc identity("-")，就地安装必然在 apply 阶段
 * 失败。这里用 `codesign` 真实探测一次（结果缓存），而不是假设成功——否则 UI
 * 会给出一个永远失败的"重启安装"按钮，正是上一轮审计要求删掉的那类假控件。
 */
function detectMacInstallCapability() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    let child;
    try {
      child = spawn("/usr/bin/codesign", ["-dv", "--verbose=2", app.getAppPath().replace(/\/Contents\/Resources\/app(\.asar)?$/, "")], {
        stdio: ["ignore", "ignore", "pipe"],
      });
    } catch {
      finish(false);
      return;
    }

    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", () => finish(false));
    child.on("close", () => {
      // ad-hoc 签名的 Authority 行是 "Signature=adhoc"；真实证书会出现
      // "Authority=Developer ID Application: ..."。
      const adhoc = /Signature\s*=\s*adhoc/i.test(stderr);
      const developerId = /Authority=Developer ID Application/i.test(stderr);
      finish(developerId && !adhoc);
    });

    setTimeout(() => finish(false), 4000);
  });
}

async function canInstallUpdateInPlace() {
  if (cachedInstallCapability !== null) {
    return cachedInstallCapability;
  }

  if (!app.isPackaged) {
    cachedInstallCapability = false;
    return cachedInstallCapability;
  }

  if (process.platform !== "darwin") {
    cachedInstallCapability = true;
    return cachedInstallCapability;
  }

  cachedInstallCapability = await detectMacInstallCapability();
  writeStartupLog(`updater:can-install-in-place=${cachedInstallCapability}`);
  return cachedInstallCapability;
}

function getCloseAttemptTracker() {
  if (!closeAttemptTracker) {
    closeAttemptTracker = createCloseAttemptTracker({
      log: (event, detail) => writeStartupLog(`${event}${detail ? ` ${detail}` : ""}`),
    });
  }
  return closeAttemptTracker;
}
function pushUpdateState(snapshot) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send("shadowing:updates:state", snapshot);
}

async function getAppUpdater() {
  if (appUpdater) {
    return appUpdater;
  }

  // electron-updater 只在需要时加载：开发环境下它会立刻抱怨没有 app-update.yml，
  // 没必要在冷启动路径上付这个代价。
  const { autoUpdater } = require("electron-updater");

  autoUpdater.logger = {
    debug: () => {},
    error: (message) => writeStartupLog(`updater:error ${message}`),
    info: (message) => writeStartupLog(`updater:info ${message}`),
    warn: (message) => writeStartupLog(`updater:warn ${message}`),
  };

  appUpdater = createAppUpdater({
    autoUpdater,
    canInstallInPlace: await canInstallUpdateInPlace(),
    getCurrentVersion: () => AURIS_APP_VERSION,
    log: (message, detail) =>
      writeStartupLog(`${message}${detail === undefined ? "" : ` ${String(detail)}`}`),
    openExternal: (targetUrl) => shell.openExternal(targetUrl),
    releasesUrl: getUpgradeUrl() ?? "https://github.com/xhslam/auris/releases",
    // electron-updater 在 dev 中会 skip 检查却不一定 settle promise。将能力
    // 显式交给状态机，让 renderer 展示“开发模式”而不是假的红色错误。
    supported: app.isPackaged,
  });

  appUpdater.onStateChange(pushUpdateState);
  // electron-updater 的网络 promise 可能永久悬挂；不能只依赖 finally 清理 single-flight。
  if (!appUpdaterStallWatchdog) {
    appUpdaterStallWatchdog = setInterval(() => {
      appUpdater?.checkForStall();
    }, 15_000);
    appUpdaterStallWatchdog.unref?.();
  }
  return appUpdater;
}

async function openUpgradeEntry() {
  const targetUrl = getUpgradeUrl();

  if (targetUrl) {
    await shell.openExternal(targetUrl);
    return {
      didOpen: true,
      targetUrl,
    };
  }

  await dialog.showMessageBox(mainWindow ?? undefined, {
    detail: "Set SHADOWING_DESKTOP_UPGRADE_URL to connect this menu entry to your release page.",
    message: "Update channel is not configured yet.",
    title: "Check for Updates",
    type: "info",
  });

  return {
    didOpen: false,
    targetUrl: null,
  };
}

function createPluginManifest(manifest, directoryPath) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("Plugin manifest must be a JSON object.");
  }

  const normalized = manifest;

  if (typeof normalized.id !== "string" || !normalized.id.trim()) {
    throw new Error("Plugin manifest must declare a non-empty id.");
  }

  if (typeof normalized.name !== "string" || !normalized.name.trim()) {
    throw new Error("Plugin manifest must declare a non-empty name.");
  }

  if (typeof normalized.version !== "string" || !normalized.version.trim()) {
    throw new Error("Plugin manifest must declare a non-empty version.");
  }

  const entryFile =
    typeof normalized.main === "string" && normalized.main.trim()
      ? normalized.main.trim()
      : "main.js";

  return {
    description:
      typeof normalized.description === "string" && normalized.description.trim()
        ? normalized.description.trim()
        : undefined,
    directoryPath,
    entryFile,
    entryPath: path.join(directoryPath, entryFile),
    id: normalized.id.trim(),
    name: normalized.name.trim(),
    version: normalized.version.trim(),
  };
}

function resolvePluginActivator(moduleExports) {
  if (typeof moduleExports === "function") {
    return moduleExports;
  }

  if (moduleExports && typeof moduleExports.activate === "function") {
    return moduleExports.activate;
  }

  if (moduleExports && typeof moduleExports.default === "function") {
    return moduleExports.default;
  }

  throw new Error("Plugin entry must export an activate(api) function.");
}

function normalizePluginError(error) {
  return error instanceof Error ? error.message : "Unknown plugin error.";
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readDesktopConfig() {
  writeStartupLog("readDesktopConfig:start");
  const configPath = getDesktopConfigPath();

  if (!(await pathExists(configPath))) {
    desktopConfig = createDefaultDesktopConfig();
    writeStartupLog("readDesktopConfig:missing-config");
    return desktopConfig;
  }

  try {
    const fileContent = await fs.readFile(configPath, "utf8");
    const parsed = JSON.parse(fileContent);

    desktopConfig = {
      browserAutomationEnabled: parsed?.browserAutomationEnabled === true,
      knownVaultRoots: normalizeKnownVaultRoots(parsed?.knownVaultRoots),
      mcp: normalizeMcpPolicy(parsed?.mcp),
      pluginsEnabled:
        parsed && typeof parsed.pluginsEnabled === "object" && parsed.pluginsEnabled
          ? parsed.pluginsEnabled
          : {},
      videoLibraryPath:
        parsed && typeof parsed.videoLibraryPath === "string" && parsed.videoLibraryPath.trim()
          ? parsed.videoLibraryPath
          : null,
      vaultPath:
        parsed && typeof parsed.vaultPath === "string" && parsed.vaultPath.trim()
          ? parsed.vaultPath
          : null,
    };
  } catch {
    desktopConfig = createDefaultDesktopConfig();
  }

  return desktopConfig;
}

async function writeDesktopConfig(nextConfig) {
  desktopConfig = {
    browserAutomationEnabled: nextConfig.browserAutomationEnabled === true,
    knownVaultRoots: normalizeKnownVaultRoots(nextConfig.knownVaultRoots),
    mcp: normalizeMcpPolicy(nextConfig.mcp),
    pluginsEnabled: nextConfig.pluginsEnabled ?? {},
    videoLibraryPath: nextConfig.videoLibraryPath ?? null,
    vaultPath: nextConfig.vaultPath ?? null,
  };

  await fs.mkdir(path.dirname(getDesktopConfigPath()), { recursive: true });
  await fs.writeFile(getDesktopConfigPath(), JSON.stringify(desktopConfig, null, 2), "utf8");
}

async function getNotesMcpServerInfo() {
  if (desktopConfig.mcp.enabled) {
    await getNotesMcpBridge().start();
  }

  return {
    ...getNotesMcpBridge().getServerInfo(),
    policy: desktopConfig.mcp,
  };
}

async function updateNotesMcpPolicy(policyPatch) {
  const nextPolicy = normalizeMcpPolicy({
    ...desktopConfig.mcp,
    ...(policyPatch && typeof policyPatch === "object" ? policyPatch : {}),
  });

  await writeDesktopConfig({
    ...desktopConfig,
    mcp: nextPolicy,
  });

  if (nextPolicy.enabled) {
    await getNotesMcpBridge().start();
  } else {
    notesMcpBridge?.close();
  }

  return getNotesMcpServerInfo();
}

// 把 Auris 的 stdio MCP server 注入外部客户端配置时要用到的两条信息：
// 用哪个可执行文件当 node（Electron 自身），以及 server 脚本的绝对路径。
function getMcpInstallerOptions() {
  return {
    credentialStore: getMcpClientCredentialStore(),
    execPath: process.execPath,
    serverScriptPath: path.join(__dirname, "auris-notes-mcp-server.mjs"),
  };
}

async function getVaultPath() {
  if (!desktopConfig.vaultPath) {
    return null;
  }

  return (await pathExists(desktopConfig.vaultPath)) ? desktopConfig.vaultPath : null;
}

async function getVideoLibraryPath() {
  if (!desktopConfig.videoLibraryPath) {
    return null;
  }

  return (await pathExists(desktopConfig.videoLibraryPath))
    ? desktopConfig.videoLibraryPath
    : null;
}

function getVideoLibraryDataPath(videoLibraryPath) {
  const resolvedPath = path.resolve(videoLibraryPath);
  const normalizedPath = process.platform === "win32" ? resolvedPath.toLowerCase() : resolvedPath;
  const directoryKey = crypto.createHash("sha256").update(normalizedPath).digest("hex");

  return path.join(app.getPath("userData"), VIDEO_LIBRARY_DATA_DIR, directoryKey);
}

function getVideoLibraryDbPath(libraryDataPath) {
  return path.join(libraryDataPath, VIDEO_LIBRARY_DB_FILE);
}

function closeVideoLibraryRepository() {
  videoLibraryRepository?.close();
  videoLibraryRepository = null;
  videoLibraryRepositoryPath = null;
}

function getVideoLibraryRepository() {
  const configuredPath = desktopConfig.videoLibraryPath;

  if (!configuredPath) {
    closeVideoLibraryRepository();
    return null;
  }

  if (videoLibraryRepository && videoLibraryRepositoryPath === configuredPath) {
    return videoLibraryRepository;
  }

  closeVideoLibraryRepository();

  try {
    const libraryDataPath = getVideoLibraryDataPath(configuredPath);

    videoLibraryRepository = createVideoLibraryRepository({
      databasePath: getVideoLibraryDbPath(libraryDataPath),
      libraryDataPath,
      libraryPath: configuredPath,
    });
    videoLibraryRepositoryPath = configuredPath;
  } catch (error) {
    writeStartupLog(`videoLibraryRepository:error ${error?.stack ?? error}`);
    videoLibraryRepository = null;
    videoLibraryRepositoryPath = null;
  }

  return videoLibraryRepository;
}

function getVoiceEngineRuntime() {
  if (voiceEngineRuntime) {
    return voiceEngineRuntime;
  }

  voiceEngineRuntime = createVoiceEngineRuntime();
  return voiceEngineRuntime;
}

function mapVideoDetailsToPlayable(detail) {
  if (!detail) {
    return null;
  }

  return {
    ...detail,
    variants: detail.variants.map((variant) => ({
      ...variant,
      playbackUrl:
        variant.storagePath && variant.status === "ready"
          ? createVideoVariantPlaybackUrl(detail.video.id, variant.id)
          : null,
    })),
  };
}

async function handleVideoMediaProtocolRequest(request) {
  const parsedRequest = parseVideoVariantPlaybackUrl(request.url);

  if (!parsedRequest) {
    return new Response("Unsupported media request.", { status: 400 });
  }

  const detail = await getVideoLibraryDetails(parsedRequest.videoId, { mapPlayableUrls: false });
  const variant = detail?.variants.find((item) => item.id === parsedRequest.variantId);

  if (!variant?.storagePath || !fsSync.existsSync(variant.storagePath)) {
    return new Response("Media not found.", { status: 404 });
  }

  try {
    return createVideoStreamResponse({
      filePath: variant.storagePath,
      mimeType: variant.mimeType,
      rangeHeader: request.headers.get("range"),
    });
  } catch (error) {
    writeStartupLog(`videoMediaProtocol:error ${error?.stack ?? error}`);
    return new Response("Media stream failed.", { status: 500 });
  }
}

async function handleVaultMediaProtocolRequest(request) {
  const parsedRequest = parseVaultMediaUrl(request.url);

  if (!parsedRequest) {
    return new Response("Unsupported media request.", { status: 400 });
  }

  try {
    const target = await resolveVaultTarget(parsedRequest.relativePath);

    if (!(await pathExists(target.absoluteTarget))) {
      return new Response("Media not found.", { status: 404 });
    }

    return createVideoStreamResponse({
      filePath: target.absoluteTarget,
      mimeType: getMediaMimeType(target.absoluteTarget),
      rangeHeader: request.headers.get("range"),
    });
  } catch (error) {
    writeStartupLog(`vaultMediaProtocol:error ${error?.stack ?? error}`);
    return new Response("Media stream failed.", { status: 500 });
  }
}

function registerVideoMediaProtocol() {
  protocol.handle(MEDIA_PROTOCOL_SCHEME, async (request) => {
    const parsed = new URL(request.url);

    if (parsed.host === "video") {
      return handleVideoMediaProtocolRequest(request);
    }

    if (parsed.host === "vault") {
      return handleVaultMediaProtocolRequest(request);
    }

    return new Response("Unsupported media request.", { status: 400 });
  });
}

async function getVideoLibrarySnapshot() {
  const videoLibraryPath = await getVideoLibraryPath();
  const repository = getVideoLibraryRepository();

  if (!videoLibraryPath || !repository) {
    return {
      directory: {
        analysisDirectory: null,
        directoryName: null,
        hasLibrary: false,
        libraryPath: null,
        storageMode: "reference",
        thumbnailsDirectory: null,
        transcodesDirectory: null,
      },
      items: [],
    };
  }

  try {
    return repository.getSnapshot();
  } catch (error) {
    writeStartupLog(`videoLibraryRepository:get-snapshot-error ${error?.stack ?? error}`);
    const libraryDataPath = getVideoLibraryDataPath(videoLibraryPath);

    return {
      directory: {
        analysisDirectory: null,
        directoryName: path.basename(videoLibraryPath),
        hasLibrary: true,
        libraryPath: videoLibraryPath,
        storageMode: "reference",
        thumbnailsDirectory: path.join(libraryDataPath, "thumbnails"),
        transcodesDirectory: null,
      },
      items: [],
    };
  }
}

function getPluginsDirectory(vaultPath) {
  return path.join(vaultPath, DESKTOP_PLUGIN_DIR);
}

async function ensurePluginsDirectory(vaultPath) {
  const pluginsDirectory = getPluginsDirectory(vaultPath);
  await fs.mkdir(pluginsDirectory, { recursive: true });
  return pluginsDirectory;
}

function assertRelativePath(relativePath) {
  if (typeof relativePath !== "string" || !relativePath.trim()) {
    throw new Error("A valid relative vault path is required.");
  }

  const normalized = relativePath.replace(/\\/g, "/");
  if (normalized.startsWith("/")) {
    throw new Error("The requested file path escapes the current vault.");
  }
  return normalized;
}

function getNotesTrashDirectory() {
  return path.join(app.getPath("userData"), "notes-trash");
}

function serializeVaultMutation(operation) {
  const next = vaultMutationChain.then(operation, operation);
  vaultMutationChain = next.catch(() => undefined);
  return next;
}

async function getVaultFileOperations() {
  const vaultPath = await getVaultPath();
  if (!vaultPath) {
    throw new Error("Please choose a local vault folder first.");
  }
  return {
    operations: createVaultFileOperations({
      trashRoot: getNotesTrashDirectory(),
      vaultRoot: vaultPath,
    }),
    vaultPath,
  };
}

async function resolveVaultTarget(relativePath) {
  const safeRelativePath = assertRelativePath(relativePath);
  const { operations, vaultPath } = await getVaultFileOperations();
  return {
    absoluteTarget: await operations.resolve(safeRelativePath),
    safeRelativePath,
    vaultPath,
  };
}

async function clearPluginRuntime() {
  const unloaders = [...pluginRuntime.unloaders.values()].filter(Boolean);

  pluginRuntime = createEmptyPluginRuntime();

  for (const unload of unloaders) {
    await unload();
  }
}

async function loadPluginRuntime() {
  writeStartupLog("loadPluginRuntime:start");
  const vaultPath = await getVaultPath();
  await clearPluginRuntime();

  if (!vaultPath) {
    writeStartupLog("loadPluginRuntime:no-vault");
    return pluginRuntime;
  }

  const pluginsDirectory = await ensurePluginsDirectory(vaultPath);
  const entries = await fs.readdir(pluginsDirectory, { withFileTypes: true });
  const pluginRecords = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory()) {
      continue;
    }

    const directoryPath = path.join(pluginsDirectory, entry.name);
    const manifestPath = path.join(directoryPath, "manifest.json");

    try {
      const manifestSource = await fs.readFile(manifestPath, "utf8");
      const manifest = createPluginManifest(JSON.parse(manifestSource), directoryPath);
      const isEnabled = desktopConfig.pluginsEnabled[manifest.id] ?? true;

      if (!isEnabled) {
        pluginRecords.push({
          enabled: false,
          entryPath: manifest.entryPath,
          errorMessage: null,
          manifest,
        });
        continue;
      }

      try {
        const pendingCommands = new Map();
        const pluginApi = {
          registerCommand(command) {
            if (!command || typeof command !== "object") {
              throw new Error("Plugin command definition must be an object.");
            }

            if (typeof command.id !== "string" || !command.id.trim()) {
              throw new Error("Plugin commands must declare a non-empty id.");
            }

            if (typeof command.title !== "string" || !command.title.trim()) {
              throw new Error("Plugin commands must declare a non-empty title.");
            }

            if (typeof command.run !== "function") {
              throw new Error("Plugin commands must provide a run function.");
            }

            if (pluginRuntime.commands.has(command.id) || pendingCommands.has(command.id)) {
              throw new Error(`Duplicate plugin command id: ${command.id}`);
            }

            pendingCommands.set(command.id, {
              id: command.id.trim(),
              pluginId: manifest.id,
              run: command.run,
              title: command.title.trim(),
            });
          },
        };

        const resolvedEntryPath = require.resolve(manifest.entryPath);
        delete require.cache[resolvedEntryPath];
        const moduleExports = require(resolvedEntryPath);
        const activate = resolvePluginActivator(moduleExports);
        const activationResult = await activate(pluginApi);

        for (const [commandId, command] of pendingCommands.entries()) {
          pluginRuntime.commands.set(commandId, command);
        }

        if (typeof activationResult === "function") {
          pluginRuntime.unloaders.set(manifest.id, activationResult);
        } else if (
          activationResult &&
          typeof activationResult === "object" &&
          typeof activationResult.dispose === "function"
        ) {
          pluginRuntime.unloaders.set(manifest.id, () => activationResult.dispose());
        }

        pluginRecords.push({
          enabled: true,
          entryPath: manifest.entryPath,
          errorMessage: null,
          manifest,
        });
      } catch (error) {
        pluginRecords.push({
          enabled: true,
          entryPath: manifest.entryPath,
          errorMessage: normalizePluginError(error),
          manifest,
        });
      }
    } catch (error) {
      pluginRecords.push({
        enabled: true,
        entryPath: manifestPath,
        errorMessage: normalizePluginError(error),
        manifest: {
          id: entry.name,
          name: entry.name,
          version: "0.0.0",
        },
      });
    }
  }

  pluginRuntime.plugins = pluginRecords.sort((left, right) =>
    left.manifest.name.localeCompare(right.manifest.name),
  );

  return pluginRuntime;
}

function getDesktopCommands() {
  const builtInCommands = desktopConfig.vaultPath
    ? [
        {
          id: "desktop.plugins.open-directory",
          run: () => revealPluginsDirectory(),
          title: "打开插件目录",
        },
      ]
    : [];
  const pluginCommands = [...pluginRuntime.commands.values()].map((command) => ({
    id: command.id,
    run: command.run,
    title: command.title,
  }));

  return [...builtInCommands, ...pluginCommands].sort((left, right) =>
    left.title.localeCompare(right.title),
  );
}

async function revealPluginsDirectory() {
  const vaultPath = await getVaultPath();

  if (!vaultPath) {
    throw new Error("Please choose a local vault folder first.");
  }

  const pluginsDirectory = await ensurePluginsDirectory(vaultPath);
  await shell.openPath(pluginsDirectory);
}

/**
 * 把一个用户已经通过原生选择器授权过的根记进「已知根」列表（最近使用优先）。
 *
 * 这个列表既是 Workspace Rail 的数据源，也是 `vault:set-root` 的白名单。
 * 判定逻辑在 `electron/vault/vault-roots.cjs`，那里可以直接单测。
 */
function rememberVaultRoot(rootPath) {
  return rememberKnownVaultRoot(desktopConfig.knownVaultRoots ?? [], rootPath);
}

async function pickVaultDirectory() {
  const result = await dialog.showOpenDialog({
    defaultPath: desktopConfig.vaultPath ?? undefined,
    properties: ["createDirectory", "openDirectory"],
    title: "选择笔记 Vault 文件夹",
  });

  if (result.canceled || result.filePaths.length === 0) {
    return getVaultDirectoryInfo();
  }

  const vaultPath = result.filePaths[0];
  await ensurePluginsDirectory(vaultPath);
  await writeDesktopConfig({
    ...desktopConfig,
    knownVaultRoots: rememberVaultRoot(vaultPath),
    vaultPath,
  });
  await refreshVaultWatcher();
  await loadPluginRuntime();
  scheduleVaultChanged();

  return getVaultDirectoryInfo();
}

async function pickVaultFile() {
  const result = await dialog.showOpenDialog({
    defaultPath: desktopConfig.vaultPath ?? undefined,
    filters: [{ extensions: ["md", "markdown"], name: "Markdown" }],
    properties: ["openFile"],
    title: "打开笔记文件",
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { ...(await getVaultDirectoryInfo()), selectedFilePath: null };
  }

  const selectedFilePath = result.filePaths[0];
  const vaultPath = path.dirname(selectedFilePath);
  await ensurePluginsDirectory(vaultPath);
  await writeDesktopConfig({
    ...desktopConfig,
    vaultPath,
  });
  await refreshVaultWatcher();
  await loadPluginRuntime();
  scheduleVaultChanged();

  return {
    ...(await getVaultDirectoryInfo()),
    selectedFilePath: path.relative(vaultPath, selectedFilePath).split(path.sep).join("/"),
  };
}

/**
 * 列出已知 vault 根，供 Workspace Rail 渲染。
 *
 * 同时报告每个根当前是否可达：外置盘拔了、目录被删、或者仓库被移动过，rail
 * 需要把它显示成「不可用」而不是假装能切过去。
 */
async function listVaultRoots() {
  const roots = desktopConfig.knownVaultRoots ?? [];
  const activePath = desktopConfig.vaultPath
    ? path.resolve(desktopConfig.vaultPath)
    : null;

  return Promise.all(
    roots.map(async (rootPath) => ({
      available: await pathExists(rootPath),
      isActive: activePath === rootPath,
      name: path.basename(rootPath),
      path: rootPath,
    })),
  );
}

/**
 * 切换当前 vault 根，不弹对话框。
 *
 * **安全边界（这是这个 handler 存在的全部难点）**：只接受已经在
 * `knownVaultRoots` 里的路径，也就是用户此前通过原生目录选择器亲自授权过的
 * 目录。绝不接受 renderer 传来的任意绝对路径。
 *
 * 原因不是洁癖：vault 根一旦可以被 renderer 任意指定，`vault:read-file` /
 * `list-files` 就成了「读任意目录」的通道——把根指到 `~/.ssh` 或
 * `~/Library/Application Support`，然后逐个文件读出来。那等于把一个受限的
 * 笔记读写接口升级成任意文件读取。所以新根必须走 `pick-directory`（用户在
 * 系统对话框里做出选择），rail 只负责在已授权的根之间切换。
 */
async function setVaultRoot(requestedPath) {
  const decision = authorizeVaultRoot(
    desktopConfig.knownVaultRoots ?? [],
    requestedPath,
  );

  if (!decision.ok) {
    if (decision.code === VAULT_ROOT_ERRORS.EMPTY) {
      throw new Error("A vault root path is required.");
    }
    // 未授权与「传了个相对路径」都归到同一条用户可行动的提示：调用方（rail）
    // 据此引导用户走选择器，而不是显示一个会让人以为目录丢了的错误。
    throw new Error(
      "This vault root has not been authorized. Choose it with the folder picker first.",
    );
  }

  const normalized = decision.rootPath;

  if (!(await pathExists(normalized))) {
    // 授权过但当前不可达（盘拔了 / 目录被删）。不改当前根，让 rail 把这一项
    // 标成不可用——静默切到一个空 vault 会看起来像笔记全丢了。
    throw new Error("This vault root is currently unavailable.");
  }

  await ensurePluginsDirectory(normalized);
  await writeDesktopConfig({
    ...desktopConfig,
    knownVaultRoots: rememberVaultRoot(normalized),
    vaultPath: normalized,
  });
  await refreshVaultWatcher();
  await loadPluginRuntime();
  scheduleVaultChanged();

  return getVaultDirectoryInfo();
}

async function getVaultDirectoryInfo() {
  const vaultPath = await getVaultPath();

  if (!vaultPath) {
    return {
      directoryName: null,
      hasVault: false,
      pluginDirectory: null,
      vaultPath: null,
    };
  }

  const pluginDirectory = await ensurePluginsDirectory(vaultPath);

  return {
    directoryName: path.basename(vaultPath),
    hasVault: true,
    pluginDirectory,
    vaultPath,
  };
}

// 递归遍历库目录，收集所有受支持的视频文件路径；跳过隐藏目录和库自管子目录
async function collectVideoFilesInDirectory(rootDirectory) {
  const found = [];

  async function walk(currentDirectory, depth) {
    let entries;

    try {
      entries = await fs.readdir(currentDirectory, { withFileTypes: true });
    } catch (error) {
      writeStartupLog(`videoLibraryRepository:scan-readdir-error ${error?.stack ?? error}`);
      return;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentDirectory, entry.name);

      if (entry.isDirectory()) {
        if (entry.name.startsWith(".")) {
          continue;
        }

        if (depth === 0 && VIDEO_LIBRARY_MANAGED_DIRS.has(entry.name)) {
          continue;
        }

        await walk(entryPath, depth + 1);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();

      if (VIDEO_LIBRARY_EXTENSIONS.has(extension)) {
        found.push(entryPath);
      }
    }
  }

  await walk(rootDirectory, 0);

  return found;
}

async function pickVideoLibraryDirectory() {
  const result = await dialog.showOpenDialog({
    defaultPath: desktopConfig.videoLibraryPath ?? undefined,
    properties: ["openDirectory"],
    title: "选择视频文件夹",
  });

  if (result.canceled || result.filePaths.length === 0) {
    return getVideoLibrarySnapshot();
  }

  const videoLibraryPath = result.filePaths[0];

  await writeDesktopConfig({
    ...desktopConfig,
    videoLibraryPath,
  });
  closeVideoLibraryRepository();
  getVideoLibraryRepository();

  // 选完目录立刻扫描一遍，自动把目录里已有的视频登记进库
  return refreshVideoLibrary();
}

async function revealVideoLibraryDirectory() {
  const videoLibraryPath = await getVideoLibraryPath();

  if (!videoLibraryPath) {
    throw new Error("Please choose a local video library first.");
  }

  await shell.openPath(videoLibraryPath);
}

async function generateVideoThumbnail(videoId, sourcePath) {
  const repository = getVideoLibraryRepository();

  if (!repository || !sourcePath || !fsSync.existsSync(sourcePath)) {
    return null;
  }

  try {
    const thumbnailImage = await nativeImage.createThumbnailFromPath(sourcePath, {
      height: 720,
      width: 1280,
    });

    if (thumbnailImage.isEmpty()) {
      return null;
    }

    return repository.saveThumbnail(videoId, {
      bytes: thumbnailImage.toPNG(),
      contentType: "image/png",
    });
  } catch (error) {
    writeStartupLog(`videoLibraryRepository:thumbnail-error ${error?.stack ?? error}`);
    return null;
  }
}

async function importVideoFilesIntoLibrary() {
  const repository = getVideoLibraryRepository();

  if (!repository) {
    throw new Error("Please choose a local video library first.");
  }

  const result = await dialog.showOpenDialog({
    filters: [
      {
        extensions: [
          "avi",
          "flv",
          "m2ts",
          "m4v",
          "mkv",
          "mov",
          "mp4",
          "ogv",
          "ts",
          "webm",
          "wmv",
        ],
        name: "Videos",
      },
    ],
    properties: ["multiSelections", "openFile"],
    title: "导入本地视频",
  });

  if (result.canceled || result.filePaths.length === 0) {
    return getVideoLibrarySnapshot();
  }

  const snapshot = repository.importVideoFiles(result.filePaths);

  for (const item of snapshot.items) {
    if (!item.posterUrl && result.filePaths.includes(item.sourcePath)) {
      await generateVideoThumbnail(item.id, item.sourcePath);
    }
  }

  return getVideoLibrarySnapshot();
}

async function refreshVideoLibrary() {
  const repository = getVideoLibraryRepository();

  if (!repository) {
    return getVideoLibrarySnapshot();
  }

  // 先遍历库目录发现新增视频（importVideoFiles 走 source_path 唯一约束，已登记的会被幂等跳过）
  const libraryPath = await getVideoLibraryPath();

  if (libraryPath) {
    const videoFiles = await collectVideoFilesInDirectory(libraryPath);

    if (videoFiles.length > 0) {
      repository.importVideoFiles(videoFiles);
    }
  }

  const snapshot = repository.refreshLibrary();

  for (const item of snapshot.items) {
    if (item.importState === "ready" && !item.posterUrl) {
      await generateVideoThumbnail(item.id, item.sourcePath);
    }
  }

  return getVideoLibrarySnapshot();
}

async function getVideoLibraryDetails(videoId, options = {}) {
  const repository = getVideoLibraryRepository();

  if (!repository) {
    return null;
  }

  try {
    const detail = repository.getVideoDetails(videoId);

    return options.mapPlayableUrls === false ? detail : mapVideoDetailsToPlayable(detail);
  } catch (error) {
    writeStartupLog(`videoLibraryRepository:get-detail-error ${error?.stack ?? error}`);
    return null;
  }
}

async function updateVideoLibraryMetadata(videoId, metadata) {
  const repository = getVideoLibraryRepository();

  if (!repository) {
    return null;
  }

  try {
    return mapVideoDetailsToPlayable(repository.updateSourceMetadata(videoId, metadata));
  } catch (error) {
    writeStartupLog(`videoLibraryRepository:update-metadata-error ${error?.stack ?? error}`);
    return null;
  }
}

async function saveVideoLibraryThumbnail(videoId, thumbnail) {
  const repository = getVideoLibraryRepository();

  if (!repository) {
    return null;
  }

  try {
    return mapVideoDetailsToPlayable(repository.saveThumbnail(videoId, thumbnail));
  } catch (error) {
    writeStartupLog(`videoLibraryRepository:save-thumbnail-error ${error?.stack ?? error}`);
    return null;
  }
}

async function startNextServerInternal() {
  writeStartupLog(`startNextServer:start mode=${isDevMode ? "dev" : "start"}`);
  if (process.env.SHADOWING_DESKTOP_URL) {
    nextServerUrl = process.env.SHADOWING_DESKTOP_URL;
    nextProcessReady = true;
    writeStartupLog(`startNextServer:using-env-url ${nextServerUrl}`);
    return nextServerUrl;
  }

  if (nextServerUrl && nextProcessReady) {
    writeStartupLog(`startNextServer:already-ready ${nextServerUrl}`);
    return nextServerUrl;
  }

  if (isDevMode) {
    const reusableServerUrl = await findResponsiveServerUrl(
      Array.from({ length: 20 }, (_, index) => 3000 + index),
      {
        path: "/api/templates",
        validateResponse: (response) => {
          const contentType = String(response.headers["content-type"] ?? "");

          if (response.statusCode !== 200 || !contentType.includes("application/json")) {
            return false;
          }

          try {
            const payload = JSON.parse(response.body);
            return Array.isArray(payload?.templates);
          } catch {
            return false;
          }
        },
      },
    );

    if (reusableServerUrl) {
      nextServerUrl = reusableServerUrl;
      nextProcessReady = true;
      writeStartupLog(`startNextServer:reusing ${nextServerUrl}`);
      return nextServerUrl;
    }
  }

  const port = await findOpenPort(3000);
  const launch = createNextServerLaunchPlan({
    isDevelopment: isDevMode,
    isPackaged: app.isPackaged,
    nextCliPath: app.isPackaged ? null : require.resolve("next/dist/bin/next"),
    nodeCommand: getNodeCommand(),
    port,
    projectRoot: PROJECT_ROOT,
    resourcesPath: process.resourcesPath,
  });

  const childEnvironment = {
    ...process.env,
    ...launch.env,
  };
  const startedProcess = launch.type === "utility"
    ? utilityProcess.fork(launch.modulePath, launch.args, {
      cwd: launch.cwd,
      env: childEnvironment,
      serviceName: launch.serviceName,
      stdio: "pipe",
    })
    : spawn(launch.command, launch.args, {
      cwd: launch.cwd,
      env: childEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  nextProcess = startedProcess;
  writeStartupLog(
    `startNextServer:spawned type=${launch.type} pid=${startedProcess.pid} port=${port}`,
  );

  startedProcess.stdout?.on("data", (chunk) => {
    writeNextProcessLog(`stdout: ${String(chunk).trimEnd()}`);
  });

  startedProcess.stderr?.on("data", (chunk) => {
    writeNextProcessLog(`stderr: ${String(chunk).trimEnd()}`);
  });

  startedProcess.once("exit", (code) => {
    writeStartupLog(`startNextServer:renderer-exit code=${code ?? "null"}`);
    if (nextProcess === startedProcess) {
      nextProcess = null;
      nextProcessReady = false;
      nextServerUrl = null;
    }
    if (code && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox(
        "桌面应用启动失败",
        `Next.js renderer exited early with code ${code}.`,
      );
    }
  });

  await waitForPort(port, DEV_SERVER_TIMEOUT_MS);
  if (nextProcess !== startedProcess) {
    throw new Error("Next.js renderer stopped before it became ready.");
  }
  nextServerUrl = `http://127.0.0.1:${port}`;
  nextProcessReady = true;
  writeStartupLog(`startNextServer:ready ${nextServerUrl}`);
  return nextServerUrl;
}

async function startNextServer() {
  if (nextServerUrl && nextProcessReady) {
    return nextServerUrl;
  }

  if (!nextServerStartPromise) {
    nextServerStartPromise = startNextServerInternal().finally(() => {
      nextServerStartPromise = null;
    });
  }

  return nextServerStartPromise;
}

async function stopNextServer() {
  if (nextServerStartPromise) {
    try {
      await nextServerStartPromise;
    } catch {
      // Startup failure already has its own diagnostics; continue cleanup.
    }
  }

  nextProcessReady = false;
  nextServerUrl = null;

  if (!nextProcess) {
    return;
  }

  const processToStop = nextProcess;
  nextProcess = null;

  if (process.platform === "win32" && typeof processToStop.pid === "number") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(processToStop.pid), "/T", "/F"], {
        stdio: "ignore",
      });

      killer.once("exit", () => resolve());
      killer.once("error", () => resolve());
    });

    return;
  }

  processToStop.kill();
}

function collectTrustedDesktopOrigins() {
  const origins = new Set(["http://127.0.0.1:3000", "http://localhost:3000"]);

  if (typeof nextServerUrl === "string" && nextServerUrl.trim()) {
    try {
      origins.add(new URL(nextServerUrl).origin);
    } catch {
      // Ignore malformed renderer URLs during startup races.
    }
  }

  return origins;
}

function normalizeOrigin(candidate) {
  if (typeof candidate !== "string" || !candidate.trim()) {
    return null;
  }

  try {
    return new URL(candidate).origin;
  } catch {
    return null;
  }
}

function isTrustedDesktopOrigin(...candidates) {
  const trustedOrigins = collectTrustedDesktopOrigins();

  return candidates.some((candidate) => {
    const origin = normalizeOrigin(candidate);
    return Boolean(origin && trustedOrigins.has(origin));
  });
}

function getSenderUrl(event) {
  try {
    return event?.sender?.getURL?.() ?? null;
  } catch {
    return null;
  }
}

function requireTrustedDesktopEvent(event) {
  if (isTrustedDesktopOrigin(event?.senderFrame?.url, getSenderUrl(event))) {
    return;
  }

  throw new Error("Terminal requests require a trusted desktop renderer origin.");
}

function installMediaPermissionHandlers(window) {
  const browserSession = window.webContents.session;

  browserSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    if (permission === "media" || permission === "microphone") {
      return isTrustedDesktopOrigin(requestingOrigin, webContents?.getURL?.());
    }

    return false;
  });

  browserSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      if (permission === "media" || permission === "microphone") {
        const isAllowed = isTrustedDesktopOrigin(
          details?.requestingOrigin,
          details?.requestingUrl,
          details?.securityOrigin,
          webContents?.getURL?.(),
        );
        writeStartupLog(
          `media-permission:${permission} allowed=${isAllowed} origin=${details?.requestingOrigin ?? "null"} url=${details?.requestingUrl ?? "null"} securityOrigin=${details?.securityOrigin ?? "null"} currentUrl=${webContents?.getURL?.() ?? "null"}`,
        );
        callback(isAllowed);
        return;
      }

      callback(false);
    },
  );
}

async function createMainWindow() {
  writeStartupLog("createMainWindow:start");
  if (focusExistingWindow()) {
    writeStartupLog("createMainWindow:focused-existing-window");
    return;
  }

  const targetUrl = await startNextServer();
  const runtimeState = readRuntimeState();
  const windowBounds = runtimeState.windowBounds;
  const appIcon = createAppIcon();

  if (process.platform === "darwin" && appIcon) {
    app.dock?.setIcon(appIcon);
  }

  mainWindow = new BrowserWindow({
    height: windowBounds?.height ?? DEFAULT_WINDOW_HEIGHT,
    ...(appIcon ? { icon: appIcon } : {}),
    minHeight: 700,
    minWidth: 1160,
    show: false,
    title: "Auris",
    // 自定义标题栏：隐藏原生标题栏背景，让 macOS 红黄绿圆点浮在自绘的 46px AURIS 栏内。
    ...(process.platform === "darwin"
      ? { titleBarStyle: "hidden", trafficLightPosition: { x: 18, y: 17 } }
      : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: false,
    },
    width: windowBounds?.width ?? DEFAULT_WINDOW_WIDTH,
    x: windowBounds?.x,
    y: windowBounds?.y,
  });
  aiViewManager = createAiViewManager({
    logger: writeStartupLog,
    window: mainWindow,
  });
  installMediaPermissionHandlers(mainWindow);

  mainWindow.once("ready-to-show", () => {
    writeStartupLog("createMainWindow:ready-to-show");
    mainWindow?.show();
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    writeStartupLog(`createMainWindow:did-fail-load code=${errorCode} message=${errorDescription}`);
  });

    mainWindow.webContents.on("did-navigate", (_event, navigationUrl) => {
      updateRuntimeState({
        lastRoute: extractRoutePath(navigationUrl),
    });
  });

    mainWindow.on("close", () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        return;
      }
      writeStartupLog("main-window:close:start");
      try {
        aiDockStateBuffer.flush();
        updateRuntimeState({
          lastRoute: extractRoutePath(mainWindow.webContents.getURL()),
          windowBounds: mainWindow.getBounds(),
        });
        writeStartupLog("main-window:close:state-persisted");
      } catch (error) {
        writeStartupLog(`main-window:close:error ${error?.stack ?? error}`);
        throw error;
      }
    });

  mainWindow.on("closed", () => {
    writeStartupLog("createMainWindow:closed");
    aiViewManager?.dispose?.();
    aiViewManager = null;
    mainWindow = null;
  });

  const initialRoutePath = "/";
  const initialUrl = new URL(initialRoutePath, `${targetUrl}/`).toString();
  await mainWindow.loadURL(initialUrl);
  writeStartupLog(`createMainWindow:loaded ${initialUrl}`);
  if (browserWindowManager?.attachEmbeddedHost) {
    await browserWindowManager.attachEmbeddedHost({ hostWindow: mainWindow });
  }
}

async function ensureMainWindow() {
  if (focusExistingWindow()) {
    return;
  }

  if (!mainWindowCreationPromise) {
    mainWindowCreationPromise = createMainWindow().finally(() => {
      mainWindowCreationPromise = null;
    });
  }

  return mainWindowCreationPromise;
}

function navigateToRoute(routePath) {
  if (!mainWindow || mainWindow.isDestroyed() || !nextServerUrl) {
    return;
  }

  const targetUrl = new URL(normalizeRoutePath(routePath), `${nextServerUrl}/`).toString();
  void mainWindow.loadURL(targetUrl);
}

function installApplicationMenu() {
  const browserSurfaceEnabled = browserCapabilities?.snapshot()?.securityVerified === true;
  const template = createApplicationMenuTemplate({
    callbacks: {
      onNotesCommand: (commandId) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("shadowing:menu:command", commandId);
        }
      },
      onCheckForUpdates: () => {
        void openUpgradeEntry();
      },
      onChooseVault: () => {
        void pickVaultDirectory();
      },
      onOpenAssessment: () => navigateToRoute("/assessment"),
      onOpenBrowser: () => {
        void browserWindowManager?.openBrowser?.().catch((error) => {
          writeStartupLog(`browser-window:open-failed ${error?.stack ?? error}`);
        });
      },
      onOpenHome: () => navigateToRoute("/"),
      onOpenNotes: () => navigateToRoute("/notes"),
      onOpenWorkspace: () => navigateToRoute("/workspace"),
      onRevealDownloads: () => {
        void shell.openPath(getDownloadsDirectoryInfo().directoryPath);
      },
    },
    includeBrowserMenu: browserSurfaceEnabled,
    includeDevTools: isDevMode,
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const hasSingleInstanceLock =
  process.env.AURIS_PACKAGED_SMOKE === "1" || app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  writeStartupLog("app:single-instance-lock-denied");
  app.quit();
}

function registerDesktopHandlers() {
  createNotesRecoveryIpc({
    ipcMain,
    requireTrustedSender: requireTrustedMainEvent,
    store: getNotesRecoveryStore(),
  });

  ipcMain.handle("shadowing:commands:list", async () => {
    await loadPluginRuntime();
    return getDesktopCommands().map((command) => ({
      id: command.id,
      title: command.title,
    }));
  });

  ipcMain.handle("shadowing:downloads:export-json", async (_event, filename, payload) =>
    exportJsonToDownloads(filename, payload),
  );

  ipcMain.handle("shadowing:downloads:export-pdf", async (_event, filename, html, options) =>
    exportPdfToDownloads(filename, html, options),
  );

  ipcMain.handle("shadowing:downloads:export-text", async (_event, filename, content) =>
    exportTextToDownloads(filename, content),
  );

  ipcMain.handle("shadowing:downloads:export-vault-folder", async (_event, folderName, manifest) =>
    exportVaultFolderToDownloads(folderName, manifest),
  );

  ipcMain.handle("shadowing:downloads:get-directory-info", async () => getDownloadsDirectoryInfo());

  ipcMain.handle("shadowing:downloads:reveal-directory", async () => {
    await shell.openPath(getDownloadsDirectoryInfo().directoryPath);
  });

  ipcMain.handle("shadowing:voice-engine:get-status", async () =>
    getVoiceEngineRuntime().getStatus(),
  );

  ipcMain.handle("shadowing:voice-engine:get-capabilities", async () =>
    getVoiceEngineRuntime().getCapabilities(),
  );

  ipcMain.handle("shadowing:voice-engine:start", async () =>
    getVoiceEngineRuntime().start(),
  );

  ipcMain.handle("shadowing:voice-engine:stop", async () =>
    getVoiceEngineRuntime().stop(),
  );

  ipcMain.handle("shadowing:voice-engine:generate", async (_event, input) =>
    getVoiceEngineRuntime().generate(input),
  );

  ipcMain.handle("shadowing:training-history:list-recent", async () =>
    listRecentTrainingSessions(),
  );

  ipcMain.handle("shadowing:training-history:get-playback", async (_event, sessionId) =>
    getTrainingPlayback(sessionId),
  );

  ipcMain.handle("shadowing:training-history:save-prepared-session", async (_event, input) => {
    savePreparedTrainingSession(input);
  });

  ipcMain.handle("shadowing:training-history:delete-session", async (_event, sessionId) => {
    deleteTrainingSession(sessionId);
  });

  ipcMain.handle("shadowing:assessment-history:delete", async (_event, assessmentId) =>
    deleteAssessmentHistory(assessmentId),
  );

  ipcMain.handle("shadowing:assessment-history:list", async () => listAssessmentHistory());

  ipcMain.handle("shadowing:assessment-history:save", async (_event, record) =>
    saveAssessmentHistory(record),
  );

  ipcMain.handle("shadowing:assessment-history:import-legacy", async (_event, records) =>
    importLegacyAssessmentHistory(records),
  );

  ipcMain.handle("shadowing:commands:run", async (_event, commandId) => {
    await loadPluginRuntime();
    const command = getDesktopCommands().find((item) => item.id === commandId);

    if (!command) {
      return { executed: false };
    }

    await command.run();
    return { executed: true };
  });

  ipcMain.handle("shadowing:clipboard:write-text", async (event, text) => {
    requireTrustedDesktopEvent(event);
    clipboard.writeText(String(text ?? ""));
  });

  ipcMain.handle(
    "shadowing:clipboard:write-html",
    async (event, html, text) => {
      requireTrustedMainFrameEvent(event);
      if (typeof html !== "string" || typeof text !== "string") {
        throw new TypeError("Rich clipboard content must be strings.");
      }
      if (Buffer.byteLength(html, "utf8") > MAX_RICH_CLIPBOARD_HTML_BYTES) {
        throw new RangeError("Rich clipboard HTML exceeds the 40 MB limit.");
      }
      if (Buffer.byteLength(text, "utf8") > MAX_RICH_CLIPBOARD_TEXT_BYTES) {
        throw new RangeError("Rich clipboard text exceeds the 4 MB limit.");
      }
      clipboard.write({ html, text });
    },
  );

  ipcMain.handle("shadowing:clipboard:read-text", async (event) => {
    requireTrustedDesktopEvent(event);
    return clipboard.readText();
  });

  ipcMain.handle("shadowing:notes-mcp:get-server-info", async (event) => {
    requireTrustedDesktopEvent(event);
    return getNotesMcpServerInfo();
  });

  ipcMain.handle("shadowing:notes-mcp:update-policy", async (event, policyPatch) => {
    requireTrustedDesktopEvent(event);
    return updateNotesMcpPolicy(policyPatch);
  });

  ipcMain.handle(
    "shadowing:notes-mcp:resolve-request",
    async (event, bridgeRequestId, result) => {
      requireTrustedDesktopEvent(event);
      getNotesMcpBridge().resolveRequest(bridgeRequestId, result);
    },
  );

  ipcMain.handle(
    "shadowing:notes-mcp:reject-request",
    async (event, bridgeRequestId, errorMessage) => {
      requireTrustedDesktopEvent(event);
      getNotesMcpBridge().rejectRequest(bridgeRequestId, errorMessage);
    },
  );

  ipcMain.handle("shadowing:notes-mcp:list-clients", async (event) => {
    requireTrustedDesktopEvent(event);
    return listMcpClients(getMcpInstallerOptions());
  });

  // 安装与修复是同一个动作：写入/覆盖 auris-notes 这一条，其余配置保持不变。
  ipcMain.handle("shadowing:notes-mcp:install-client", async (event, clientId) => {
    requireTrustedDesktopEvent(event);
    await installMcpClient(String(clientId), getMcpInstallerOptions());
    return listMcpClients(getMcpInstallerOptions());
  });

  ipcMain.handle("shadowing:notes-mcp:remove-client", async (event, clientId) => {
    requireTrustedDesktopEvent(event);
    await removeMcpClient(String(clientId), getMcpInstallerOptions());
    return listMcpClients(getMcpInstallerOptions());
  });

  ipcMain.handle("shadowing:terminal:create", async (event, input) => {
    requireTrustedDesktopEvent(event);
    return createTerminalSession(input);
  });

  ipcMain.handle("shadowing:terminal:list", async (event) => {
    requireTrustedDesktopEvent(event);
    return getTerminalSessionManager().listSessions();
  });
  ipcMain.handle("shadowing:terminal:resume", async (event, input) => {
    requireTrustedDesktopEvent(event);
    const sessionId = requireTerminalSessionId(input?.sessionId);
    const existing = getTerminalSessionManager().listSessions().find((item) => item.id === sessionId);
    return existing ?? createTerminalSession(input);
  });

  ipcMain.handle("shadowing:terminal:write", async (event, sessionId, data) => {
    requireTrustedDesktopEvent(event);
    getTerminalSessionManager().write(requireTerminalSessionId(sessionId), String(data ?? ""));
  });

  ipcMain.handle("shadowing:terminal:resize", async (event, sessionId, size) => {
    requireTrustedDesktopEvent(event);
    getTerminalSessionManager().resize(requireTerminalSessionId(sessionId), {
      cols: normalizeTerminalSize(size?.cols, 80),
      rows: normalizeTerminalSize(size?.rows, 24),
    });
  });

  ipcMain.handle("shadowing:terminal:kill", async (event, sessionId) => {
    requireTrustedDesktopEvent(event);
    getTerminalSessionManager().kill(requireTerminalSessionId(sessionId));
    persistTerminalRecovery();
  });

  ipcMain.handle("shadowing:plugins:list", async () => {
    const runtime = await loadPluginRuntime();
    return runtime.plugins;
  });

  ipcMain.handle("shadowing:runtime-state:get", async () => readRuntimeState());

  ipcMain.handle("shadowing:runtime-state:import-legacy", async (_event, legacyState) =>
    importLegacyRuntimeState(legacyState),
  );

  ipcMain.handle("shadowing:runtime-state:set-last-workspace", async (_event, workspace) =>
    updateRuntimeState({
      lastVisitedAt: new Date().toISOString(),
      lastWorkspace: workspace,
    }),
  );

  ipcMain.handle(
    "shadowing:runtime-state:set-resume-target",
    async (_event, targetType, targetId) =>
      updateRuntimeState({
        primaryResumeId:
          typeof targetId === "string" && targetId.trim() ? targetId.trim() : null,
        primaryResumeType:
          targetType === "training" || targetType === "assessment" || targetType === "note"
            ? targetType
            : null,
      }),
  );

  ipcMain.handle("shadowing:ai-dock:set-visibility", async (event, isOpen) => {
    requireTrustedDesktopEvent(event);
    const currentRuntimeState = readRuntimeState();
    const currentAiDockState = aiDockStateBuffer.peek() ?? currentRuntimeState.aiDock;
    const nextRuntimeState = aiDockStateBuffer.commit({
      ...currentAiDockState,
      isOpen: Boolean(isOpen),
    });
    const manager = getAiViewManager();

    if (manager) {
      manager.syncLayout(createAiDockLayoutFromRuntimeState(nextRuntimeState));
    }

    return nextRuntimeState;
  });

  ipcMain.handle("shadowing:ai-dock:set-active-provider", async (event, providerId) => {
    requireTrustedDesktopEvent(event);
    const currentRuntimeState = readRuntimeState();
    const currentAiDockState = aiDockStateBuffer.peek() ?? currentRuntimeState.aiDock;
    const nextRuntimeState = aiDockStateBuffer.commit({
      ...currentAiDockState,
      activeProvider: normalizeAiDockProviderId(providerId),
    });
    const manager = getAiViewManager();

    if (manager) {
      manager.syncLayout(createAiDockLayoutFromRuntimeState(nextRuntimeState));
    }

    return nextRuntimeState;
  });

  ipcMain.handle("shadowing:ai-dock:set-active-view", async (event, activeView) => {
    requireTrustedDesktopEvent(event);
    const currentRuntimeState = readRuntimeState();
    const currentAiDockState = aiDockStateBuffer.peek() ?? currentRuntimeState.aiDock;
    const nextRuntimeState = aiDockStateBuffer.commit({
      ...currentAiDockState,
      activeView: normalizeAiDockView(activeView),
    });
    const manager = getAiViewManager();

    if (manager) {
      manager.syncLayout(createAiDockLayoutFromRuntimeState(nextRuntimeState));
    }

    return nextRuntimeState;
  });

  ipcMain.handle("shadowing:ai-dock:sync-layout", async (event, layout) => {
    requireTrustedDesktopEvent(event);
    const currentRuntimeState = readRuntimeState();
    const currentAiDockState = aiDockStateBuffer.peek() ?? currentRuntimeState.aiDock;
    const normalizedLayout = {
      activeProvider: normalizeAiDockProviderId(layout?.activeProvider),
      activeView: normalizeAiDockView(layout?.activeView),
      bounds: normalizeAiDockBounds(layout?.bounds),
      isOpen: Boolean(layout?.isOpen),
      panelWidth: normalizeAiDockPanelWidth(
        layout?.panelWidth,
        currentAiDockState?.panelWidth,
      ),
    };
    const nextAiDockState = {
      activeProvider: normalizedLayout.activeProvider,
      activeView: normalizedLayout.activeView,
      isOpen: normalizedLayout.isOpen,
      panelWidth: normalizedLayout.panelWidth,
    };
    aiDockStateBuffer.schedule(nextAiDockState);
    const manager = getAiViewManager();

    if (manager) {
      manager.syncLayout(normalizedLayout);
    }

    return createAiDockLayoutFromRuntimeState(
      {
        aiDock: nextAiDockState,
      },
      normalizedLayout.bounds,
    );
  });

  ipcMain.handle("shadowing:ai-prompts:list", async (event) => {
    requireTrustedDesktopEvent(event);
    return getAiLibraryRepository()?.listPrompts() ?? [];
  });

  ipcMain.handle("shadowing:ai-prompts:save", async (event, input) => {
    requireTrustedDesktopEvent(event);
    return getAiLibraryRepository()?.savePrompt(input) ?? null;
  });

  ipcMain.handle("shadowing:ai-prompts:update", async (event, id, input) => {
    requireTrustedDesktopEvent(event);
    return getAiLibraryRepository()?.updatePrompt(Number(id), input) ?? null;
  });

  ipcMain.handle("shadowing:ai-prompts:delete", async (event, id) => {
    requireTrustedDesktopEvent(event);
    return getAiLibraryRepository()?.deletePrompt(Number(id)) ?? [];
  });

  ipcMain.handle("shadowing:ai-prompts:search", async (event, query) => {
    requireTrustedDesktopEvent(event);
    return getAiLibraryRepository()?.searchPrompts(String(query ?? "")) ?? [];
  });

  ipcMain.handle("shadowing:ai-prompts:import", async (event, payload, mergeStrategy) => {
    requireTrustedDesktopEvent(event);
    return (
      getAiLibraryRepository()?.importPrompts(
        payload,
        mergeStrategy === "overwrite" ? "overwrite" : "skip",
      ) ?? {
        errors: [],
        imported: 0,
        skipped: 0,
      }
    );
  });

  ipcMain.handle("shadowing:ai-prompts:export", async (event) => {
    requireTrustedDesktopEvent(event);
    return (
      getAiLibraryRepository()?.exportPrompts() ?? {
        exportDate: new Date().toISOString(),
        prompts: [],
        version: "1.0",
      }
    );
  });

  ipcMain.handle("shadowing:ai-prompts:import-default-library", async (event) => {
    requireTrustedDesktopEvent(event);
    return (
      getAiLibraryRepository()?.importDefaultPromptLibrary() ?? {
        errors: [],
        imported: 0,
        skipped: 0,
      }
    );
  });

  ipcMain.handle("shadowing:ai-history:list", async (event) => {
    requireTrustedDesktopEvent(event);
    return getAiLibraryRepository()?.listHistory() ?? [];
  });

  ipcMain.handle("shadowing:ai-history:save", async (event, input) => {
    requireTrustedDesktopEvent(event);
    return getAiLibraryRepository()?.saveHistory(input) ?? null;
  });

  ipcMain.handle("shadowing:ai-history:delete", async (event, id) => {
    requireTrustedDesktopEvent(event);
    return getAiLibraryRepository()?.deleteHistory(Number(id)) ?? [];
  });

  ipcMain.handle("shadowing:ai-history:search", async (event, query) => {
    requireTrustedDesktopEvent(event);
    return getAiLibraryRepository()?.searchHistory(String(query ?? "")) ?? [];
  });

  ipcMain.handle("shadowing:ai-history:toggle-favorite", async (event, id) => {
    requireTrustedDesktopEvent(event);
    return getAiLibraryRepository()?.toggleHistoryFavorite(Number(id)) ?? null;
  });

  ipcMain.handle("shadowing:ai-history:import", async (event, payload, mergeStrategy) => {
    requireTrustedDesktopEvent(event);
    return (
      getAiLibraryRepository()?.importHistory(
        payload,
        mergeStrategy === "overwrite" ? "overwrite" : "skip",
      ) ?? {
        errors: [],
        imported: 0,
        skipped: 0,
      }
    );
  });

  ipcMain.handle("shadowing:ai-history:export", async (event) => {
    requireTrustedDesktopEvent(event);
    return (
      getAiLibraryRepository()?.exportHistory() ?? {
        conversations: [],
        exportDate: new Date().toISOString(),
        version: "1.0",
      }
    );
  });

  ipcMain.handle(
    "shadowing:ai-history:capture-current-conversation",
    async (event, providerId) => {
      requireTrustedDesktopEvent(event);
      return captureCurrentAiConversation(providerId);
    },
  );

  ipcMain.handle("shadowing:plugins:open-directory", async () => {
    await revealPluginsDirectory();
  });

  ipcMain.handle("shadowing:plugins:set-enabled", async (_event, pluginId, enabled) => {
    await writeDesktopConfig({
      ...desktopConfig,
      pluginsEnabled: {
        ...desktopConfig.pluginsEnabled,
        [pluginId]: Boolean(enabled),
      },
    });
    const runtime = await loadPluginRuntime();
    return runtime.plugins;
  });

  ipcMain.handle("shadowing:vault:get-directory-info", async (event) => {
    requireTrustedMainEvent(event);
    return getVaultDirectoryInfo();
  });

  ipcMain.handle("shadowing:vault:list-files", async (event) => {
    requireTrustedMainEvent(event);
    const vaultPath = await getVaultPath();
    return vaultPath ? walkVaultFiles(vaultPath) : [];
  });

  ipcMain.handle("shadowing:vault:pick-directory", async (event) => {
    requireTrustedMainEvent(event);
    return pickVaultDirectory();
  });
  ipcMain.handle("shadowing:vault:pick-file", async (event) => {
    requireTrustedMainEvent(event);
    return pickVaultFile();
  });

  ipcMain.handle("shadowing:vault:list-roots", async (event) => {
    requireTrustedMainEvent(event);
    return listVaultRoots();
  });

  // 换根不弹对话框，但只接受已授权的根——白名单校验在 setVaultRoot 里，理由见
  // 那里的注释（否则这个 handler 会把受限的笔记读写升级成任意文件读取）。
  ipcMain.handle("shadowing:vault:set-root", async (event, rootPath) => {
    requireTrustedMainEvent(event);
    return setVaultRoot(rootPath);
  });

  ipcMain.handle("shadowing:vault:create-directory", async (event, relativePath) => {
    requireTrustedMainEvent(event);
    const target = await resolveVaultTarget(relativePath);
    return serializeVaultMutation(async () => {
      await fs.mkdir(target.absoluteTarget, { recursive: true });
      scheduleVaultChanged();
    });
  });

  ipcMain.handle("shadowing:vault:read-file", async (event, relativePath) => {
    requireTrustedMainEvent(event);
    const target = await resolveVaultTarget(relativePath);
    return (await pathExists(target.absoluteTarget))
      ? fs.readFile(target.absoluteTarget, "utf8")
      : null;
  });

  ipcMain.handle("shadowing:vault:remove-file", async (event, relativePath) => {
    requireTrustedMainEvent(event);
    const { operations } = await getVaultFileOperations();
    return serializeVaultMutation(async () => {
      await operations.trash(relativePath);
      scheduleVaultChanged();
    });
  });

  ipcMain.handle("shadowing:vault:copy-file", async (event, fromPath, toPath) => {
    requireTrustedMainEvent(event);
    const { operations } = await getVaultFileOperations();
    return serializeVaultMutation(async () => {
      await operations.copy(fromPath, toPath);
      scheduleVaultChanged();
    });
  });

  ipcMain.handle("shadowing:vault:reveal-file", async (event, relativePath) => {
    requireTrustedMainEvent(event);
    const { operations } = await getVaultFileOperations();
    shell.showItemInFolder(await operations.reveal(relativePath));
  });

  ipcMain.handle("shadowing:vault:restore-last-deleted", async (event) => {
    requireTrustedMainEvent(event);
    const { operations } = await getVaultFileOperations();
    return serializeVaultMutation(async () => {
      const restoredPath = await operations.restoreLatest();
      if (restoredPath) scheduleVaultChanged();
      return restoredPath;
    });
  });

  ipcMain.handle("shadowing:vault:rename-file", async (event, fromPath, toPath) => {
    requireTrustedMainEvent(event);
    const { operations } = await getVaultFileOperations();
    return serializeVaultMutation(async () => {
      await operations.move(fromPath, toPath);
      scheduleVaultChanged();
    });
  });

  ipcMain.handle("shadowing:vault:move-file", async (event, fromPath, toPath) => {
    requireTrustedMainEvent(event);
    const { operations } = await getVaultFileOperations();
    return serializeVaultMutation(async () => {
      await operations.move(fromPath, toPath);
      scheduleVaultChanged();
    });
  });

  ipcMain.handle("shadowing:vault:reveal-plugins-directory", async (event) => {
    requireTrustedMainEvent(event);
    await revealPluginsDirectory();
  });

  ipcMain.handle("shadowing:vault:save-file", async (event, relativePath, content) => {
    requireTrustedMainEvent(event);
    const target = await resolveVaultTarget(relativePath);
    return serializeVaultMutation(async () => {
      await fs.mkdir(path.dirname(target.absoluteTarget), { recursive: true });
      if (typeof content === "string") {
        await writeFileAtomically(target.absoluteTarget, content, "utf8");
      } else {
        await writeFileAtomically(target.absoluteTarget, Buffer.from(content));
      }
      scheduleVaultChanged();
    });
  });

  ipcMain.handle("shadowing:video-library:get-snapshot", async () => getVideoLibrarySnapshot());

  ipcMain.handle("shadowing:video-library:pick-directory", async () => pickVideoLibraryDirectory());

  ipcMain.handle("shadowing:video-library:import-files", async () => importVideoFilesIntoLibrary());

  ipcMain.handle("shadowing:video-library:refresh", async () => refreshVideoLibrary());

  ipcMain.handle("shadowing:video-library:reveal-directory", async () => {
    await revealVideoLibraryDirectory();
  });

  ipcMain.handle("shadowing:video-library:get-video-details", async (_event, videoId) =>
    getVideoLibraryDetails(videoId),
  );

  ipcMain.handle(
    "shadowing:video-library:update-source-metadata",
    async (_event, videoId, metadata) => updateVideoLibraryMetadata(videoId, metadata),
  );

  ipcMain.handle(
    "shadowing:video-library:save-thumbnail",
    async (_event, videoId, thumbnail) => saveVideoLibraryThumbnail(videoId, thumbnail),
  );

  ipcMain.handle("shadowing:window:show-in-folder", async (_event, targetPath) => {
    shell.showItemInFolder(targetPath);
  });

  ipcMain.handle("shadowing:nia-standalone:open", async (event, launch) => openNiaStandaloneWindow(event, launch));
  ipcMain.handle("shadowing:system:open-upgrade", async () => openUpgradeEntry());

  ipcMain.handle("shadowing:system:detect-binary", async (_event, name) =>
    detectSystemBinary(name),
  );

  ipcMain.handle("shadowing:system:pick-file", async (_event, options) =>
    pickSystemFile(options),
  );

  /* ---------------------------------------------------------------- */
  /* 自动更新                                                        */
  /* ---------------------------------------------------------------- */

  ipcMain.handle("shadowing:updates:get-state", async (event) => {
    requireTrustedDesktopEvent(event);
    const updater = await getAppUpdater();
    return {
      ...updater.getSnapshot(),
      currentVersion: AURIS_APP_VERSION,
    };
  });

  ipcMain.handle("shadowing:updates:check", async (event) => {
    requireTrustedDesktopEvent(event);
    const updater = await getAppUpdater();
    await updater.check();
    return updater.getSnapshot();
  });

  ipcMain.handle("shadowing:updates:download", async (event) => {
    requireTrustedDesktopEvent(event);
    const updater = await getAppUpdater();
    await updater.download();
    return updater.getSnapshot();
  });

  ipcMain.handle("shadowing:updates:quit-and-install", async (event) => {
    requireTrustedDesktopEvent(event);
    const updater = await getAppUpdater();
    return updater.quitAndInstall();
  });

  ipcMain.handle("shadowing:updates:open-releases", async (event) => {
    requireTrustedDesktopEvent(event);
    const updater = await getAppUpdater();
    return updater.openReleasesPage();
  });

  ipcMain.handle("shadowing:updates:reset", async (event) => {
    requireTrustedDesktopEvent(event);
    const updater = await getAppUpdater();
    updater.reset();
    return updater.getSnapshot();
  });
  ipcMain.handle("shadowing:updates:recover", async (event) => {
    requireTrustedDesktopEvent(event);
    const updater = await getAppUpdater();
    const result = updater.recoverFromStall();
    return { ...result, snapshot: updater.getSnapshot() };
  });
}

// Only these tools may be probed from the renderer — never run an arbitrary
// command name that arrives over IPC.
const DETECTABLE_BINARIES = new Set([
  "pandoc",
  "claude",
  "codex",
  "gemini",
  "ollama",
]);

function runCommandCapture(command, args) {
  return new Promise((resolve) => {
    let child;

    try {
      child = spawn(command, args, { windowsHide: true });
    } catch {
      resolve({ code: 1, stdout: "", stderr: "" });
      return;
    }

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore
      }
      resolve({ code: 1, stdout, stderr });
    }, 4000);

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

async function detectSystemBinary(name) {
  if (typeof name !== "string" || !DETECTABLE_BINARIES.has(name)) {
    return { installed: false, version: null, path: null };
  }

  const locator = process.platform === "win32" ? "where" : "which";
  const located = await runCommandCapture(locator, [name]);

  if (located.code !== 0 || !located.stdout.trim()) {
    return { installed: false, version: null, path: null };
  }

  const binaryPath = located.stdout.split(/\r?\n/)[0].trim();
  let version = null;
  const versioned = await runCommandCapture(name, ["--version"]);

  if (versioned.code === 0) {
    version = versioned.stdout.split(/\r?\n/)[0].trim() || null;
  }

  return { installed: true, version, path: binaryPath };
}

async function pickSystemFile(options) {
  const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
    properties: ["openFile"],
    title: (options && options.title) || "选择文件",
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
}

app.whenReady().then(async () => {
  writeStartupLog("app:ready");
  await readDesktopConfig();
  getAiLibraryRepository();
  getRuntimeStateRepository();
  getLocalHistoryRepository();
  getVideoLibraryRepository();
  await refreshVaultWatcher();
  registerVideoMediaProtocol();
  registerDesktopHandlers();
  installApplicationMenu();
  writeStartupLog("app:handlers-registered");
  if (desktopConfig.mcp.enabled && desktopConfig.mcp.startOnLaunch) {
    try {
      await getNotesMcpBridge().start();
    } catch (error) {
      writeStartupLog(`notes-mcp:startup-error ${error?.stack ?? error}`);
    }
  }
  await ensureMainWindow();
  initializeBrowserSubsystem(nextServerUrl);
  await browserWindowManager?.attachEmbeddedHost?.({ hostWindow: mainWindow });
  initializeNiaSubsystem();
  initializeWorkflowSubsystem();
  initializeBrowserStatusSubsystem();
  installApplicationMenu();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await ensureMainWindow();
      return;
    }

    focusExistingWindow();
  });
}).catch((error) => {
  writeStartupLog(`app:startup-error ${error?.stack ?? error}`);
  dialog.showErrorBox(
    "桌面应用启动失败",
    error instanceof Error ? error.message : String(error),
  );
  app.quit();
});

app.on("second-instance", () => {
  writeStartupLog("app:second-instance");
  if (!focusExistingWindow()) {
    void ensureMainWindow();
  }
});

app.on("window-all-closed", async () => {
  writeStartupLog("app:window-all-closed");
  if (process.platform !== "darwin") {
    await stopNextServer();
    app.quit();
  }
});

app.on("before-quit", async () => {
  const closeAttempt = getCloseAttemptTracker().begin("before-quit");
  writeStartupLog("app:before-quit:start");
  if (appUpdaterStallWatchdog) {
    clearInterval(appUpdaterStallWatchdog);
    appUpdaterStallWatchdog = null;
  }
  getCloseAttemptTracker().milestone(closeAttempt, "updater-watchdog-cleared");
  aiDockStateBuffer.flush();
  aiDockStateBuffer.dispose();
  browserWindowManager?.closeAll();
  browserWindowManager = null;
  getCloseAttemptTracker().milestone(closeAttempt, "browser-windows-closed");
  browserIpc?.dispose();
  browserIpc = null;
  browserGrantsIpc?.dispose();
  browserGrantsIpc = null;
  browserSecurityIpc?.dispose();
  browserSecurityIpc = null;
  browserStatusIpc?.dispose();
  browserStatusIpc = null;
  browserStatusService?.dispose();
  browserStatusService = null;
  niaIpc?.dispose();
  niaIpc = null;
  niaProviderRuntime = null;
  workflowIpc?.dispose();
  workflowIpc = null;
  browserWorkflowRuntime = null;
  workflowFacade = null;
  workflowCapabilities = null;
  browserWorkflowRunRegistry = null;
  browserOperationGuard = null;
  browserApprovalManager = null;
  browserGrantManager = null;
  browserAuditLog = null;
  try {
    browserPageExecutor?.dispose?.();
  } catch {
    /* ignore */
  }
  browserPageExecutor = null;
  browserStateRepository?.close();
  browserStateRepository = null;
  browserCapabilities = null;
  browserSecurityGates = null;
  browserSessionCapabilities = null;
  browserLeaseManager = null;
  browserRegistry = null;
  browserPartitionSelector = null;
  closeTerminalSessionManager();
  getCloseAttemptTracker().milestone(closeAttempt, "terminal-closed");
  notesMcpBridge?.close();
  notesMcpBridge = null;
  browserMcpDispatcher = null;
  closeVaultWatcher();
  closeAiLibraryRepository();
  localHistoryRepository?.close();
  localHistoryRepository = null;
  closeVideoLibraryRepository();
  runtimeStateRepository?.close();
  runtimeStateRepository = null;
  getCloseAttemptTracker().milestone(closeAttempt, "runtime-resources-closed");
  await stopNextServer();
  getCloseAttemptTracker().complete(closeAttempt);
  writeStartupLog("app:before-quit:complete");
});
