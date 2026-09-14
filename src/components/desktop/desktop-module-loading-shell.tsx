"use client";

import { DesktopAppFrame } from "@/components/desktop/desktop-app-frame";
import type { AppWorkspaceId } from "@/features/app-runtime/app-runtime.types";

type DesktopModuleLoadingShellProps = {
  activeNavId?: string;
  activeWorkspace: AppWorkspaceId;
  detail?: string;
  message: string;
  subtitle: string;
  title: string;
};

export function DesktopModuleLoadingShell({
  activeNavId,
  activeWorkspace,
  detail = "正在准备桌面模块内容...",
  message,
  subtitle,
  title,
}: DesktopModuleLoadingShellProps) {
  return (
    <DesktopAppFrame
      activeNavId={activeNavId}
      activeWorkspace={activeWorkspace}
      subtitle={subtitle}
      title={title}
    >
      <main className="desktop-collection-shell">
        <section className="desktop-page-panel">
          <div className="desktop-page-panel__heading">
            <h2>{message}</h2>
            <p>{detail}</p>
          </div>
        </section>
      </main>
    </DesktopAppFrame>
  );
}
