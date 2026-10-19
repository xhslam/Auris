import { act, fireEvent, render, screen } from "@testing-library/react";
import { useDesktopChromeActivity } from "@/components/desktop/use-desktop-chrome-activity";
import { useAppWindowPreferences } from "@/features/appearance/use-app-window-preferences";
import { saveAppWindowPreferences } from "@/features/appearance/app-window-preferences";

function Chrome() {
  const { hideStatus } = useAppWindowPreferences();
  const active = useDesktopChromeActivity(hideStatus);
  return <output data-testid="chrome" data-active={String(active)} />;
}

describe("desktop chrome activity", () => {
  beforeEach(() => { vi.useFakeTimers(); window.localStorage.clear(); });
  afterEach(() => vi.useRealTimers());

  it("stays visible when disabled and reacts to setting changes immediately", () => {
    render(<Chrome />);
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByTestId("chrome")).toHaveAttribute("data-active", "true");
    act(() => saveAppWindowPreferences({ hideStatus: true, focusDim: 0, titlebarName: false }));
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByTestId("chrome")).toHaveAttribute("data-active", "false");
    act(() => saveAppWindowPreferences({ hideStatus: false, focusDim: 0, titlebarName: false }));
    expect(screen.getByTestId("chrome")).toHaveAttribute("data-active", "true");
  });

  it.each(["pointermove", "mousemove", "pointerdown", "keydown", "focusin", "wheel", "scroll", "focus"])("restores on %s and restarts the full idle delay", (event) => {
    saveAppWindowPreferences({ hideStatus: true, focusDim: 0, titlebarName: false });
    const { unmount } = render(<Chrome />);
    act(() => vi.advanceTimersByTime(2999));
    expect(screen.getByTestId("chrome")).toHaveAttribute("data-active", "true");
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId("chrome")).toHaveAttribute("data-active", "false");
    fireEvent(window, new Event(event));
    expect(screen.getByTestId("chrome")).toHaveAttribute("data-active", "true");
    act(() => vi.advanceTimersByTime(2500));
    fireEvent(window, new Event(event));
    act(() => vi.advanceTimersByTime(2500));
    expect(screen.getByTestId("chrome")).toHaveAttribute("data-active", "true");
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
