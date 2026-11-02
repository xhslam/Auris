import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AurisSettings } from "@/components/settings/auris-settings";
import {
  loadTerminalLineHeight,
  loadTerminalWebglEnabled,
  TERMINAL_LINE_HEIGHT_STORAGE,
  TERMINAL_WEBGL_STORAGE,
} from "@/components/notes-v2/terminal/notes-terminal-options";

describe("AurisSettings terminal preferences", () => {
  beforeEach(() => {
    window.localStorage.removeItem(TERMINAL_LINE_HEIGHT_STORAGE);
    window.localStorage.removeItem(TERMINAL_WEBGL_STORAGE);
  });

  it("persists GPU acceleration toggle and line height controls", async () => {
    render(<AurisSettings />);

    // Click "终端" category in settings sidebar
    fireEvent.click(screen.getByRole("button", { name: "终端" }));

    // Find "GPU 加速" toggle
    const gpuToggle = screen.getByRole("switch", { name: "GPU 加速" });
    expect(gpuToggle).toBeInTheDocument();
    expect(gpuToggle).toHaveAttribute("aria-checked", "true");

    // Toggle off
    fireEvent.click(gpuToggle);
    await waitFor(() => {
      expect(loadTerminalWebglEnabled()).toBe(false);
    });

    // Find "行距" select button (default 1.4（默认）)
    const lineHeightSelect = screen.getByRole("button", { name: /行距：1\.4（默认）/ });
    expect(lineHeightSelect).toBeInTheDocument();

    // Cycle to next (1.5)
    fireEvent.click(lineHeightSelect);
    await waitFor(() => {
      expect(loadTerminalLineHeight()).toBe(1.5);
    });
  });
});
