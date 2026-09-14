import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import {
  clampDesktopAiDockWidth,
  getDesktopAiDockShellWidth,
} from "@/features/ai-dock/ai-dock-layout";
import { useAiDockLayoutSync } from "@/features/ai-dock/use-ai-dock-layout-sync";

function createAiDockBridge() {
  return {
    syncLayout: vi.fn(async (layout) => layout),
  };
}

type LayoutHarnessProps = {
  bridge: ReturnType<typeof createAiDockBridge>;
  isDockVisible?: boolean;
};

function LayoutHarness({ bridge, isDockVisible = true }: LayoutHarnessProps) {
  const [dockState, setDockState] = useState({
    activeProvider: "chatgpt" as const,
    activeView: "provider" as const,
    isOpen: true,
    panelWidth: 560,
  });
  const {
    handleResizeByStep,
    providerHostRef,
    reservedLayoutWidth,
    shellWidth,
    surfaceRef,
  } = useAiDockLayoutSync({
    aiDockBridge: bridge,
    dockState,
    isDockVisible,
    onPanelWidthChange: (panelWidth) =>
      setDockState((current) => ({
        ...current,
        panelWidth,
      })),
  });

  return (
    <div>
      <div ref={surfaceRef} />
      <div ref={providerHostRef} />
      <div
        data-testid="state"
        data-reserved-width={reservedLayoutWidth}
        data-shell-width={shellWidth}
      />
      <button
        data-testid="grow"
        onClick={() => handleResizeByStep(2_000)}
        type="button"
      >
        Grow
      </button>
      <button
        data-testid="shrink"
        onClick={() => handleResizeByStep(-2_000)}
        type="button"
      >
        Shrink
      </button>
    </div>
  );
}

describe("useAiDockLayoutSync", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1280,
      writable: true,
    });
  });

  it("reports the reserved shell width when the dock is open", async () => {
    const bridge = createAiDockBridge();
    render(<LayoutHarness bridge={bridge} />);

    await waitFor(() => {
      expect(bridge.syncLayout).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByTestId("state")).toHaveAttribute(
      "data-shell-width",
      String(getDesktopAiDockShellWidth(true, 560, window.innerWidth)),
    );
    expect(screen.getByTestId("state")).toHaveAttribute(
      "data-reserved-width",
      String(getDesktopAiDockShellWidth(true, 560, window.innerWidth)),
    );
  });

  it("clamps width changes before syncing them back to the desktop bridge", async () => {
    const bridge = createAiDockBridge();
    render(<LayoutHarness bridge={bridge} />);

    fireEvent.click(screen.getByTestId("grow"));

    await waitFor(() => {
      expect(bridge.syncLayout).toHaveBeenLastCalledWith(
        expect.objectContaining({
          panelWidth: clampDesktopAiDockWidth(2_560, window.innerWidth),
        }),
      );
      expect(screen.getByTestId("state")).toHaveAttribute(
        "data-shell-width",
        String(
          getDesktopAiDockShellWidth(
            true,
            clampDesktopAiDockWidth(2_560, window.innerWidth),
            window.innerWidth,
          ),
        ),
      );
    });
  });
});
