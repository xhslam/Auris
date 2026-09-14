export type BrowserChromeCommand =
  | "getSnapshot" | "createTab" | "closeTab" | "activateTab" | "navigate"
  | "goBack" | "goForward" | "reload" | "stop" | "bookmark"
  | "removeBookmark" | "find" | "setZoom" | "resolveApproval"
  | "createWindow" | "focusWindow" | "closeWindow" | "createTabInWindow"
  | "setChromeTheme" | "setSideInset" | "setViewport";

export type BrowserApprovalDecision =
  | "deny"
  | "allow_once"
  | "allow_standing"
  | "attach_once"
  | "attach_until_navigation";

export type BrowserApprovalDescriptor = Readonly<{
  action: string;
  approvalId: string;
  allowedDecisions?: readonly BrowserApprovalDecision[];
  destination?: string;
  expiresAt: number;
  operation: string;
  origin: string;
  tabId: string;
  target?: Readonly<{ kind: "ref"; ref: `target-${string}` }>;
  windowId: string;
}>;

export type BrowserChromeTab = Readonly<{
  active: boolean;
  automationMode: "Human" | "AiSandbox" | "AiShared";
  canGoBack?: boolean;
  canGoForward?: boolean;
  crashMode?: "ok" | "auto" | "manual-only";
  crashStreak?: number;
  lifecycle: "creating" | "ready" | "hibernated" | "crashed";
  loading: boolean;
  navigationGeneration: number;
  tabId: string;
  title: string;
  url: string;
}>;

export type BrowserChromeWindow = Readonly<{
  activeTabId: string | null;
  tabs: readonly BrowserChromeTab[];
  windowId: string;
}>;

export type BrowserChromeSnapshot = Readonly<{
  bookmarks?: readonly Readonly<{ title: string; url: string }>[];
  currentWindowId?: string;
  pendingApprovals?: readonly BrowserApprovalDescriptor[];
  windows: readonly BrowserChromeWindow[];
}>;

export type BrowserNativeBridge = {
  invoke(command: BrowserChromeCommand, payload?: Readonly<Record<string, unknown>>): Promise<unknown>;
  subscribe(listener: (snapshot: BrowserChromeSnapshot) => void): boolean;
  unsubscribe(listener: (snapshot: BrowserChromeSnapshot) => void): boolean;
};

export function createBrowserBridge(native: BrowserNativeBridge) {
  const invoke = (command: BrowserChromeCommand, payload: Readonly<Record<string, unknown>> = {}) =>
    native.invoke(command, payload);
  return Object.freeze({
    activateTab: (payload: { tabId: string }) => invoke("activateTab", payload),
    bookmark: (payload: { tabId?: string } = {}) => invoke("bookmark", payload),
    closeTab: (payload: { tabId: string }) => invoke("closeTab", payload),
    closeWindow: (payload: { windowId: string }) => invoke("closeWindow", payload),
    createTab: (payload: {
      automationMode?: "Human" | "AiSandbox" | "AiShared";
      confirmAiShared?: boolean;
      url?: string;
    } = {}) => invoke("createTab", payload),
    createTabInWindow: (payload: {
      windowId: string;
      automationMode?: "Human" | "AiSandbox" | "AiShared";
      confirmAiShared?: boolean;
      url?: string;
    }) => invoke("createTabInWindow", payload),
    createWindow: (payload: { url?: string } = {}) => invoke("createWindow", payload),
    find: (payload: { tabId?: string; text: string }) => invoke("find", payload),
    focusWindow: (payload: { windowId: string }) => invoke("focusWindow", payload),
    getSnapshot: () => invoke("getSnapshot"),
    goBack: (payload: { tabId?: string } = {}) => invoke("goBack", payload),
    goForward: (payload: { tabId?: string } = {}) => invoke("goForward", payload),
    navigate: (payload: { tabId?: string; url: string }) => invoke("navigate", payload),
    reload: (payload: { tabId?: string } = {}) => invoke("reload", payload),
    resolveApproval: (payload: {
      approvalId: string;
      decision: BrowserApprovalDecision;
    }) => invoke("resolveApproval", payload),
    removeBookmark: (payload: { url: string }) => invoke("removeBookmark", payload),
    setZoom: (payload: { factor: number; tabId?: string }) => invoke("setZoom", payload),
    setChromeTheme: (payload: { backgroundColor: string }) => invoke("setChromeTheme", payload),
    setSideInset: (payload: { width: number }) => invoke("setSideInset", payload),
    setViewport: (payload: {
      height: number;
      visible: boolean;
      width: number;
      x: number;
      y: number;
    }) => invoke("setViewport", payload),
    stop: (payload: { tabId?: string } = {}) => invoke("stop", payload),
    subscribe(listener: (snapshot: BrowserChromeSnapshot) => void) {
      native.subscribe(listener);
      return () => native.unsubscribe(listener);
    },
  });
}

export function getBrowserBridge(host: unknown = globalThis): ReturnType<typeof createBrowserBridge> | null {
  const native = (host as { aurisBrowser?: Partial<BrowserNativeBridge> } | null)?.aurisBrowser;
  if (
    !native || typeof native.invoke !== "function" ||
    typeof native.subscribe !== "function" || typeof native.unsubscribe !== "function"
  ) return null;
  return createBrowserBridge(native as BrowserNativeBridge);
}

declare global {
  interface Window { aurisBrowser?: BrowserNativeBridge }
}
