"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  canonicalizeBrowserUrl,
} from "@/features/browser/url-policy";
import {
  getBrowserBridge,
  type BrowserChromeSnapshot,
  type BrowserChromeTab,
  type BrowserChromeWindow,
} from "@/features/browser/browser-bridge";

type BrowserWindowStatus = "connecting" | "ready" | "error";

export type BrowserWindowModel = {
  activeTab: BrowserChromeTab | null;
  address: string;
  bookmarked: boolean;
  message: string;
  setAddress(value: string): void;
  status: BrowserWindowStatus;
  window: BrowserChromeWindow | null;
  windows: readonly BrowserChromeWindow[];
  activateTab(tabId: string): Promise<void>;
  closeTab(tabId: string): Promise<void>;
  createTab(payload?: {
    automationMode?: "Human" | "AiSandbox" | "AiShared";
    confirmAiShared?: boolean;
    url?: string;
  }): Promise<void>;
  createTabInWindow(windowId: string): Promise<void>;
  createWindow(): Promise<void>;
  closeWindow(windowId: string): Promise<void>;
  focusWindow(windowId: string): Promise<void>;
  goBack(): Promise<void>;
  goForward(): Promise<void>;
  reload(): Promise<void>;
  stop(): Promise<void>;
  submitAddress(value: string): Promise<void>;
  toggleBookmark(): Promise<void>;
};

const HOSTNAME_LIKE = /^(?:localhost|(?:\[[0-9a-f:]+\])|[^\s/.]+(?:\.[^\s/.]+)+)(?::\d+)?(?:[/?#].*)?$/iu;
const EXPLICIT_SCHEME = /^[a-z][a-z\d+.-]*:/iu;

/** Convert human omnibox text to an http(s) intent. This never performs navigation. */
export function resolveOmniboxInput(input: string): string | null {
  const value = input.trim();
  if (value === "") return null;

  const direct = canonicalizeBrowserUrl(value);
  if (direct !== null) return direct;

  if (EXPLICIT_SCHEME.test(value)) return null;
  if (HOSTNAME_LIKE.test(value)) {
    return canonicalizeBrowserUrl(`https://${value}`);
  }

  const query = new URLSearchParams({ q: value });
  return canonicalizeBrowserUrl(`https://www.google.com/search?${query.toString()}`);
}

export function useBrowserWindow(host: unknown = globalThis): BrowserWindowModel {
  const [status, setStatus] = useState<BrowserWindowStatus>("connecting");
  const [message, setMessage] = useState("正在连接浏览器");
  const [currentWindow, setCurrentWindow] = useState<BrowserChromeWindow | null>(null);
  const [windows, setWindows] = useState<readonly BrowserChromeWindow[]>([]);
  const [address, setAddress] = useState("");
  const [bookmarks, setBookmarks] = useState<BrowserChromeSnapshot["bookmarks"]>([]);
  const bridgeRef = useRef<ReturnType<typeof getBrowserBridge>>(null);
  const ownerIdRef = useRef<string | null>(null);
  const navigationRef = useRef("");

  const applySnapshot = useCallback((candidate: unknown) => {
    if (!isBrowserChromeSnapshot(candidate)) {
      setStatus("error");
      setMessage("无法读取浏览器状态");
      return;
    }

    const ownerId = candidate.currentWindowId ?? ownerIdRef.current;
    const projected = ownerId
      ? candidate.windows.find((entry) => entry.windowId === ownerId) ?? null
      : candidate.windows.length === 1
        ? candidate.windows[0]!
        : null;

    if (projected === null) {
      setCurrentWindow(null);
      setWindows(candidate.windows);
      setStatus("error");
      setMessage(
        candidate.windows.length === 0
          ? "浏览器窗口已关闭"
          : "无法确认当前浏览器窗口",
      );
      return;
    }

    ownerIdRef.current = projected.windowId;
    setWindows(candidate.windows);
    setCurrentWindow(projected);
    setBookmarks(candidate.bookmarks ?? []);
    const active = projected.tabs.find((tab) => tab.tabId === projected.activeTabId) ?? null;
    const navigationKey = active
      ? `${active.tabId}:${active.navigationGeneration}:${active.url}`
      : "";
    if (navigationKey !== navigationRef.current) {
      navigationRef.current = navigationKey;
      setAddress(active?.url ?? "");
    }
    setStatus("ready");
    if (active?.lifecycle === "crashed") {
      setMessage(
        active.crashMode === "manual-only"
          ? "页面已崩溃，请手动刷新"
          : "页面已崩溃，正在尝试恢复",
      );
    } else if (active?.lifecycle === "hibernated") {
      setMessage("标签页已休眠");
    } else {
      setMessage(active?.loading ? "正在载入页面" : "页面已就绪");
    }
  }, []);

  useEffect(() => {
    const bridge = getBrowserBridge(host);
    bridgeRef.current = bridge;
    if (bridge === null) {
      setStatus("error");
      setMessage("浏览器桥接不可用");
      return undefined;
    }

    const unsubscribe = bridge.subscribe(applySnapshot);
    void bridge.getSnapshot().then(applySnapshot).catch(() => {
      setStatus("error");
      setMessage("无法读取浏览器状态");
    });
    return () => {
      unsubscribe();
      bridgeRef.current = null;
    };
  }, [applySnapshot, host]);

  const activeTab = useMemo(
    () => currentWindow?.tabs.find((tab) => tab.tabId === currentWindow.activeTabId) ?? null,
    [currentWindow],
  );
  const bookmarked = Boolean(
    activeTab?.url && bookmarks?.some((bookmark) => bookmark.url === activeTab.url),
  );

  const run = useCallback(async (
    action: (bridge: NonNullable<typeof bridgeRef.current>) => Promise<unknown>,
  ) => {
    const bridge = bridgeRef.current;
    if (bridge === null) {
      setStatus("error");
      setMessage("浏览器桥接不可用");
      return;
    }
    try {
      await action(bridge);
    } catch {
      setStatus("error");
      setMessage("浏览器操作失败");
    }
  }, []);

  const activePayload = activeTab ? { tabId: activeTab.tabId } : {};

  return {
    activeTab,
    address,
    bookmarked,
    message,
    setAddress,
    status,
    window: currentWindow,
    windows,
    activateTab: (tabId) => run((bridge) => bridge.activateTab({ tabId })),
    closeTab: (tabId) => run((bridge) => bridge.closeTab({ tabId })),
    createTab: (payload = {}) => run((bridge) => bridge.createTab(payload)),
    createTabInWindow: (windowId) => run((bridge) => bridge.createTabInWindow({ windowId })),
    createWindow: () => run((bridge) => bridge.createWindow()),
    closeWindow: (windowId) => run((bridge) => bridge.closeWindow({ windowId })),
    focusWindow: (windowId) => run((bridge) => bridge.focusWindow({ windowId })),
    goBack: () => run((bridge) => bridge.goBack(activePayload)),
    goForward: () => run((bridge) => bridge.goForward(activePayload)),
    reload: () => run((bridge) => bridge.reload(activePayload)),
    stop: () => run((bridge) => bridge.stop(activePayload)),
    submitAddress: async (value) => {
      const url = resolveOmniboxInput(value);
      if (url === null) {
        setStatus("error");
        setMessage("请输入有效的网址或搜索内容");
        return;
      }
      setAddress(url);
      await run((bridge) => bridge.navigate({ ...activePayload, url }));
    },
    toggleBookmark: () => {
      if (!activeTab?.url) return Promise.resolve();
      return bookmarked
        ? run((bridge) => bridge.removeBookmark({ url: activeTab.url }))
        : run((bridge) => bridge.bookmark(activePayload));
    },
  };
}

function isBrowserChromeSnapshot(value: unknown): value is BrowserChromeSnapshot {
  if (!isRecord(value) || !Array.isArray(value.windows)) return false;
  if (value.currentWindowId !== undefined && typeof value.currentWindowId !== "string") {
    return false;
  }
  return value.windows.every((entry) =>
    isRecord(entry)
    && typeof entry.windowId === "string"
    && (entry.activeTabId === null || typeof entry.activeTabId === "string")
    && Array.isArray(entry.tabs)
    && entry.tabs.every(isBrowserChromeTab));
}

function isBrowserChromeTab(value: unknown): value is BrowserChromeTab {
  return isRecord(value)
    && typeof value.active === "boolean"
    && ["Human", "AiSandbox", "AiShared"].includes(String(value.automationMode))
    && ["creating", "ready", "hibernated", "crashed"].includes(String(value.lifecycle))
    && typeof value.loading === "boolean"
    && Number.isSafeInteger(value.navigationGeneration)
    && typeof value.tabId === "string"
    && typeof value.title === "string"
    && typeof value.url === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
