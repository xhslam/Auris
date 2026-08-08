import type {
  AppRuntimeState,
  DesktopAiDockState,
  DesktopAiDockView,
  DesktopAiProviderId,
  AppWorkspaceId,
  DesktopResumeTargetType,
  DesktopRuntimeState,
  DesktopWindowBounds,
} from "@/features/app-runtime/app-runtime.types";
import type { DesktopBridge } from "@/platform/desktop/desktop-bridge";

export const APP_RUNTIME_STORAGE_KEY = "shadowing:desktop:app-runtime";

export const DEFAULT_APP_RUNTIME_STATE: AppRuntimeState = {
  lastVisitedAt: null,
  lastWorkspace: "home",
};

export const DEFAULT_DESKTOP_AI_DOCK_STATE: DesktopAiDockState = {
  activeProvider: "chatgpt",
  activeView: "provider",
  isOpen: false,
  panelWidth: 560,
};

export const DEFAULT_DESKTOP_RUNTIME_STATE: DesktopRuntimeState = {
  aiDock: DEFAULT_DESKTOP_AI_DOCK_STATE,
  legacyRuntimeMigratedAt: null,
  lastRoute: "/",
  lastVisitedAt: null,
  lastWorkspace: "home",
  primaryResumeId: null,
  primaryResumeType: null,
  updatedAt: null,
  windowBounds: null,
};

const WORKSPACE_PATHS: Record<AppWorkspaceId, string> = {
  assessment: "/assessment",
  home: "/",
  notes: "/notes",
  workspace: "/notes",
};

const WORKSPACE_LABELS: Record<AppWorkspaceId, string> = {
  assessment: "Readiness Review",
  home: "Dashboard",
  notes: "Notes",
  workspace: "Notes",
};

function isAppWorkspaceId(value: unknown): value is AppWorkspaceId {
  return value === "home" || value === "workspace" || value === "notes" || value === "assessment";
}

function normalizeWindowBounds(value: unknown): DesktopWindowBounds | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<DesktopWindowBounds>;

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

function normalizeResumeTargetType(value: unknown): DesktopResumeTargetType | null {
  return value === "training" || value === "assessment" || value === "note" ? value : null;
}

function normalizeAiDockView(value: unknown): DesktopAiDockView {
  return value === "provider" || value === "prompts" || value === "history"
    ? value
    : DEFAULT_DESKTOP_AI_DOCK_STATE.activeView;
}

function normalizeAiProviderId(value: unknown): DesktopAiProviderId {
  return value === "chatgpt" ||
    value === "gemini" ||
    value === "google" ||
    value === "deepseek"
    ? value
    : DEFAULT_DESKTOP_AI_DOCK_STATE.activeProvider;
}

function normalizeAiDockState(value: unknown): DesktopAiDockState {
  if (!value || typeof value !== "object") {
    return DEFAULT_DESKTOP_AI_DOCK_STATE;
  }

  const candidate = value as Partial<DesktopAiDockState>;

  return {
    activeProvider: normalizeAiProviderId(candidate.activeProvider),
    activeView: normalizeAiDockView(candidate.activeView),
    isOpen:
      typeof candidate.isOpen === "boolean"
        ? candidate.isOpen
        : DEFAULT_DESKTOP_AI_DOCK_STATE.isOpen,
    panelWidth:
      typeof candidate.panelWidth === "number" && candidate.panelWidth > 0
        ? Math.round(candidate.panelWidth)
        : DEFAULT_DESKTOP_AI_DOCK_STATE.panelWidth,
  };
}

function normalizeRuntimeState(value: unknown): AppRuntimeState {
  if (!value || typeof value !== "object") {
    return DEFAULT_APP_RUNTIME_STATE;
  }

  const candidate = value as Partial<AppRuntimeState>;

  return {
    lastVisitedAt:
      typeof candidate.lastVisitedAt === "string" && candidate.lastVisitedAt.trim()
        ? candidate.lastVisitedAt
        : null,
    lastWorkspace: isAppWorkspaceId(candidate.lastWorkspace)
      ? candidate.lastWorkspace
      : DEFAULT_APP_RUNTIME_STATE.lastWorkspace,
  };
}

export function normalizeDesktopRuntimeState(value: unknown): DesktopRuntimeState {
  if (!value || typeof value !== "object") {
    return DEFAULT_DESKTOP_RUNTIME_STATE;
  }

  const candidate = value as Partial<DesktopRuntimeState>;

  return {
    aiDock: normalizeAiDockState(candidate.aiDock),
    legacyRuntimeMigratedAt:
      typeof candidate.legacyRuntimeMigratedAt === "string" &&
      candidate.legacyRuntimeMigratedAt.trim()
        ? candidate.legacyRuntimeMigratedAt
        : null,
    lastRoute:
      typeof candidate.lastRoute === "string" && candidate.lastRoute.startsWith("/")
        ? candidate.lastRoute
        : DEFAULT_DESKTOP_RUNTIME_STATE.lastRoute,
    lastVisitedAt:
      typeof candidate.lastVisitedAt === "string" && candidate.lastVisitedAt.trim()
        ? candidate.lastVisitedAt
        : null,
    lastWorkspace: isAppWorkspaceId(candidate.lastWorkspace)
      ? candidate.lastWorkspace
      : DEFAULT_DESKTOP_RUNTIME_STATE.lastWorkspace,
    primaryResumeId:
      typeof candidate.primaryResumeId === "string" && candidate.primaryResumeId.trim()
        ? candidate.primaryResumeId
        : null,
    primaryResumeType: normalizeResumeTargetType(candidate.primaryResumeType),
    updatedAt:
      typeof candidate.updatedAt === "string" && candidate.updatedAt.trim()
        ? candidate.updatedAt
        : null,
    windowBounds: normalizeWindowBounds(candidate.windowBounds),
  };
}

export function getWorkspaceHref(workspace: AppWorkspaceId) {
  return WORKSPACE_PATHS[workspace];
}

export function getWorkspaceLabel(workspace: AppWorkspaceId) {
  return WORKSPACE_LABELS[workspace];
}

export function getResumeLabel(workspace: AppWorkspaceId) {
  if (workspace === "home") {
    return "Dashboard";
  }

  return `Resume ${WORKSPACE_LABELS[workspace]}`;
}

export function buildWorkspaceResumeHref(
  workspace: AppWorkspaceId,
  targetType: DesktopResumeTargetType | null,
  targetId: string | null,
) {
  const baseHref = getWorkspaceHref(workspace);

  if (!targetType || !targetId) {
    return baseHref;
  }

  const params = new URLSearchParams();

  if (targetType === "training" && workspace === "workspace") {
    params.set("resumeSessionId", targetId);
  } else if (targetType === "assessment" && workspace === "assessment") {
    params.set("resumeAssessmentId", targetId);
  } else if (targetType === "note" && workspace === "notes") {
    params.set("resumeNoteId", targetId);
  } else {
    return baseHref;
  }

  return `${baseHref}?${params.toString()}`;
}

export function readAppRuntimeState(storage: Storage | null | undefined) {
  if (!storage) {
    return DEFAULT_APP_RUNTIME_STATE;
  }

  const rawValue = storage.getItem(APP_RUNTIME_STORAGE_KEY);

  if (!rawValue) {
    return DEFAULT_APP_RUNTIME_STATE;
  }

  try {
    return normalizeRuntimeState(JSON.parse(rawValue));
  } catch {
    return DEFAULT_APP_RUNTIME_STATE;
  }
}

export function writeAppRuntimeState(
  storage: Storage | null | undefined,
  nextState: AppRuntimeState,
) {
  const normalized = normalizeRuntimeState(nextState);

  if (!storage) {
    return normalized;
  }

  storage.setItem(APP_RUNTIME_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function writeLastWorkspace(
  storage: Storage | null | undefined,
  workspace: AppWorkspaceId,
) {
  return writeAppRuntimeState(storage, {
    ...readAppRuntimeState(storage),
    lastVisitedAt: new Date().toISOString(),
    lastWorkspace: workspace,
  });
}

export function createDesktopRuntimeStateFromLegacy(storage: Storage | null | undefined) {
  const legacyState = readAppRuntimeState(storage);

  return {
    ...DEFAULT_DESKTOP_RUNTIME_STATE,
    ...legacyState,
  } satisfies DesktopRuntimeState;
}

function hasMeaningfulLegacyState(legacyState: AppRuntimeState) {
  return legacyState.lastWorkspace !== "home" || legacyState.lastVisitedAt !== null;
}

export async function readDesktopRuntimeState(
  bridge: DesktopBridge | null,
  storage: Storage | null | undefined,
) {
  if (!bridge) {
    return createDesktopRuntimeStateFromLegacy(storage);
  }

  return normalizeDesktopRuntimeState(await bridge.runtimeState.get());
}

export async function hydrateDesktopRuntimeState(
  bridge: DesktopBridge | null,
  storage: Storage | null | undefined,
) {
  if (!bridge) {
    return createDesktopRuntimeStateFromLegacy(storage);
  }

  const desktopState = normalizeDesktopRuntimeState(await bridge.runtimeState.get());
  const legacyState = readAppRuntimeState(storage);

  if (!desktopState.legacyRuntimeMigratedAt && hasMeaningfulLegacyState(legacyState)) {
    return normalizeDesktopRuntimeState(await bridge.runtimeState.importLegacy(legacyState));
  }

  return desktopState;
}

export async function persistLastWorkspace(
  bridge: DesktopBridge | null,
  storage: Storage | null | undefined,
  workspace: AppWorkspaceId,
) {
  if (!bridge) {
    return {
      ...DEFAULT_DESKTOP_RUNTIME_STATE,
      ...writeLastWorkspace(storage, workspace),
    } satisfies DesktopRuntimeState;
  }

  return normalizeDesktopRuntimeState(await bridge.runtimeState.setLastWorkspace(workspace));
}

export async function persistResumeTarget(
  bridge: DesktopBridge | null,
  _storage: Storage | null | undefined,
  targetType: DesktopResumeTargetType | null,
  targetId: string | null,
) {
  if (!bridge?.runtimeState.setResumeTarget) {
    return createDefaultResumeStatePatch(targetType, targetId);
  }

  return normalizeDesktopRuntimeState(
    await bridge.runtimeState.setResumeTarget(targetType, targetId),
  );
}

function createDefaultResumeStatePatch(
  targetType: DesktopResumeTargetType | null,
  targetId: string | null,
) {
  return normalizeDesktopRuntimeState({
    ...DEFAULT_DESKTOP_RUNTIME_STATE,
    primaryResumeId: targetId,
    primaryResumeType: targetType,
  });
}
