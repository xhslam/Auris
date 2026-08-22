"use client";

import { useCallback, useEffect, useRef } from "react";
import { BrowserApprovalDialog } from "@/components/browser-window/browser-approval-dialog";
import { BrowserTabStrip } from "@/components/browser-window/browser-tab-strip";
import { BrowserToolbar } from "@/components/browser-window/browser-toolbar";
import { getBrowserBridge } from "@/features/browser/browser-bridge";
import { useBrowserWindow } from "@/features/browser/use-browser-window";
import type { AppThemeId } from "@/features/appearance/app-theme";
import "@/app/browser/browser.css";
import "./notes-embedded-browser.css";

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
  theme?: AppThemeId;
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
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const initialPageRequestedRef = useRef(false);
  const browserWindow = model.window;
  const activeTab = model.activeTab;
  const isEmptyWorkspace = !activeTab?.url;
  const isErrorWorkspace = !isEmptyWorkspace && activeTab.lifecycle === "crashed";
  const isNativePageVisible = !isEmptyWorkspace && !isErrorWorkspace;

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
        visible: isNativePageVisible && bounds.width > 0 && bounds.height > 0,
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
  }, [isNativePageVisible]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const bridge = getBrowserBridge(window);
    if (!viewport || !bridge) return;
    const bounds = viewport.getBoundingClientRect();
    void bridge.setViewport({
      height: bounds.height,
      visible: isNativePageVisible && bounds.width > 0 && bounds.height > 0,
      width: bounds.width,
      x: bounds.x,
      y: bounds.y,
    }).catch(() => undefined);
  }, [isNativePageVisible, layoutVersion]);

  const focusAddressInput = useCallback(() => {
    window.requestAnimationFrame(() => addressInputRef.current?.focus());
  }, []);

  const createEmptyTab = () => {
    void model.createTab({ automationMode: "Human" });
    focusAddressInput();
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


  return (
    <section
      aria-label="Note 内置浏览器"
      className="browser-window-root notes-v2__embedded-browser"
      data-app-theme={theme}
      data-status={model.status}
    >
      <div className="browser-window-shell" data-chrome={browserWindow ? "ready" : "pending"}>
        <BrowserApprovalDialog host={typeof window === "undefined" ? globalThis : window} />
        <BrowserTabStrip
          activeTabId={browserWindow?.activeTabId ?? null}
          leadingAction={(
            <button
              aria-label="收起浏览器"
              className="notes-v2__embedded-browser-back"
              onClick={handleClose}
              title="收起 Web Workspace"
              type="button"
            >
              ←
            </button>
          )}
          onActivate={(tabId) => void model.activateTab(tabId)}
          onClose={(tabId) => {
            if ((browserWindow?.tabs.length ?? 0) <= 1) {
              handleClose();
              return;
            }
            void model.closeTab(tabId);
          }}
          onCreate={createEmptyTab}
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
          addressInputRef={addressInputRef}
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
        aria-hidden={isNativePageVisible || undefined}
        className="browser-window-stage notes-v2__embedded-browser-viewport"
        data-state={isErrorWorkspace ? "error" : isEmptyWorkspace ? "empty" : "page"}
        data-testid="notes-embedded-browser-viewport"
        ref={viewportRef}
      >
        {isEmptyWorkspace ? (
          <div className="notes-v2__web-workspace-state" role="status">
            <span aria-hidden="true" className="notes-v2__web-workspace-state-mark">Web</span>
            <h2>在这里打开网页</h2>
            <p>输入网址或搜索你想查找的内容</p>
          </div>
        ) : null}
        {isErrorWorkspace ? (
          <div className="notes-v2__web-workspace-state" role="alert">
            <span aria-hidden="true" className="notes-v2__web-workspace-state-mark">Web</span>
            <h2>无法打开此网页</h2>
            <p>检查网址或网络连接</p>
            <button
              className="notes-v2__web-workspace-state-action"
              onClick={() => void model.reload()}
              type="button"
            >
              重新加载
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
