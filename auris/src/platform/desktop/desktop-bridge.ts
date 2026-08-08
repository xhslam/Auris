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

export type DesktopCommandRecord = {
  id: string;
  title: string;
};

export type DesktopCommandRunResult = {
  executed: boolean;
};

export type DesktopClipboardBridge = {
  readText?: () => Promise<string>;
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
};

export type DesktopMcpClientStatus =
  | "connected"
  | "not-installed"
  | "outdated"
  | "unreadable";

export type DesktopMcpClient = {
  configPath: string;
  detail: string;
  format: "json" | "toml";
  id: string;
  label: string;
  status: DesktopMcpClientStatus;
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
};

export type DesktopTerminalSessionRecord = {
  backend: "pipe" | "pty";
  cols?: number;
  cwd: string | null;
  id: string;
  rows?: number;
  shell: string;
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

export type DesktopVaultFileRecord = {
  absolutePath: string;
  fileName: string;
  isDirectory?: boolean;
  relativePath: string;
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
  nia?: {
    invoke: (
      command:
        | "start"
        | "cancel"
        | "getRun"
        | "listProviders"
        | "discoverModels"
        | "testConnection",
      payload?: Readonly<Record<string, unknown>>,
    ) => Promise<unknown>;
    subscribe: (listener: (event: unknown) => void) => boolean;
    unsubscribe: (listener: (event: unknown) => void) => boolean;
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
  vault: {
    createDirectory?: (relativePath: string) => Promise<void>;
    getDirectoryInfo: () => Promise<DesktopVaultDirectoryInfo>;
    listFiles: () => Promise<DesktopVaultFileRecord[]>;
    moveFile?: (fromPath: string, toPath: string) => Promise<void>;
    onDidChange: (listener: () => void) => () => void;
    pickDirectory: () => Promise<DesktopVaultDirectoryInfo>;
    pickFile?: () => Promise<DesktopVaultFileSelection>;
    readFile: (relativePath: string) => Promise<string | null>;
    renameFile?: (fromPath: string, toPath: string) => Promise<void>;
    removeFile: (relativePath: string) => Promise<void>;
    revealPluginsDirectory: () => Promise<void>;
    saveFile: (relativePath: string, content: string) => Promise<void>;
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
