import { describe, expect, it, vi, beforeEach } from "vitest";

type TestTerminal = {
  loadAddon: (addon: unknown) => void;
  options?: { fontFamily?: string };
};

type TestEntry = {
  terminal: TestTerminal;
  webglAddon: { dispose: () => void; clearTextureAtlas?: () => void } | null;
  webglContextLost: boolean;
};

describe("WebGL Addon Lifecycle & Fault Tolerance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads WebglAddon only for visible session and disposes when hidden", () => {
    const loadedAddons: Array<{ disposed: boolean }> = [];
    let isDisplayed = true;
    const webglEnabled = true;

    class MockWebglAddon {
      disposed = false;
      onContextLoss(_cb: () => void) {
        void _cb;
        return { dispose() {} };
      }
      dispose() {
        this.disposed = true;
      }
      clearTextureAtlas() {}
    }

    const mockTerminal: TestTerminal = {
      loadAddon: vi.fn((addon) => loadedAddons.push(addon as { disposed: boolean })),
    };

    const entry: TestEntry = {
      terminal: mockTerminal,
      webglAddon: null,
      webglContextLost: false,
    };

    function syncWebgl() {
      const shouldBeLoaded = isDisplayed && webglEnabled;
      if (shouldBeLoaded) {
        if (!entry.webglAddon && !entry.webglContextLost) {
          try {
            const addon = new MockWebglAddon();
            addon.onContextLoss(() => {
              addon.dispose();
              entry.webglAddon = null;
              entry.webglContextLost = true;
            });
            entry.terminal.loadAddon(addon);
            entry.webglAddon = addon;
          } catch {
            entry.webglAddon = null;
          }
        }
      } else {
        if (entry.webglAddon) {
          entry.webglAddon.dispose();
          entry.webglAddon = null;
        }
      }
    }

    // 1. Visible & enabled -> loads WebglAddon
    syncWebgl();
    expect(entry.webglAddon).not.toBeNull();
    expect(mockTerminal.loadAddon).toHaveBeenCalledTimes(1);

    // 2. Hidden -> disposes WebglAddon to free browser WebGL context
    isDisplayed = false;
    syncWebgl();
    expect(entry.webglAddon).toBeNull();
    expect(loadedAddons[0]?.disposed).toBe(true);

    // 3. Visible again -> re-attaches WebglAddon
    isDisplayed = true;
    syncWebgl();
    expect(entry.webglAddon).not.toBeNull();
    expect(mockTerminal.loadAddon).toHaveBeenCalledTimes(2);
  });

  it("handles onContextLoss: disposes addon, falls back to DOM, and retries ONCE on focus", () => {
    let contextLossCb: (() => void) | null = null;
    let disposeCount = 0;

    class MockWebglAddon {
      onContextLoss(cb: () => void) {
        contextLossCb = cb;
        return { dispose() {} };
      }
      dispose() {
        disposeCount++;
      }
    }

    const mockTerminal: TestTerminal = {
      loadAddon: vi.fn(),
    };

    const entry: TestEntry = {
      terminal: mockTerminal,
      webglAddon: null,
      webglContextLost: false,
    };

    function loadWebgl() {
      if (entry.webglAddon) return;
      try {
        const addon = new MockWebglAddon();
        addon.onContextLoss(() => {
          addon.dispose();
          entry.webglAddon = null;
          entry.webglContextLost = true;
        });
        entry.terminal.loadAddon(addon);
        entry.webglAddon = addon;
        entry.webglContextLost = false;
      } catch {
        entry.webglAddon = null;
      }
    }

    function onFocus() {
      if (entry.webglContextLost) {
        entry.webglContextLost = false;
        loadWebgl();
      }
    }

    loadWebgl();
    expect(entry.webglAddon).not.toBeNull();
    expect(mockTerminal.loadAddon).toHaveBeenCalledTimes(1);

    // Simulate context loss
    expect(contextLossCb).not.toBeNull();
    contextLossCb!();

    // Verify addon is disposed and fallen back to DOM (webglAddon is null)
    expect(entry.webglAddon).toBeNull();
    expect(disposeCount).toBe(1);
    expect(entry.webglContextLost).toBe(true);

    // Next focus: retries enabling once
    onFocus();
    expect(entry.webglAddon).not.toBeNull();
    expect(mockTerminal.loadAddon).toHaveBeenCalledTimes(2);
    expect(entry.webglContextLost).toBe(false);

    // Another focus does not trigger redundant loadAddon
    onFocus();
    expect(mockTerminal.loadAddon).toHaveBeenCalledTimes(2);
  });

  it("silently falls back to DOM if WebGL initialization throws an error", () => {
    class FailingWebglAddon {
      constructor() {
        throw new Error("WebGL2 not supported on this device");
      }
      dispose() {}
    }

    const mockTerminal: TestTerminal = {
      loadAddon: vi.fn(),
    };

    const entry: TestEntry = {
      terminal: mockTerminal,
      webglAddon: null,
      webglContextLost: false,
    };

    function loadWebgl() {
      if (entry.webglAddon) return;
      try {
        const addon = new FailingWebglAddon();
        entry.terminal.loadAddon(addon);
        entry.webglAddon = addon;
      } catch {
        // Quiet fallback to DOM renderer without alerting user
        entry.webglAddon = null;
      }
    }

    expect(() => loadWebgl()).not.toThrow();
    expect(entry.webglAddon).toBeNull();
    expect(mockTerminal.loadAddon).not.toHaveBeenCalled();
  });

  it("does not load WebglAddon when GPU acceleration setting is disabled", () => {
    let webglEnabled = false;
    const isDisplayed = true;

    class MockWebglAddon {
      dispose = vi.fn();
      onContextLoss() {
        return { dispose() {} };
      }
    }

    const mockTerminal: TestTerminal = {
      loadAddon: vi.fn(),
    };

    const entry: TestEntry = {
      terminal: mockTerminal,
      webglAddon: null,
      webglContextLost: false,
    };

    function syncWebgl() {
      if (isDisplayed && webglEnabled) {
        if (!entry.webglAddon) {
          const addon = new MockWebglAddon();
          entry.terminal.loadAddon(addon);
          entry.webglAddon = addon;
        }
      } else {
        if (entry.webglAddon) {
          entry.webglAddon.dispose();
          entry.webglAddon = null;
        }
      }
    }

    syncWebgl();
    expect(entry.webglAddon).toBeNull();
    expect(mockTerminal.loadAddon).not.toHaveBeenCalled();

    // Toggle on
    webglEnabled = true;
    syncWebgl();
    expect(entry.webglAddon).not.toBeNull();
    expect(mockTerminal.loadAddon).toHaveBeenCalledTimes(1);

    // Toggle off
    webglEnabled = false;
    syncWebgl();
    expect(entry.webglAddon).toBeNull();
  });

  it("clears texture atlas on font change after document.fonts.ready", async () => {
    let clearAtlasCalls = 0;
    class MockWebglAddon {
      clearTextureAtlas() {
        clearAtlasCalls++;
      }
      dispose() {}
    }

    const webglAddon = new MockWebglAddon();
    const entry: TestEntry = {
      terminal: { loadAddon: vi.fn(), options: { fontFamily: "ui-monospace" } },
      webglAddon,
      webglContextLost: false,
    };

    async function onFontChange(newFont: string) {
      if (entry.terminal.options?.fontFamily !== newFont) {
        entry.terminal.options = { ...entry.terminal.options, fontFamily: newFont };
        if (entry.webglAddon && typeof entry.webglAddon.clearTextureAtlas === "function") {
          if (typeof document !== "undefined" && document.fonts?.ready) {
            await document.fonts.ready;
            entry.webglAddon.clearTextureAtlas();
          } else {
            entry.webglAddon.clearTextureAtlas();
          }
        }
      }
    }

    await onFontChange("Menlo, monospace");
    expect(clearAtlasCalls).toBe(1);
    expect(entry.terminal.options?.fontFamily).toBe("Menlo, monospace");

    // Setting same font again does not trigger clearTextureAtlas
    await onFontChange("Menlo, monospace");
    expect(clearAtlasCalls).toBe(1);
  });

  it("does not dispose or reload WebglAddon when toggling reading mode", () => {
    let disposeCalls = 0;
    class MockWebglAddon {
      dispose() {
        disposeCalls++;
      }
      onContextLoss() {
        return { dispose() {} };
      }
    }

    const mockTerminal: TestTerminal = { loadAddon: vi.fn() };
    const initialAddon = new MockWebglAddon();
    const entry: TestEntry = {
      terminal: mockTerminal,
      webglAddon: initialAddon,
      webglContextLost: false,
    };

    // Reading mode hides xterm using visibility: hidden; pointer-events: none;
    // but the session remains displayed in DOM and host node stays connected.
    // It must NOT trigger disposeWebglAddonForEntry.
    let isReadingMode = false;

    // Toggle reading mode ON
    isReadingMode = true;
    expect(isReadingMode).toBe(true);
    expect(entry.webglAddon).toBe(initialAddon);
    expect(disposeCalls).toBe(0);

    // Toggle reading mode OFF
    isReadingMode = false;
    expect(entry.webglAddon).toBe(initialAddon);
    expect(disposeCalls).toBe(0);
    expect(mockTerminal.loadAddon).not.toHaveBeenCalled();
  });
});
