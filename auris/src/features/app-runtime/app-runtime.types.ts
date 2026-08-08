export const APP_WORKSPACES = ["home", "workspace", "notes", "assessment"] as const;
export const DESKTOP_AI_DOCK_VIEWS = ["provider", "prompts", "history"] as const;
export const DESKTOP_AI_PROVIDER_IDS = [
  "chatgpt",
  "gemini",
  "google",
  "deepseek",
] as const;

export type AppWorkspaceId = (typeof APP_WORKSPACES)[number];
export type DesktopResumeTargetType = "assessment" | "note" | "training";
export type DesktopAiDockView = (typeof DESKTOP_AI_DOCK_VIEWS)[number];
export type DesktopAiProviderId = (typeof DESKTOP_AI_PROVIDER_IDS)[number];

export type AppRuntimeState = {
  lastVisitedAt: string | null;
  lastWorkspace: AppWorkspaceId;
};

export type DesktopAiDockState = {
  activeProvider: DesktopAiProviderId;
  activeView: DesktopAiDockView;
  isOpen: boolean;
  panelWidth: number;
};

export type DesktopWindowBounds = {
  height: number;
  width: number;
  x?: number;
  y?: number;
};

export type DesktopRuntimeState = AppRuntimeState & {
  aiDock: DesktopAiDockState;
  legacyRuntimeMigratedAt: string | null;
  lastRoute: string;
  primaryResumeId: string | null;
  primaryResumeType: DesktopResumeTargetType | null;
  updatedAt: string | null;
  windowBounds: DesktopWindowBounds | null;
};
