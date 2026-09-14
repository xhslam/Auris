import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { devtools } from 'zustand/middleware';

/**
 * Training Settings Types
 */
export type GeneratedVoiceId = 'male' | 'female';
export type SpeechEnginePreference = 'auto_local_first' | 'local_only' | 'cloud_only';
export type VoiceProfileId = string;

export const DEFAULT_VOICE_PROFILE_ID = 'alloy';

export type TrainingSettings = {
  autoSplitImportedText: boolean;
  generatedVoiceId: GeneratedVoiceId;
  ownVoiceRecordingId: string | null;
  privacyMode: boolean;
  repeatCount: number;
  repeatIntervalSec: number;
  speechEnginePreference: SpeechEnginePreference;
  smartNotifications: boolean;
  useOwnVoiceReference: boolean;
  voiceProfileId: VoiceProfileId;
};

export const DEFAULT_TRAINING_SETTINGS: TrainingSettings = {
  autoSplitImportedText: true,
  generatedVoiceId: 'female',
  ownVoiceRecordingId: null,
  privacyMode: false,
  repeatCount: 1,
  repeatIntervalSec: 5,
  speechEnginePreference: 'auto_local_first',
  smartNotifications: false,
  useOwnVoiceReference: false,
  voiceProfileId: DEFAULT_VOICE_PROFILE_ID,
};

/**
 * Training Settings Store
 *
 * Manages user preferences for training sessions
 */
interface TrainingSettingsState {
  settings: TrainingSettings;
  updateSettings: (partial: Partial<TrainingSettings>) => void;
  resetSettings: () => void;
}

export const useTrainingSettingsStore = create<TrainingSettingsState>()(
  devtools(
    persist(
      immer((set) => ({
        settings: DEFAULT_TRAINING_SETTINGS,

        updateSettings: (partial) =>
          set((state) => {
            Object.assign(state.settings, partial);
          }),

        resetSettings: () =>
          set((state) => {
            state.settings = DEFAULT_TRAINING_SETTINGS;
          }),
      })),
      {
        name: 'training-settings',
        storage: createJSONStorage(() => localStorage),
        version: 1,
      }
    ),
    { name: 'TrainingSettings' }
  )
);

/**
 * Workspace UI Store
 *
 * Manages workspace layout and UI state
 */
interface WorkspaceUIState {
  leftPanelWidth: number;
  rightPanelWidth: number;
  isRecorderOpen: boolean;
  activeTab: 'source' | 'wordbook' | 'sentencebook' | 'notes';
  readerFontSize: number;
  readerLineHeight: number;

  setLeftPanelWidth: (width: number) => void;
  setRightPanelWidth: (width: number) => void;
  toggleRecorder: () => void;
  setActiveTab: (tab: WorkspaceUIState['activeTab']) => void;
  setReaderFontSize: (size: number) => void;
  setReaderLineHeight: (height: number) => void;
  resetLayout: () => void;
}

const DEFAULT_WORKSPACE_UI = {
  leftPanelWidth: 400,
  rightPanelWidth: 600,
  isRecorderOpen: false,
  activeTab: 'source' as const,
  readerFontSize: 18,
  readerLineHeight: 1.8,
};

export const useWorkspaceUIStore = create<WorkspaceUIState>()(
  devtools(
    persist(
      immer((set) => ({
        ...DEFAULT_WORKSPACE_UI,

        setLeftPanelWidth: (width) =>
          set((state) => {
            state.leftPanelWidth = Math.max(300, Math.min(800, width));
          }),

        setRightPanelWidth: (width) =>
          set((state) => {
            state.rightPanelWidth = Math.max(400, Math.min(1200, width));
          }),

        toggleRecorder: () =>
          set((state) => {
            state.isRecorderOpen = !state.isRecorderOpen;
          }),

        setActiveTab: (tab) =>
          set((state) => {
            state.activeTab = tab;
          }),

        setReaderFontSize: (size) =>
          set((state) => {
            state.readerFontSize = Math.max(12, Math.min(32, size));
          }),

        setReaderLineHeight: (height) =>
          set((state) => {
            state.readerLineHeight = Math.max(1.2, Math.min(2.5, height));
          }),

        resetLayout: () =>
          set((state) => {
            Object.assign(state, DEFAULT_WORKSPACE_UI);
          }),
      })),
      {
        name: 'workspace-ui',
        storage: createJSONStorage(() => localStorage),
        version: 1,
      }
    ),
    { name: 'WorkspaceUI' }
  )
);

/**
 * Notes UI Store
 *
 * Manages notes workbench layout and state
 */
interface NotesUIState {
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  terminalHeight: number;
  terminalCollapsed: boolean;
  learningPanelWidth: number;
  learningPanelCollapsed: boolean;
  activeView: 'editor' | 'preview' | 'split';

  setSidebarWidth: (width: number) => void;
  toggleSidebar: () => void;
  setTerminalHeight: (height: number) => void;
  toggleTerminal: () => void;
  setLearningPanelWidth: (width: number) => void;
  toggleLearningPanel: () => void;
  setActiveView: (view: NotesUIState['activeView']) => void;
  resetLayout: () => void;
}

const DEFAULT_NOTES_UI = {
  sidebarWidth: 280,
  sidebarCollapsed: false,
  terminalHeight: 300,
  terminalCollapsed: true,
  learningPanelWidth: 320,
  learningPanelCollapsed: true,
  activeView: 'split' as const,
};

export const useNotesUIStore = create<NotesUIState>()(
  devtools(
    persist(
      immer((set) => ({
        ...DEFAULT_NOTES_UI,

        setSidebarWidth: (width) =>
          set((state) => {
            state.sidebarWidth = Math.max(200, Math.min(500, width));
          }),

        toggleSidebar: () =>
          set((state) => {
            state.sidebarCollapsed = !state.sidebarCollapsed;
          }),

        setTerminalHeight: (height) =>
          set((state) => {
            state.terminalHeight = Math.max(200, Math.min(600, height));
          }),

        toggleTerminal: () =>
          set((state) => {
            state.terminalCollapsed = !state.terminalCollapsed;
          }),

        setLearningPanelWidth: (width) =>
          set((state) => {
            state.learningPanelWidth = Math.max(280, Math.min(500, width));
          }),

        toggleLearningPanel: () =>
          set((state) => {
            state.learningPanelCollapsed = !state.learningPanelCollapsed;
          }),

        setActiveView: (view) =>
          set((state) => {
            state.activeView = view;
          }),

        resetLayout: () =>
          set((state) => {
            Object.assign(state, DEFAULT_NOTES_UI);
          }),
      })),
      {
        name: 'notes-ui',
        storage: createJSONStorage(() => localStorage),
        version: 1,
      }
    ),
    { name: 'NotesUI' }
  )
);

/**
 * AI Dock Store
 *
 * Manages AI dock state (desktop only)
 */
interface AIDockState {
  isOpen: boolean;
  panelWidth: number;
  activeProvider: 'chatgpt' | 'gemini' | 'deepseek' | 'google';
  activeView: 'provider' | 'prompts' | 'history';

  setIsOpen: (isOpen: boolean) => void;
  toggle: () => void;
  setPanelWidth: (width: number) => void;
  setActiveProvider: (provider: AIDockState['activeProvider']) => void;
  setActiveView: (view: AIDockState['activeView']) => void;
}

const DEFAULT_AI_DOCK = {
  isOpen: false,
  panelWidth: 560,
  activeProvider: 'chatgpt' as const,
  activeView: 'provider' as const,
};

export const useAIDockStore = create<AIDockState>()(
  devtools(
    persist(
      immer((set) => ({
        ...DEFAULT_AI_DOCK,

        setIsOpen: (isOpen) =>
          set((state) => {
            state.isOpen = isOpen;
          }),

        toggle: () =>
          set((state) => {
            state.isOpen = !state.isOpen;
          }),

        setPanelWidth: (width) =>
          set((state) => {
            state.panelWidth = Math.max(400, Math.min(800, width));
          }),

        setActiveProvider: (provider) =>
          set((state) => {
            state.activeProvider = provider;
          }),

        setActiveView: (view) =>
          set((state) => {
            state.activeView = view;
          }),
      })),
      {
        name: 'ai-dock',
        storage: createJSONStorage(() => localStorage),
        version: 1,
      }
    ),
    { name: 'AIDock' }
  )
);

/**
 * App Preferences Store
 *
 * Global app-level preferences
 */
interface AppPreferencesState {
  theme: 'light' | 'dark' | 'system';
  language: 'en' | 'zh-CN';
  enableAnimations: boolean;
  enableSoundEffects: boolean;
  autoSaveInterval: number; // seconds

  setTheme: (theme: AppPreferencesState['theme']) => void;
  setLanguage: (language: AppPreferencesState['language']) => void;
  setEnableAnimations: (enable: boolean) => void;
  setEnableSoundEffects: (enable: boolean) => void;
  setAutoSaveInterval: (interval: number) => void;
}

const DEFAULT_APP_PREFERENCES = {
  theme: 'system' as const,
  language: 'zh-CN' as const,
  enableAnimations: true,
  enableSoundEffects: true,
  autoSaveInterval: 30,
};

export const useAppPreferencesStore = create<AppPreferencesState>()(
  devtools(
    persist(
      immer((set) => ({
        ...DEFAULT_APP_PREFERENCES,

        setTheme: (theme) =>
          set((state) => {
            state.theme = theme;
          }),

        setLanguage: (language) =>
          set((state) => {
            state.language = language;
          }),

        setEnableAnimations: (enable) =>
          set((state) => {
            state.enableAnimations = enable;
          }),

        setEnableSoundEffects: (enable) =>
          set((state) => {
            state.enableSoundEffects = enable;
          }),

        setAutoSaveInterval: (interval) =>
          set((state) => {
            state.autoSaveInterval = Math.max(10, Math.min(300, interval));
          }),
      })),
      {
        name: 'app-preferences',
        storage: createJSONStorage(() => localStorage),
        version: 1,
      }
    ),
    { name: 'AppPreferences' }
  )
);

/**
 * Selector helpers for performance optimization
 */
export const trainingSettingsSelectors = {
  repeatCount: (state: TrainingSettingsState) => state.settings.repeatCount,
  repeatIntervalSec: (state: TrainingSettingsState) => state.settings.repeatIntervalSec,
  voiceProfileId: (state: TrainingSettingsState) => state.settings.voiceProfileId,
  privacyMode: (state: TrainingSettingsState) => state.settings.privacyMode,
};

export const workspaceUISelectors = {
  leftPanelWidth: (state: WorkspaceUIState) => state.leftPanelWidth,
  rightPanelWidth: (state: WorkspaceUIState) => state.rightPanelWidth,
  activeTab: (state: WorkspaceUIState) => state.activeTab,
  isRecorderOpen: (state: WorkspaceUIState) => state.isRecorderOpen,
};

/**
 * Notes Vault Store
 *
 * Manages notes vault state (documents, backlinks, search)
 */
interface VaultDocument {
  path: string;
  name: string;
  content: string;
  parsed: {
    title: string;
    tags: string[];
    links: string[];
    backlinks: string[];
  };
  modifiedAt: string;
}

interface VaultEntry {
  kind: 'file' | 'directory';
  path: string;
  name: string;
}

interface NotesVaultState {
  documents: VaultDocument[];
  entries: VaultEntry[];
  backlinks: Record<string, string[]>;
  rootPath: string;
  generatedAt: string;
  isRefreshing: boolean;
  searchQuery: string;

  setDocuments: (documents: VaultDocument[]) => void;
  setEntries: (entries: VaultEntry[]) => void;
  setBacklinks: (backlinks: Record<string, string[]>) => void;
  setRootPath: (path: string) => void;
  setSearchQuery: (query: string) => void;
  setIsRefreshing: (isRefreshing: boolean) => void;
  refresh: () => void;
  search: (query: string) => VaultDocument[];
  getDocument: (path: string) => VaultDocument | undefined;
  reset: () => void;
}

const DEFAULT_VAULT_STATE = {
  documents: [],
  entries: [],
  backlinks: {},
  rootPath: '',
  generatedAt: new Date(0).toISOString(),
  isRefreshing: false,
  searchQuery: '',
};

export const useNotesVaultStore = create<NotesVaultState>()(
  devtools(
    immer((set, get) => ({
      ...DEFAULT_VAULT_STATE,

      setDocuments: (documents) =>
        set((state) => {
          state.documents = documents;
          state.generatedAt = new Date().toISOString();
        }),

      setEntries: (entries) =>
        set((state) => {
          state.entries = entries;
        }),

      setBacklinks: (backlinks) =>
        set((state) => {
          state.backlinks = backlinks;
        }),

      setRootPath: (path) =>
        set((state) => {
          state.rootPath = path;
        }),

      setSearchQuery: (query) =>
        set((state) => {
          state.searchQuery = query;
        }),

      setIsRefreshing: (isRefreshing) =>
        set((state) => {
          state.isRefreshing = isRefreshing;
        }),

      refresh: () =>
        set((state) => {
          state.generatedAt = new Date().toISOString();
        }),

      search: (query) => {
        const { documents } = get();
        if (!query.trim()) return documents;

        const lowerQuery = query.toLowerCase();
        return documents.filter(
          (doc) =>
            doc.name.toLowerCase().includes(lowerQuery) ||
            doc.content.toLowerCase().includes(lowerQuery) ||
            doc.parsed.title.toLowerCase().includes(lowerQuery) ||
            doc.parsed.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
        );
      },

      getDocument: (path) => {
        const { documents } = get();
        return documents.find((doc) => doc.path === path);
      },

      reset: () =>
        set((state) => {
          Object.assign(state, DEFAULT_VAULT_STATE);
        }),
    })),
    { name: 'NotesVault' }
  )
);
