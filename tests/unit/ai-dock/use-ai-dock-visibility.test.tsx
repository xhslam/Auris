import { act, fireEvent, render, screen } from "@testing-library/react";
import { useAiDockVisibility } from "@/features/ai-dock/use-ai-dock-visibility";

type VisibilityHarnessProps = {
  isOpen?: boolean;
};

function VisibilityHarness({ isOpen = false }: VisibilityHarnessProps) {
  const visibility = useAiDockVisibility({
    isOpen,
  });

  return (
    <div>
      <button
        data-testid="reveal"
        onMouseEnter={visibility.revealDock}
        onMouseLeave={visibility.scheduleHideDock}
        type="button"
      >
        Reveal
      </button>
      <div
        data-testid="dock"
        data-visible={visibility.isDockVisible ? "true" : "false"}
        onBlurCapture={visibility.handleDockBlurCapture}
        onFocusCapture={visibility.handleDockFocusCapture}
        tabIndex={-1}
      >
        Dock
      </div>
      <button data-testid="outside" type="button">
        Outside
      </button>
    </div>
  );
}

describe("useAiDockVisibility", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1280,
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reveals immediately and hides again after the close delay while the dock is closed", () => {
    render(<VisibilityHarness />);

    const revealButton = screen.getByTestId("reveal");
    const dock = screen.getByTestId("dock");

    expect(dock).toHaveAttribute("data-visible", "false");

    fireEvent.mouseEnter(revealButton);

    expect(dock).toHaveAttribute("data-visible", "true");

    fireEvent.mouseLeave(revealButton);

    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(dock).toHaveAttribute("data-visible", "true");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(dock).toHaveAttribute("data-visible", "false");
  });

  it("keeps the dock visible while it is open", () => {
    render(<VisibilityHarness isOpen />);

    const revealButton = screen.getByTestId("reveal");
    const dock = screen.getByTestId("dock");

    expect(dock).toHaveAttribute("data-visible", "true");

    fireEvent.mouseEnter(revealButton);
    fireEvent.mouseLeave(revealButton);
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(dock).toHaveAttribute("data-visible", "true");
  });

  it("reveals from global mouse movement at the right edge", () => {
    render(<VisibilityHarness />);

    const dock = screen.getByTestId("dock");

    expect(dock).toHaveAttribute("data-visible", "false");

    fireEvent.mouseMove(window, { clientX: 1_270 });

    expect(dock).toHaveAttribute("data-visible", "true");
  });
});
