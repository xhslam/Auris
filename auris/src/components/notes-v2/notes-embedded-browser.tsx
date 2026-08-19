"use client";

import { useEffect, useRef } from "react";
import { BrowserApprovalDialog } from "@/components/browser-window/browser-approval-dialog";
import { BrowserTabStrip } from "@/components/browser-window/browser-tab-strip";
import { BrowserToolbar } from "@/components/browser-window/browser-toolbar";
import { getBrowserBridge } from "@/features/browser/browser-bridge";
import { useBrowserWindow } from "@/features/browser/use-browser-window";
import type { NotesReadingThemeId } from "@/features/notes/workbench/notes-reading-theme";
import "@/app/browser/browser.css";
import "./notes-embedded-browser.css";

const DEFAULT_BROWSER_URL = "https://duckduckgo.com/";
const HIDDEN_VIEWPORT = Object.freeze({
  height: 0,
  visible: false,
  width: 0,
  x: 0,
  y: 0,
});

type NotesEmbeddedBrowserProps = {
  layoutVersion: string;
  /** SidePane 关闭动作；新调用方使用。 */
  onClose?: () => void;
  /** 保留旧调用方的语义，避免浏览器独立组件的既有集成失效。 */
  onReturnToNotes?: () => void;
  theme?: NotesReadingThemeId;
};

export function NotesEmbeddedBrowser({
  layoutVersion,
  onClose,
  onReturnToNotes,
  theme = "mint",
}: NotesEmbeddedBrowserProps) {
  const handleClose = onClose ?? onReturnToNotes ?? (() => undefined);
  const model = useBrowserWindow(typeof window === "undefined" ? globalThis : window);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const initialPageRequestedRef = useRef(false);
  const browserWindow = model.window;

  useEffect(() => {
    if (
      model.status !== "ready"
      || !browserWindow
      || browserWindow.tabs.length > 0
      || initialPageRequestedRef.current
    ) return;
    initialPageRequestedRef.current = true;
    const bridge = getBrowserBridge(window);
    void bridge?.createTab({
      automationMode: "Human",
      url: DEFAULT_BROWSER_URL,
    }).catch(() => {
      initialPageRequestedRef.current = false;
    });
  }, [browserWindow, model.status]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const bridge = getBrowserBridge(window);
    if (!viewport || !bridge) return undefined;

    const report = () => {
      const bounds = viewport.getBoundingClientRect();
      void bridge.setViewport({
        height: bounds.height,
        visible: bounds.width > 0 && bounds.height > 0,
        width: bounds.width,
        x: bounds.x,
        y: bounds.y,
      }).catch(() => undefined);
    };
    const observer = new ResizeObserver(report);
    observer.observe(viewport);
    window.addEventListener("resize", report);
    report();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", report);
      void bridge.setViewport(HIDDEN_VIEWPORT).catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    const bridge = getBrowserBridge(window);
    if (!viewport || !bridge) return;
    const bounds = viewport.getBoundingClientRect();
    void bridge.setViewport({
      height: bounds.height,
      visible: bounds.width > 0 && bounds.height > 0,
      width: bounds.width,
      x: bounds.x,
      y: bounds.y,
    }).catch(() => undefined);
  }, [layoutVersion]);

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
    ? "正在准备浏览器"
    : model.activeTab.lifecycle === "creating"
      ? "正在打开页面"
      : model.activeTab.crashMode !== "ok"
        ? "页面已崩溃，请刷新后继续"
        : null;

  return (
    <section
      aria-label="Note 内置浏览器"
      className="browser-window-root notes-v2__embedded-browser"
      data-app-theme={theme}
      data-status={model.status}
    >
      <div className="browser-window-shell" data-chrome={browserWindow ? "ready" : "pending"}>
        <BrowserApprovalDialog host={typeof window === "undefined" ? globalThis : window} />
        <button
          aria-label="收起浏览器"
          className="notes-v2__embedded-browser-back"
          onClick={handleClose}
          title="收起浏览器"
          type="button"
        >
          ←
        </button>
        <BrowserTabStrip
          activeTabId={browserWindow?.activeTabId ?? null}
          onActivate={(tabId) => void model.activateTab(tabId)}
          onClose={(tabId) => {
            if ((browserWindow?.tabs.length ?? 0) <= 1) {
              handleClose();
              return;
            }
            void model.closeTab(tabId);
          }}
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
      <div
        aria-hidden={emptyHint ? undefined : true}
        className="browser-window-stage notes-v2__embedded-browser-viewport"
        data-testid="notes-embedded-browser-viewport"
        ref={viewportRef}
      >
        {emptyHint ? (
          <p className="browser-window-stage__hint">
            Browser · 浏览
            <strong>{emptyHint}</strong>
          </p>
        ) : null}
      </div>
    </section>
  );
}
