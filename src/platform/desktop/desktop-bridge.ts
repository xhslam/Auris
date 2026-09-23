import type {
  AppRuntimeState,
  DesktopAiDockState,
  DesktopAiDockView,
  DesktopAiProviderId,
  DesktopResumeTargetType,
  AppWorkspaceId,
  DesktopRuntimeState,
} from "@/features/app-runtime/app-runtime.types";
import type { PronunciationAssessmentRecord } from "@/features/assessment/pronunciation-assessment.types";
import type { SessionPlayback, SessionSourceType } from "@/features/sessions/session.types";
import type {
  DesktopVideoDetails,
  DesktopVideoLibrarySnapshot,
  DesktopVideoMetadataInput,
  DesktopVideoThumbnailInput,
} from "@/features/video-library/video-library.types";
import type { BrowserStatusSnapshot } from "@/features/browser/window-status";
import type { NiaBridgeCommand } from "@/features/nia/nia-bridge";
import type { PdfExportOptions } from "@/platform/files/pdf-export-options";
import type {
  DesktopIslandContentSnapshot,
  DesktopIslandRendererIntent,
  DesktopIslandSettings,
  DesktopIslandSyncResult,
} from "@/features/desktop-island/desktop-island.types";

export type DesktopCommandRecord = {
  id: string;
  title: string;
};

export type DesktopCommandRunResult = {
  executed: boolean;
};

export type DesktopClipboardBridge = {
  readText?: () => Promise<string>;
  writeHtml?: (html: string, text: string) => Promise<void>;
  writeText: (text: string) => Promise<void>;
};

export type DesktopNotesMcpRequest = {
  id?: string | number | null;
  method: string;
  params?: unknown;
};

export type DesktopNotesMcpServerInfo = {
  enabled: boolean;
  port: number | null;
  policy: {
    autoApproveEdits: boolean;
    enabled: boolean;
    startOnLaunch: boolean;
  };
  ccSwitchLink?: string | null;
};

export type DesktopMcpClientStatus =
  | "connected"
  | "not-installed"
  | "outdated"
  | "unreadable";

export type DesktopMcpClient = {
  configPath: string;
  detail: string;
  format: "json" | "toml" | "opencode";
  id: string;
  label: string;
  status: DesktopMcpClientStatus;
  current?: boolean;
  legacy?: boolean;
};

export type DesktopBrowserStandingGrant = Readonly<{
  grantId: string;
  kind: "standing";
  operation: string;
  origin: string;
}>;

export type DesktopBrowserAttachmentGrant = Readonly<{
  grantId: string;
  kind: "attachment";
  mode: "once" | "until-navigation";
  navigationGeneration: number;
  tabId: string;
  windowId: string;
}>;

export type DesktopBrowserGrantsSnapshot = Readonly<{
  attachments: readonly DesktopBrowserAttachmentGrant[];
  available: boolean;
  standingGrants: readonly DesktopBrowserStandingGrant[];
}>;

export type DesktopBrowserSecuritySnapshot = Readonly<{
  automationEnabled: boolean;
  automationToggleAvailable: boolean;
  available: boolean;
  cookieReplay: boolean;
  eval: Readonly<{
    description: string;
    enabled: boolean;
    scope: string;
  }>;
  localFixture: boolean;
  localStorageReplay: boolean;
  namedProfiles: boolean;
  production: boolean;
  securityReason: string | null;
  securityVerified: boolean;
}>;

export type DesktopBrowserStatusBridge = Readonly<{
  focusBrowserTab: (windowId: string, tabId: string) => Promise<boolean>;
  focusBrowserWindow: (windowId: string) => Promise<boolean>;
  getBrowserStatus: () => Promise<BrowserStatusSnapshot>;
  subscribe: (listener: (snapshot: BrowserStatusSnapshot) => void) => () => void;
}>;

export type DesktopAiDockBounds = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type DesktopAiDockLayout = DesktopAiDockState & {
  bounds: DesktopAiDockBounds | null;
};

export type DesktopAiPromptRecord = {
  category: string;
  content: string;
  id: number;
  isFavorite: boolean;
  lastUsed: number | null;
  tags: string[];
  title: string;
  useCount: number;
  variables: string[];
};

export type DesktopAiHistoryRecord = {
  content: string;
  conversationId: string;
  id: number;
  isFavorite: boolean;
  modifiedAt: number;
  notes: string;
  provider: DesktopAiProviderId;
  tags: string[];
  timestamp: number;
  title: string;
  url: string;
};

export type DesktopAiLibraryImportResult = {
  errors: Array<{
    error: string;
    item?: string;
  }>;
  imported: number;
  skipped: number;
};

export type DesktopAiPromptExport = {
  exportDate: string;
  prompts: DesktopAiPromptRecord[];
  version: string;
};

export type DesktopAiHistoryExport = {
  conversations: DesktopAiHistoryRecord[];
  exportDate: string;
  version: string;
};

export type DesktopTerminalSessionInput = {
  cols?: number;
  cwd?: string | null;
  rows?: number;
  sessionId?: string;
  shell?: string;
  workspaceInstanceId?: string | null;
};

export type DesktopTerminalSessionRecord = {
  backend: "pipe" | "pty";
  cols?: number;
  cwd: string | null;
  id: string;
  output?: string;
  rows?: number;
  shell: string;
  workspaceInstanceId?: string | null;
};

export type DesktopTerminalDataEvent = {
  data: string;
  sessionId: string;
};

export type DesktopTerminalExitEvent = {
  errorMessage?: string | null;
  exitCode: number | null;
  sessionId: string;
  signal?: string | null;
};

export type DesktopTerminalBridge = {
  create: (
    input: DesktopTerminalSessionInput,
  ) => Promise<DesktopTerminalSessionRecord>;
  kill: (sessionId: string) => Promise<void>;
  list: () => Promise<DesktopTerminalSessionRecord[]>;
  resume: (input: DesktopTerminalSessionInput) => Promise<DesktopTerminalSessionRecord>;
  onData: (listener: (event: DesktopTerminalDataEvent) => void) => () => void;
  onExit: (listener: (event: DesktopTerminalExitEvent) => void) => () => void;
  resize: (
    sessionId: string,
    size: { cols: number; rows: number },
  ) => Promise<void>;
  write: (sessionId: string, data: string) => Promise<void>;
};

export type DesktopDownloadsDirectoryInfo = {
  directoryPath: string;
};

export type DesktopDownloadsExportResult = {
  path: string;
};

export type DesktopVaultFolderExportResult = {
  filesCopied: number;
  manifestPath: string;
  path: string;
};

export type DesktopPluginManifest = {
  description?: string;
  id: string;
  name: string;
  version: string;
};

export type DesktopPluginRecord = {
  enabled: boolean;
  entryPath: string | null;
  errorMessage: string | null;
  manifest: DesktopPluginManifest;
};

export type DesktopNotesRecoveryDraft = {
  baseRawSource?: string | null;
  captureId?: string;
  capturedAt: string;
  path: string;
  rawSource: string;
  schemaVersion?: number;
  vaultRoot: string | null;
};

export type DesktopNotesHotExitWorkspace = {
  activePath: string | null;
  commandHistory: string[];
  editorModesByPath: Record<string, "source" | "split" | "wysiwyg">;
  leftSidebarCollapsed: boolean;
  leftSidebarMode: "files" | "outline" | "search";
  openTabs: string[];
  pinnedTabs: string[];
  recentFiles: string[];
  rightSidebarCollapsed: boolean;
  rightSidebarMode: "backlinks" | "learning" | "properties" | "terminal";
};

export type DesktopNotesHotExitWorkspaceSession = {
  capturedAt: string;
  schemaVersion: number;
  vaultRoot: string | null;
  workspace: DesktopNotesHotExitWorkspace;
};

export type DesktopNotesHistoryVersion = {
  id: string;
  path: string;
  rawSource: string;
  savedAt: string;
  vaultRoot: string | null;
};

export type DesktopNotesRecoveryBridge = {
  captureDraft: (
    draft: Omit<DesktopNotesRecoveryDraft, "capturedAt">,
  ) => Promise<boolean>;
  clearDraft: (path: string, vaultRoot: string | null) => Promise<void>;
  captureWorkspace: (
    vaultRoot: string | null,
    workspace: DesktopNotesHotExitWorkspace,
  ) => Promise<boolean>;
  importLegacy: (payload: {
    drafts: DesktopNotesRecoveryDraft[];
    history: DesktopNotesHistoryVersion[];
  }) => Promise<{
    draftsImported: number;
    historyImported: number;
    imported: boolean;
  }>;
  listDrafts: (vaultRoot: string | null) => Promise<DesktopNotesRecoveryDraft[]>;
  listHistory: (
    path: string,
    vaultRoot: string | null,
  ) => Promise<DesktopNotesHistoryVersion[]>;
  loadWorkspace: (
    vaultRoot: string | null,
  ) => Promise<DesktopNotesHotExitWorkspaceSession | null>;
  recordHistory: (
    version: Omit<DesktopNotesHistoryVersion, "id" | "savedAt">,
  ) => Promise<DesktopNotesHistoryVersion | undefined>;
};

export type DesktopVoiceEngineRuntimeState =
  | "not_configured"
  | "starting"
  | "ready"
  | "busy"
  | "degraded"
  | "failed";

export type DesktopVoiceEngineProvider = "openai" | "voxcpm" | "windows";

export type DesktopVoiceEngineStatus = {
  activeProvider: DesktopVoiceEngineProvider;
  modelVersion?: string | null;
  platform: string;
  reason: string | null;
  state: DesktopVoiceEngineRuntimeState;
};

export type DesktopVoiceEngineCapabilities = {
  locales: string[];
  modes: Array<"preset" | "designed" | "reference_clone">;
  supportsReferenceAudio: boolean;
  supportsStylePrompt: boolean;
};

export type DesktopVoiceEngineGenerateInput = {
  locale?: string;
  referenceAudioPath?: string | null;
  sessionId: string;
  stylePrompt?: string | null;
  text: string;
  voiceProfileId: string;
};

export type DesktopVoiceEngineGenerateResult = {
  audioBase64: string;
  contentType: string;
  durationMs: number;
  transcriptWords: Array<{
    endMs: number;
    startMs: number;
    word: string;
  }>;
};

export type DesktopVaultDirectoryInfo = {
  directoryName: string | null;
  hasVault: boolean;
  pluginDirectory: string | null;
  vaultPath: string | null;
};

export type DesktopVaultFileSelection = DesktopVaultDirectoryInfo & {
  selectedFilePath: string | null;
};

/**
 * 一个已授权的 vault 根。
 *
 * `available` 报告它当前是否可达（外置盘拔了 / 目录被删 / 仓库被移动过）。
 * Workspace Rail 据此把它显示成不可用，而不是假装能切过去——静默切到一个空
 * vault 看起来就是笔记全丢了。
 */
export type DesktopVaultRoot = {
  available: boolean;
  isActive: boolean;
  name: string;
  path: string;
};

export type DesktopVaultFileRecord = {
  absolutePath: string;
  fileName: string;
  isDirectory?: boolean;
  mtime?: string | null;
  relativePath: string;
};

export type DesktopExternalMarkdownFile = {
  fileName: string;
  id: string;
  mtime: string;
  path: string;
  rawSource: string;
  savedSource: string;
};

/* ------------------------------------------------------------------ */
/* 自动更新（对齐 vmark mcpStore.update 语义）                          */
/* ------------------------------------------------------------------ */

/**
 * 更新状态机。`manual-download` 是 Auris 相对 vmark 多出来的一态：
 * macOS 未用 Developer ID 签名时 electron-updater 无法就地安装，此时诚实地
 * 告诉用户「去 releases 页手动下载」，而不是给一个必然失败的安装按钮。
 */
export type DesktopUpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "ready"
  | "manual-download"
  | "up-to-date"
  | "error"
  | "stalled";

export type DesktopUpdateInfo = {
  currentVersion: string;
  notes: string;
  pubDate: string;
  version: string;
};

export type DesktopUpdateProgress = {
  downloaded: number;
  total: number | null;
};

export type DesktopUpdateSnapshot = {
  canInstallInPlace: boolean;
  /**
   * 仅 `getState()` 返回时带上（主进程 `app.getVersion()`）；事件推送的增量
   * 快照不重复携带，所以是可选。
   */
  currentVersion?: string;
  downloadProgress: DesktopUpdateProgress | null;
  error: string | null;
  errorCode: string | null;
  lastCheckedAt: number | null;
  releasesUrl: string | null;
  status: DesktopUpdateStatus;
  stalledOperation: "check" | "download" | null;
  /** false 表示开发构建：可打开更新中心/发布页，但不连接自动更新源。 */
  supported?: boolean;
  updateInfo: DesktopUpdateInfo | null;
};

export type DesktopUpdateStateSnapshot = DesktopUpdateSnapshot & {
  currentVersion?: string;
};

export type DesktopUpdatesBridge = {
  check: () => Promise<DesktopUpdateSnapshot>;
  download: () => Promise<DesktopUpdateSnapshot>;
  getState: () => Promise<DesktopUpdateStateSnapshot>;
  onStateChange: (
    listener: (snapshot: DesktopUpdateSnapshot) => void,
  ) => () => void;
  openReleases: () => Promise<{ ok: boolean; reason?: string }>;
  /** 仅开发工作副本提供；旧版或已打包应用不会暴露。 */
  publishRelease?: () => Promise<{
    branch?: string;
    error?: string;
    ok: boolean;
    retriedTagPush?: boolean;
    tag?: string;
    version?: string;
  }>;
  /** 仅开发工作副本提供；旧版或已打包应用不会暴露。 */
  syncRepository?: () => Promise<{
    branch?: string;
    commit?: string;
    currentVersion?: string;
    error?: string;
    ok: boolean;
    repositoryRoot?: string;
    retriedPush?: boolean;
    skipped?: boolean;
    version?: string;
  }>;
  quitAndInstall: () => Promise<{ ok: boolean; reason?: string }>;
  reset: () => Promise<DesktopUpdateSnapshot>;
  recover: () => Promise<{
    ok: boolean;
    operation?: "check" | "download";
    reason?: string;
    snapshot: DesktopUpdateSnapshot;
  }>;
};

export type DesktopPreparedTrainingSessionInput = {
  audioAsset: {
    bytes: Uint8Array;
    contentType: string | null;
  } | null;
  originalText: string;
  playback: SessionPlayback;
  sourceType: SessionSourceType;
  title: string;
};

export type DesktopBridge = {
  desktopIsland?: {
    acknowledgeIntent: (actionId: string) => Promise<void>;
    getSettings: () => Promise<DesktopIslandSettings>;
    listPendingIntents: () => Promise<DesktopIslandRendererIntent[]>;
    onIntent: (listener: (intent: DesktopIslandRendererIntent) => void) => () => void;
    syncSnapshot: (
      snapshot: DesktopIslandContentSnapshot,
    ) => Promise<DesktopIslandSyncResult>;
    updateSettings: (
      patch: Partial<DesktopIslandSettings>,
    ) => Promise<DesktopIslandSettings>;
  };
  menu?: {
    onCommand: (listener: (commandId: string) => void) => () => void;
  };
  nia?: {
    // 命令联合直接取自 `NIA_BRIDGE_COMMANDS`，不再手抄一份。原先这里是手维护的
    // 副本，且已经漂移（漏了全部 provider 变更命令）。真正的消费方都走
    // `getNiaBridge()`（它有自己的 `NiaNativeBridge` 类型），所以这个联合的作用
    // 是描述 preload 的形状——描述错了比不描述更糟。
    invoke: (
      command: NiaBridgeCommand,
      payload?: Readonly<Record<string, unknown>>,
    ) => Promise<unknown>;
    subscribe: (listener: (event: unknown) => void) => boolean;
    unsubscribe: (listener: (event: unknown) => void) => boolean;
  };
  niaStandalone?: {
    open: (launch?: Readonly<Record<string, unknown>>) => Promise<boolean>;
    subscribeLaunch: (listener: (launch: Readonly<Record<string, unknown>>) => void) => () => void;
  };
  workflows?: {
    invoke: (
      command: "list" | "inspect" | "validate" | "start" | "get_state" | "cancel",
      payload?: Readonly<Record<string, unknown>>,
    ) => Promise<unknown>;
    subscribe: (listener: (event: unknown) => void) => boolean;
    unsubscribe: (listener: (event: unknown) => void) => boolean;
  };
  aiDock?: {
    setActiveProvider: (providerId: DesktopAiProviderId) => Promise<DesktopRuntimeState>;
    setActiveView: (view: DesktopAiDockView) => Promise<DesktopRuntimeState>;
    setVisibility: (isOpen: boolean) => Promise<DesktopRuntimeState>;
    syncLayout: (layout: DesktopAiDockLayout) => Promise<DesktopAiDockLayout>;
  };
  aiHistory?: {
    captureCurrentConversation: (
      providerId: DesktopAiProviderId,
    ) => Promise<DesktopAiHistoryRecord | null>;
    delete: (id: number) => Promise<DesktopAiHistoryRecord[]>;
    export: () => Promise<DesktopAiHistoryExport>;
    import: (
      payload: unknown,
      mergeStrategy?: "overwrite" | "skip",
    ) => Promise<DesktopAiLibraryImportResult>;
    list: () => Promise<DesktopAiHistoryRecord[]>;
    save: (
      input: Partial<DesktopAiHistoryRecord>,
    ) => Promise<DesktopAiHistoryRecord | null>;
    search: (query: string) => Promise<DesktopAiHistoryRecord[]>;
    toggleFavorite: (id: number) => Promise<DesktopAiHistoryRecord | null>;
  };
  aiPrompts?: {
    delete: (id: number) => Promise<DesktopAiPromptRecord[]>;
    export: () => Promise<DesktopAiPromptExport>;
    import: (
      payload: unknown,
      mergeStrategy?: "overwrite" | "skip",
    ) => Promise<DesktopAiLibraryImportResult>;
    importDefaultLibrary: () => Promise<DesktopAiLibraryImportResult>;
    list: () => Promise<DesktopAiPromptRecord[]>;
    save: (input: Partial<DesktopAiPromptRecord>) => Promise<DesktopAiPromptRecord | null>;
    search: (query: string) => Promise<DesktopAiPromptRecord[]>;
    update: (
      id: number,
      input: Partial<DesktopAiPromptRecord>,
    ) => Promise<DesktopAiPromptRecord | null>;
  };
  assessmentHistory?: {
    delete: (assessmentId: string) => Promise<PronunciationAssessmentRecord[]>;
    importLegacy: (
      records: PronunciationAssessmentRecord[],
    ) => Promise<PronunciationAssessmentRecord[]>;
    list: () => Promise<PronunciationAssessmentRecord[]>;
    save: (
      assessment: PronunciationAssessmentRecord,
    ) => Promise<PronunciationAssessmentRecord[]>;
  };
  commands: {
    list: () => Promise<DesktopCommandRecord[]>;
    run: (commandId: string) => Promise<DesktopCommandRunResult>;
  };
  clipboard?: DesktopClipboardBridge;
  downloads: {
    exportJson: (
      filename: string,
      payload: unknown,
    ) => Promise<DesktopDownloadsExportResult>;
    exportPdf?: (
      filename: string,
      html: string,
      options?: PdfExportOptions,
    ) => Promise<DesktopDownloadsExportResult>;
    exportText?: (
      filename: string,
      content: string,
      contentType?: string,
    ) => Promise<DesktopDownloadsExportResult>;
    exportVaultFolder?: (
      folderName: string,
      manifest: unknown,
    ) => Promise<DesktopVaultFolderExportResult>;
    getDirectoryInfo: () => Promise<DesktopDownloadsDirectoryInfo>;
    revealDirectory: () => Promise<void>;
  };
  browserGrants?: {
    getSnapshot: () => Promise<DesktopBrowserGrantsSnapshot>;
    revoke: (grantId: string) => Promise<{
      grantId: string;
      revoked: boolean;
      snapshot: DesktopBrowserGrantsSnapshot;
    }>;
    subscribe: (listener: (snapshot: DesktopBrowserGrantsSnapshot) => void) => () => void;
  };
  browserSecurity?: {
    getSnapshot: () => Promise<DesktopBrowserSecuritySnapshot>;
    setAutomationEnabled: (enabled: boolean) => Promise<DesktopBrowserSecuritySnapshot>;
    subscribe: (listener: (snapshot: DesktopBrowserSecuritySnapshot) => void) => () => void;
  };
  browserStatus?: DesktopBrowserStatusBridge;
  notesMcp?: {
    getServerInfo: () => Promise<DesktopNotesMcpServerInfo>;
    installClient: (clientId: string) => Promise<DesktopMcpClient[]>;
    listClients: () => Promise<DesktopMcpClient[]>;
    removeClient: (clientId: string) => Promise<DesktopMcpClient[]>;
    updatePolicy: (
      policy: Partial<DesktopNotesMcpServerInfo["policy"]>,
    ) => Promise<DesktopNotesMcpServerInfo>;
    onRequest: (
      listener: (request: DesktopNotesMcpRequest) => Promise<unknown> | unknown,
    ) => () => void;
  };
  notesRecovery?: DesktopNotesRecoveryBridge;
  plugins: {
    list: () => Promise<DesktopPluginRecord[]>;
    openDirectory: () => Promise<void>;
    setEnabled: (pluginId: string, enabled: boolean) => Promise<DesktopPluginRecord[]>;
  };
  runtimeState: {
    get: () => Promise<DesktopRuntimeState>;
    importLegacy: (legacyState: AppRuntimeState) => Promise<DesktopRuntimeState>;
    setResumeTarget?: (
      targetType: DesktopResumeTargetType | null,
      targetId: string | null,
    ) => Promise<DesktopRuntimeState>;
    setLastWorkspace: (workspace: AppWorkspaceId) => Promise<DesktopRuntimeState>;
  };
  trainingHistory?: {
    deleteSession: (sessionId: string) => Promise<void>;
    getPlayback: (sessionId: string) => Promise<SessionPlayback | null>;
    listRecent: () => Promise<Array<{ id: string; status: string; title: string }>>;
    savePreparedSession: (input: DesktopPreparedTrainingSessionInput) => Promise<void>;
  };
  system: {
    detectBinary?: (name: string) => Promise<{
      installed: boolean;
      path: string | null;
      version: string | null;
    }>;
    openExternal?: (url: string) => Promise<boolean>;
    openUpgrade: () => Promise<{
      didOpen: boolean;
      targetUrl: string | null;
    }>;
    pickFile?: (options?: { title?: string }) => Promise<string | null>;
  };

  voiceEngine: {
    generate: (
      input: DesktopVoiceEngineGenerateInput,
    ) => Promise<DesktopVoiceEngineGenerateResult>;
    getCapabilities: () => Promise<DesktopVoiceEngineCapabilities>;
    getStatus: () => Promise<DesktopVoiceEngineStatus>;
    start: () => Promise<DesktopVoiceEngineStatus>;
    stop: () => Promise<DesktopVoiceEngineStatus>;
  };
  terminal?: DesktopTerminalBridge;
  updates?: DesktopUpdatesBridge;
  externalMarkdown?: {
    close: (fileId: string) => Promise<boolean>;
    onOpen: (listener: (file: DesktopExternalMarkdownFile) => void) => () => void;
    pick: () => Promise<DesktopExternalMarkdownFile | null>;
    reveal: (fileId: string) => Promise<void>;
    save: (
      fileId: string,
      rawSource: string,
      overwriteExternalChanges?: boolean,
      expectedDiskHash?: string,
    ) => Promise<{ mtime: string }>;
    updateBuffer: (fileId: string, rawSource: string) => Promise<void>;
  };
  vault: {
    copyFile?: (fromPath: string, toPath: string) => Promise<void>;
    createDirectory?: (relativePath: string) => Promise<void>;
    getDirectoryInfo: () => Promise<DesktopVaultDirectoryInfo>;
    listFiles: () => Promise<DesktopVaultFileRecord[]>;
    // 已知（用户此前授权过）的 vault 根。Workspace Rail 的数据源。
    listRoots?: () => Promise<DesktopVaultRoot[]>;
    moveFile?: (fromPath: string, toPath: string) => Promise<void>;
    onDidChange: (listener: () => void) => () => void;
    // 仅可操作已授权的根；移除只取消 Auris 对该根的记忆，不删除磁盘内容。
    removeRoot?: (rootPath: string) => Promise<DesktopVaultRoot[]>;
    pickDirectory: () => Promise<DesktopVaultDirectoryInfo>;
    pickFile?: () => Promise<DesktopVaultFileSelection>;
    readFile: (relativePath: string) => Promise<string | null>;
    renameFile?: (fromPath: string, toPath: string) => Promise<void>;
    removeFile: (relativePath: string) => Promise<void>;
    restoreLastDeleted?: () => Promise<string | null>;
    revealFile?: (relativePath: string) => Promise<void>;
    revealPluginsDirectory: () => Promise<void>;
    // 将整个已授权 Vault 根移入系统回收站，同时取消授权并切换离开活动根。
    trashRoot?: (rootPath: string) => Promise<DesktopVaultRoot[]>;
    saveFile: (relativePath: string, content: string) => Promise<void>;
    // 在已授权的根之间切换，不弹对话框。主进程只接受 listRoots 里的路径——
    // 任意路径会把笔记读写接口变成任意文件读取。新根必须走 pickDirectory。
    setRoot?: (rootPath: string) => Promise<DesktopVaultDirectoryInfo>;
  };
  videoLibrary?: {
    getSnapshot: () => Promise<DesktopVideoLibrarySnapshot>;
    getVideoDetails: (videoId: string) => Promise<DesktopVideoDetails | null>;
    importFiles: () => Promise<DesktopVideoLibrarySnapshot>;
    pickDirectory: () => Promise<DesktopVideoLibrarySnapshot>;
    refresh: () => Promise<DesktopVideoLibrarySnapshot>;
    revealDirectory: () => Promise<void>;
    saveThumbnail: (
      videoId: string,
      thumbnail: DesktopVideoThumbnailInput,
    ) => Promise<DesktopVideoDetails | null>;
    updateSourceMetadata: (
      videoId: string,
      metadata: DesktopVideoMetadataInput,
    ) => Promise<DesktopVideoDetails | null>;
  };
  window: {
    showInFolder: (targetPath: string) => Promise<void>;
  };
};

declare global {
  interface Window {
    shadowingDesktop?: DesktopBridge;
  }
}
