export type BrowserStatusActivity = "idle" | "mcp" | "workflow";

export type BrowserTabStatus = Readonly<{
  active: boolean;
  activity: BrowserStatusActivity;
  automationMode: "Human" | "AiSandbox" | "AiShared";
  crashMode: "ok" | "auto" | "manual-only";
  leaseHolderKind: "mcp" | "workflow" | null;
  lifecycle: string;
  loading: boolean;
  pendingApprovalCount: number;
  standingGrant: boolean;
  tabId: string;
  title: string;
  url: string;
}>;

export type BrowserWindowStatus = Readonly<{
  active: boolean;
  lastActiveAt: number;
  lifecycle: string;
  tabs: readonly BrowserTabStatus[];
  windowId: string;
}>;

export type BrowserStatusSnapshot = Readonly<{
  appWindows: readonly Readonly<{
    focused: boolean;
    lifecycle: string;
    title: string;
    visible: boolean;
    windowId: string;
  }>[];
  pendingApprovalCount: number;
  revision: number;
  windows: readonly BrowserWindowStatus[];
}>;

export function isBrowserStatusSnapshot(value: unknown): value is BrowserStatusSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BrowserStatusSnapshot>;
  return Number.isSafeInteger(candidate.revision)
    && Array.isArray(candidate.appWindows)
    && Array.isArray(candidate.windows)
    && Number.isSafeInteger(candidate.pendingApprovalCount);
}
