import { describe, expect, it } from "vitest";
import {
  clampBrowserSidePaneWidth,
  NOTES_BROWSER_SIDEPANE_DEFAULT_WIDTH,
  NOTES_BROWSER_SIDEPANE_MAX_WIDTH,
  NOTES_BROWSER_SIDEPANE_MIN_WIDTH,
} from "@/components/notes-v2/notes-layout-resize";

describe("clampBrowserSidePaneWidth", () => {
  it("keeps the browser chrome usable without allowing the pane below its minimum", () => {
    expect(
      clampBrowserSidePaneWidth(180, 1440),
    ).toBe(NOTES_BROWSER_SIDEPANE_MIN_WIDTH);
    expect(
      clampBrowserSidePaneWidth(NOTES_BROWSER_SIDEPANE_DEFAULT_WIDTH, 1440),
    ).toBe(NOTES_BROWSER_SIDEPANE_DEFAULT_WIDTH);
  });

  it("stops expansion at a reading-friendly maximum while retaining a wide note canvas", () => {
    expect(
      clampBrowserSidePaneWidth(980, 1440),
    ).toBe(NOTES_BROWSER_SIDEPANE_MAX_WIDTH);
  });

  it("uses the current shell width as the final cap when the window becomes narrower", () => {
    expect(clampBrowserSidePaneWidth(980, 900)).toBe(572);
  });
});
