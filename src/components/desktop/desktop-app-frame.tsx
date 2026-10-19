"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { DesktopAppSidebar } from "@/components/desktop/desktop-app-sidebar";
import { SharedAuthBackgroundFrame } from "@/components/shell/shared-auth-background-frame";
import { AppUpdateIndicator } from "@/components/updates/app-update-indicator";
import { useAppUpdateChecker } from "@/features/updates/use-app-updates";
import { persistLastWorkspace } from "@/features/app-runtime/app-runtime-storage";
import type { AppWorkspaceId } from "@/features/app-runtime/app-runtime.types";
import { useDesktopRoutePrefetch } from "@/platform/desktop/use-desktop-route-prefetch";
import { useHydratedDesktopBridge } from "@/platform/desktop/use-hydrated-desktop-bridge";
import { useDesktopReviewMcp } from "@/components/desktop/desktop-review-mcp";
import { useAppTheme } from "@/features/appearance/use-app-theme";

type DesktopAppFrameProps = {
  activeNavId?: string;
  activeWorkspace: AppWorkspaceId;
  children: ReactNode;
  persistActiveWorkspace?: boolean;
  subtitle: string;
  title: string;
  windowTitle?: string | null;
  /** Keep the rail visible for focused workspaces such as Nia. */
  sidebarVisible?: boolean;
};

export function DesktopAppFrame({
  activeNavId,
  activeWorkspace,
  children,
  persistActiveWorkspace = true,
  windowTitle = null,
  sidebarVisible = false,
}: DesktopAppFrameProps) {
  const router = useRouter();
  const { desktopBridge, hasHydratedDesktopBridge } = useHydratedDesktopBridge();

  useDesktopReviewMcp(desktopBridge);

  // 全局主题：设置页的单一偏好挂到外壳根上，供所有界面消费。
  const appTheme = useAppTheme();

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

  useEffect(() => {
    document.title = windowTitle?.trim() ? `${windowTitle.trim()} · Auris` : "Auris";
  }, [windowTitle]);

  // 自动更新：状态权威在主进程，这里只订阅 + 按频率触发启动检查。
  // 对齐 vmark 把 useUpdateChecker 挂在主窗口的做法（Electron 只有一个渲染宿主）。
  useAppUpdateChecker();

  return (
    <SharedAuthBackgroundFrame>
      <div
        className="desktop-app-shell"
        data-app-theme={appTheme}
        data-desktop-runtime={desktopBridge ? "true" : "false"}
        data-sidebar-visible={sidebarVisible ? "true" : "false"}
        data-workspace={activeWorkspace}
      >
        <DesktopAppSidebar
          activeNavId={activeNavId}
          activeWorkspace={activeWorkspace}
          isPersistentRail
          isVisible={sidebarVisible}
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
