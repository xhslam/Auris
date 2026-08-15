"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { DesktopAppSidebar } from "@/components/desktop/desktop-app-sidebar";
import { SharedAuthBackgroundFrame } from "@/components/shell/shared-auth-background-frame";
import { AppUpdateIndicator } from "@/components/updates/app-update-indicator";
import { useAppUpdateChecker } from "@/features/updates/use-app-updates";
import { persistLastWorkspace } from "@/features/app-runtime/app-runtime-storage";
import type { AppWorkspaceId } from "@/features/app-runtime/app-runtime.types";
import { useDesktopRoutePrefetch } from "@/platform/desktop/use-desktop-route-prefetch";
import { useHydratedDesktopBridge } from "@/platform/desktop/use-hydrated-desktop-bridge";
import {
  DEFAULT_NOTES_READING_THEME,
  NOTES_READING_THEME_EVENT,
  isNotesReadingThemeId,
  loadNotesReadingTheme,
  type NotesReadingThemeId,
} from "@/features/notes/workbench/notes-reading-theme";

type DesktopAppFrameProps = {
  activeNavId?: string;
  activeWorkspace: AppWorkspaceId;
  children: ReactNode;
  persistActiveWorkspace?: boolean;
  subtitle: string;
  title: string;
};

const SIDEBAR_EXPANDED_SESSION_KEY = "auris.desktop.sidebar-expanded";


function readSidebarExpanded(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.sessionStorage.getItem(SIDEBAR_EXPANDED_SESSION_KEY) === "true";
  } catch {
    return false;
  }
}

function writeSidebarExpanded(expanded: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      SIDEBAR_EXPANDED_SESSION_KEY,
      expanded ? "true" : "false",
    );
  } catch {
    // Ignore quota / private-mode failures; in-memory state still works.
  }
}

export function DesktopAppFrame({
  activeNavId,
  activeWorkspace,
  children,
  persistActiveWorkspace = true,
}: DesktopAppFrameProps) {
  const router = useRouter();
  const { desktopBridge, hasHydratedDesktopBridge } = useHydratedDesktopBridge();

  // 全局主题：与笔记共享同一份选择（设置 → 外观）。挂到外壳根上，供所有界面消费。
  const [appTheme, setAppTheme] = useState<NotesReadingThemeId>(
    DEFAULT_NOTES_READING_THEME,
  );
  // 默认收起；用户点开后写入 sessionStorage，换页 remount 时保持展开，不会一点导航就收回。
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(readSidebarExpanded);

  useEffect(() => {
    setAppTheme(loadNotesReadingTheme());

    const onThemeEvent = (event: Event) => {
      const detail = (event as CustomEvent<NotesReadingThemeId>).detail;
      if (isNotesReadingThemeId(detail)) {
        setAppTheme(detail);
      }
    };
    const onStorage = () => {
      setAppTheme(loadNotesReadingTheme());
    };

    window.addEventListener(NOTES_READING_THEME_EVENT, onThemeEvent);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(NOTES_READING_THEME_EVENT, onThemeEvent);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useDesktopRoutePrefetch({
    router,
  });

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !persistActiveWorkspace ||
      !hasHydratedDesktopBridge
    ) {
      return;
    }

    void persistLastWorkspace(desktopBridge, window.localStorage, activeWorkspace);
  }, [
    activeWorkspace,
    desktopBridge,
    hasHydratedDesktopBridge,
    persistActiveWorkspace,
  ]);

  const handleToggleSidebarExpanded = useCallback(() => {
    setIsSidebarExpanded((previous) => {
      const next = !previous;
      writeSidebarExpanded(next);
      return next;
    });
  }, []);

  // 自动更新：状态权威在主进程，这里只订阅 + 按频率触发启动检查。
  // 对齐 vmark 把 useUpdateChecker 挂在主窗口的做法（Electron 只有一个渲染宿主）。
  useAppUpdateChecker();

  return (
    <SharedAuthBackgroundFrame>
      <div
        className="desktop-app-shell"
        data-app-theme={appTheme}
        data-desktop-runtime={desktopBridge ? "true" : "false"}
        data-sidebar-expanded={isSidebarExpanded ? "true" : "false"}
        data-sidebar-visible="false"
        data-workspace={activeWorkspace}
      >
        <DesktopAppSidebar
          activeNavId={activeNavId}
          activeWorkspace={activeWorkspace}
          isExpanded={isSidebarExpanded}
          isPersistentRail
          isVisible={false}
          onToggleExpanded={handleToggleSidebarExpanded}
        />

        <div className="desktop-app-frame">
          <div className="desktop-app-frame__viewport">
            <div className="desktop-app-frame__layout">
              <div className="desktop-app-frame__main">{children}</div>
              <AppUpdateIndicator />
            </div>
          </div>
        </div>
      </div>
    </SharedAuthBackgroundFrame>
  );
}
