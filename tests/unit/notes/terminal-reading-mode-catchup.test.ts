import { describe, expect, it, vi } from "vitest";

describe("Reading mode exit sizing catch-up policy", () => {
  it("does not trigger fit or resize when container dimensions did not change during reading mode", () => {
    let fitCalled = 0;
    const mockFitSession = vi.fn(() => {
      fitCalled++;
    });

    const entry = {
      container: { clientWidth: 800, clientHeight: 600, isConnected: true },
      lastFittedWidth: 800,
      lastFittedHeight: 600,
    };

    const isDisplayed = true;

    function checkCatchUp(currentWidth: number, currentHeight: number) {
      const sizeChanged =
        entry.lastFittedWidth === undefined ||
        entry.lastFittedWidth !== currentWidth ||
        entry.lastFittedHeight === undefined ||
        entry.lastFittedHeight !== currentHeight;

      if (sizeChanged && currentWidth > 0 && currentHeight > 0 && isDisplayed) {
        mockFitSession();
      }
    }

    // Exiting reading mode with exact same dimensions
    checkCatchUp(entry.container.clientWidth, entry.container.clientHeight);
    expect(mockFitSession).not.toHaveBeenCalled();
    expect(fitCalled).toBe(0);
  });

  it("triggers fit and PTY resize when container dimensions changed during reading mode", () => {
    let fitCalled = 0;
    const mockFitSession = vi.fn(() => {
      fitCalled++;
    });

    const entry = {
      container: { clientWidth: 640, clientHeight: 600, isConnected: true }, // Resized from 800 to 640
      lastFittedWidth: 800,
      lastFittedHeight: 600,
    };

    const isDisplayed = true;

    function checkCatchUp(currentWidth: number, currentHeight: number) {
      const sizeChanged =
        entry.lastFittedWidth === undefined ||
        entry.lastFittedWidth !== currentWidth ||
        entry.lastFittedHeight === undefined ||
        entry.lastFittedHeight !== currentHeight;

      if (sizeChanged && currentWidth > 0 && currentHeight > 0 && isDisplayed) {
        mockFitSession();
      }
    }

    // Exiting reading mode when container shrank from 800px to 640px
    checkCatchUp(entry.container.clientWidth, entry.container.clientHeight);
    expect(mockFitSession).toHaveBeenCalledTimes(1);
    expect(fitCalled).toBe(1);
  });
});
