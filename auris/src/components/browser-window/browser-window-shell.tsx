"use client";

import { useEffect, useState } from "react";
import { BrowserTabStrip } from "@/components/browser-window/browser-tab-strip";
import { BrowserToolbar } from "@/components/browser-window/browser-toolbar";
import { BrowserApprovalDialog } from "@/components/browser-window/browser-approval-dialog";
import { BrowserWindowMenu } from "@/components/browser-window/browser-window-menu";
import { browserThemeBackground } from "@/features/browser/browser-app-theme";
import { getBrowserBridge } from "@/features/browser/browser-bridge";
import { createBrowserReferenceContext } from "@/features/nia/nia-context";
import { getNiaStandaloneBridge } from "@/features/nia/nia-standalone-bridge";
import { useBrowserWindow } from "@/features/browser/use-browser-window";
import {
  DEFAULT_NOTES_READING_THEME,
  NOTES_READING_THEME_EVENT,
  isNotesReadingThemeId,
  loadNotesReadingTheme,
  type NotesReadingThemeId,
} from "@/features/notes/workbench/notes-reading-theme";

export function BrowserWindowShell() {
  const model = useBrowserWindow(typeof window === "undefined" ? globalThis : window);
  const browserWindow = model.window;
  const [appTheme, setAppTheme] = useState<NotesReadingThemeId>(DEFAULT_NOTES_READING_THEME);
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
    void bridge.setSideInset({ width: 0 }).catch(() => {
      // Older packaged bridges may not expose the command yet.
    });
  }, []);

  const handOffCurrentPageToNia = () => {
    const bridge = getNiaStandaloneBridge(typeof window === "undefined" ? globalThis : window);
    if (!bridge || !browserWindow || !model.activeTab?.url) return;
    void bridge.open({
      browserTarget: { windowId: browserWindow.windowId, tabId: model.activeTab.tabId },
      context: createBrowserReferenceContext({
        title: model.activeTab.title,
        url: model.activeTab.url,
      }),
      origin: "browser",
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
          canGoBack={model.canGoBack}
          canGoForward={model.canGoForward}
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
      <button
        aria-label="Ask Nia about this page · 把当前页交给 Nia"
        className="browser-window-assist"
        disabled={!browserWindow || !model.activeTab?.url}
        onClick={handOffCurrentPageToNia}
        type="button"
      >
        Ask Nia · 交给 Nia
      </button>
    </main>
  );
}
