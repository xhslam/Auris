import { DesktopAppFrame } from "@/components/desktop/desktop-app-frame";
import { ReadingScreen } from "@/components/reading/reading-screen";

export default function ReadingPage() {
  return (
    <DesktopAppFrame
      activeNavId="reading"
      activeWorkspace="workspace"
      subtitle="Reading"
      title="Reading"
    >
      <ReadingScreen />
    </DesktopAppFrame>
  );
}
