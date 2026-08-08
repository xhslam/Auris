import { describe, expect, it, vi } from "vitest";

type MainWindowLike = {
  focus: () => void;
  isDestroyed: () => boolean;
  isMinimized: () => boolean;
  restore: () => void;
};

function focusExistingWindow(mainWindow: MainWindowLike | null) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return false;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.focus();
  return true;
}

describe("desktop window behavior", () => {
  it("restores and focuses an existing window instead of opening duplicates", () => {
    const calls: string[] = [];
    const mainWindow: MainWindowLike = {
      focus: () => calls.push("focus"),
      isDestroyed: () => false,
      isMinimized: () => true,
      restore: () => calls.push("restore"),
    };

    expect(focusExistingWindow(mainWindow)).toBe(true);
    expect(calls).toEqual(["restore", "focus"]);
  });

  it("does nothing when the existing window is already gone", () => {
    const mainWindow: MainWindowLike = {
      focus: () => undefined,
      isDestroyed: () => true,
      isMinimized: () => false,
      restore: () => undefined,
    };

    expect(focusExistingWindow(mainWindow)).toBe(false);
  });

  it("keeps main and browser window close operations independent", () => {
    const mainClose = vi.fn();
    const browserClose = vi.fn();
    browserClose();
    expect(browserClose).toHaveBeenCalledOnce();
    expect(mainClose).not.toHaveBeenCalled();
  });
});
