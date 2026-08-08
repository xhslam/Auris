"use client";

import { AurisSettings } from "@/components/settings/auris-settings";
import { DesktopAppFrame } from "@/components/desktop/desktop-app-frame";

export function SettingsShell() {
  return (
    <DesktopAppFrame
      activeNavId="settings"
      activeWorkspace="home"
      subtitle="软件设置"
      title="偏好与服务"
    >
      <AurisSettings />
    </DesktopAppFrame>
  );
}
