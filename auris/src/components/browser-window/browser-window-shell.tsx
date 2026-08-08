"use client";

import { useEffect, useState } from "react";
import { BrowserTabStrip } from "@/components/browser-window/browser-tab-strip";
import { BrowserToolbar } from "@/components/browser-window/browser-toolbar";
import { BrowserApprovalDialog } from "@/components/browser-window/browser-approval-dialog";
import { BrowserWindowMenu } from "@/components/browser-window/browser-window-menu";
import { NiaPanel } from "@/components/nia/nia-panel";
import { browserThemeBackground } from "@/features/browser/browser-app-theme";
import { getBrowserBridge } from "@/features/browser/browser-bridge";
import { createBrowserReferenceContext } from "@/features/nia/nia-context";
import { useBrowserWindow } from "@/features/browser/use-browser-window";
import {
  DEFAULT_NOTES_READING_THEME,
  NOTES_READING_THEME_EVENT,
  isNotesReadingThemeId,
  loadNotesReadingTheme,
  type NotesReadingThemeId,
} from "@/features/notes/workbench/notes-reading-theme";

export const BROWSER_NIA_PANEL_WIDTH = 360;
export const BROWSER_NIA_RAIL_WIDTH = 40;
export const BROWSER_NIA_OPEN_STORAGE_KEY = "auris.browser.niaOpen";

function loadNiaOpen(): boolean {
  try {
    const raw = window.localStorage.getItem(BROWSER_NIA_OPEN_STORAGE_KEY);
    if (raw === null) return true;
    return raw !== "false";
  } catch {
    return true;
  }
}

function persistNiaOpen(open: boolean) {
  try {
    window.localStorage.setItem(BROWSER_NIA_OPEN_STORAGE_KEY, open ? "true" : "false");
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function BrowserWindowShell() {
  const model = useBrowserWindow(typeof window === "undefined" ? globalThis : window);
  const browserWindow = model.window;
  const [appTheme, setAppTheme] = useState<NotesReadingThemeId>(DEFAULT_NOTES_READING_THEME);
  const [niaOpen, setNiaOpen] = useState(true);

  useEffect(() => {
    setNiaOpen(loadNiaOpen());
  }, []);

  useEffect(() => {
    setAppTheme(loadNotesReadingTheme());
    const onThemeEvent = (event: Event) => {
      const detail = (event as CustomEvent<NotesReadingThemeId>).detail;
      if (isNotesReadingThemeId(detail)) setAppTheme(detail);
    };
    const onStorage = () => setAppTheme(loadNotesReadingTheme());
    window.addEventListener(NOTES_READING_THEME_EVENT, onThemeEvent);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(NOTES_READING_THEME_EVENT, onThemeEvent);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    const bridge = getBrowserBridge(typeof window === "undefined" ? globalThis : window);
    if (!bridge || typeof bridge.setChromeTheme !== "function") return;
    void bridge.setChromeTheme({ backgroundColor: browserThemeBackground(appTheme) }).catch(() => {
      // Older packaged bridges may not expose the command yet.
    });
  }, [appTheme]);

  useEffect(() => {
    const bridge = getBrowserBridge(typeof window === "undefined" ? globalThis : window);
    if (!bridge || typeof bridge.setSideInset !== "function") return;
    const width = niaOpen ? BROWSER_NIA_PANEL_WIDTH : BROWSER_NIA_RAIL_WIDTH;
    void bridge.setSideInset({ width }).catch(() => {
      // Older packaged bridges may not expose the command yet.
    });
  }, [niaOpen]);

  const toggleNia = () => {
    setNiaOpen((current) => {
      const next = !current;
      persistNiaOpen(next);
      return next;
    });
  };

  const createTabWithMode = (mode: "Human" | "AiSandbox" | "AiShared") => {
    if (mode === "AiShared") {
      const confirmed = window.confirm(
        "AI 共用会使用你的人工浏览数据空间。确定新建 AI 共用标签吗？",
      );
      if (!confirmed) return;
      void model.createTab({ automationMode: "AiShared", confirmAiShared: true });
      return;
    }
    void model.createTab({ automationMode: mode });
  };

  const emptyHint = !model.activeTab?.url
    ? "Enter a URL to begin"
    : model.activeTab.lifecycle === "creating"
      ? "Opening page"
      : model.activeTab.crashMode !== "ok"
        ? "Page crashed · Reload to continue"
        : null;

  return (
    <main
      className="browser-window-root"
      data-app-theme={appTheme}
      data-nia-open={niaOpen ? "true" : "false"}
      data-status={model.status}
    >
      <div className="browser-window-shell" data-chrome={browserWindow ? "ready" : "pending"}>
        <BrowserApprovalDialog host={typeof window === "undefined" ? globalThis : window} />
        <BrowserWindowMenu
          currentWindowId={browserWindow?.windowId ?? null}
          onCloseWindow={(windowId) => void model.closeWindow(windowId)}
          onCreateTab={(windowId) => void model.createTabInWindow(windowId)}
          onCreateWindow={() => void model.createWindow()}
          onFocusWindow={(windowId) => void model.focusWindow(windowId)}
          windows={model.windows}
        />
        <BrowserTabStrip
          activeTabId={browserWindow?.activeTabId ?? null}
          onActivate={(tabId) => void model.activateTab(tabId)}
          onClose={(tabId) => void model.closeTab(tabId)}
          onCreate={() => void model.createTab({ automationMode: "Human" })}
          tabs={browserWindow?.tabs ?? []}
        />
        <BrowserToolbar
          address={model.address}
          bookmarked={model.bookmarked}
          crashMode={model.activeTab?.crashMode ?? "ok"}
          lifecycle={model.activeTab?.lifecycle ?? "ready"}
          loading={model.activeTab?.loading ?? false}
          mode={model.activeTab?.automationMode ?? "Human"}
          onAddressChange={model.setAddress}
          onAddressSubmit={(value) => void model.submitAddress(value)}
          onBack={() => void model.goBack()}
          onBookmark={() => void model.toggleBookmark()}
          onCreateTab={createTabWithMode}
          onForward={() => void model.goForward()}
          onReload={() => void model.reload()}
          onStop={() => void model.stop()}
        />
        <p
          className="browser-window-shell__announcement"
          role={model.status === "error" ? "alert" : "status"}
        >
          {model.message}
        </p>
      </div>
      <div aria-hidden={emptyHint ? undefined : true} className="browser-window-stage">
        {emptyHint ? (
          <p className="browser-window-stage__hint">
            Browser · 浏览
            <strong>{emptyHint}</strong>
          </p>
        ) : null}
      </div>
      <aside
        aria-label="Nia side panel"
        className="browser-window-nia"
        data-open={niaOpen ? "true" : "false"}
      >
        <button
          aria-expanded={niaOpen}
          aria-label={niaOpen ? "Close Nia sidebar · 收起助手" : "Open Nia sidebar · 展开助手"}
          className="browser-window-nia__toggle"
          onClick={toggleNia}
          type="button"
        >
          <span>Nia</span>
        </button>
        {niaOpen ? (
          <div className="browser-window-nia__panel">
            <NiaPanel
              browserTarget={browserWindow && model.activeTab ? {
                windowId: browserWindow.windowId,
                tabId: model.activeTab.tabId,
              } : null}
              onRequestContext={(kind) => {
                if (kind !== "browser" || !model.activeTab?.url) return null;
                return createBrowserReferenceContext({
                  title: model.activeTab.title,
                  url: model.activeTab.url,
                });
              }}
              supportedContexts={["browser"]}
            />
          </div>
        ) : null}
      </aside>
    </main>
  );
}
