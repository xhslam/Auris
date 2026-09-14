import {
  DESKTOP_AI_DOCK_COLLAPSED_WIDTH,
  DESKTOP_AI_DOCK_DEFAULT_WIDTH,
  DESKTOP_AI_DOCK_FALLBACK_VIEWPORT_WIDTH,
  DESKTOP_AI_DOCK_MAIN_PANEL_MIN_WIDTH,
  DESKTOP_AI_DOCK_MIN_WIDTH,
  DESKTOP_AI_DOCK_SPLITTER_WIDTH,
  clampDesktopAiDockWidth,
  getDesktopAiDockShellWidth,
} from "@/features/ai-dock/ai-dock-layout";

describe("ai-dock-layout", () => {
  it("uses the slimmer collapsed rail width for the hidden dock state", () => {
    expect(DESKTOP_AI_DOCK_COLLAPSED_WIDTH).toBe(20);
  });

  it("clamps panel width to the configured minimum and maximum bounds", () => {
    expect(clampDesktopAiDockWidth(120, 1280)).toBe(DESKTOP_AI_DOCK_MIN_WIDTH);

    const expectedMaximum =
      1280 -
      DESKTOP_AI_DOCK_MAIN_PANEL_MIN_WIDTH -
      DESKTOP_AI_DOCK_COLLAPSED_WIDTH -
      DESKTOP_AI_DOCK_SPLITTER_WIDTH;

    expect(clampDesktopAiDockWidth(2_000, 1280)).toBe(expectedMaximum);
  });

  it("uses the fallback viewport width when the container is unavailable", () => {
    const expectedMaximum =
      DESKTOP_AI_DOCK_FALLBACK_VIEWPORT_WIDTH -
      DESKTOP_AI_DOCK_MAIN_PANEL_MIN_WIDTH -
      DESKTOP_AI_DOCK_COLLAPSED_WIDTH -
      DESKTOP_AI_DOCK_SPLITTER_WIDTH;

    expect(clampDesktopAiDockWidth(2_000, 0)).toBe(expectedMaximum);
  });

  it("returns a collapsed shell width when the dock is closed", () => {
    expect(getDesktopAiDockShellWidth(false, DESKTOP_AI_DOCK_DEFAULT_WIDTH, 1440)).toBe(
      DESKTOP_AI_DOCK_COLLAPSED_WIDTH,
    );
  });

  it("returns the full shell width when the dock is open", () => {
    expect(getDesktopAiDockShellWidth(true, 560, 1440)).toBe(
      DESKTOP_AI_DOCK_COLLAPSED_WIDTH + DESKTOP_AI_DOCK_SPLITTER_WIDTH + 560,
    );
  });
});
