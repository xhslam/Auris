import { DesktopAppFrame } from "@/components/desktop/desktop-app-frame";
import { NiaWorkspaceSurface } from "@/components/nia/nia-workspace-surface";
import "./nia.css";

export default function NiaPage() {
  return (
    <DesktopAppFrame
      activeNavId="nia"
      activeWorkspace="workspace"
      sidebarVisible
      subtitle="Nia"
      title="Nia"
      windowTitle="Nia"
    >
      <NiaWorkspaceSurface />
    </DesktopAppFrame>
  );
}
