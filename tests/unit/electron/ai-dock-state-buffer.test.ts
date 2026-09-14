import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  createAiDockStateBuffer,
  DEFAULT_AI_DOCK_STATE_BUFFER_DELAY_MS,
} = require("../../../electron/ai-dock-state-buffer.cjs");

describe("ai-dock-state-buffer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not persist transient drag updates immediately", () => {
    const onCommit = vi.fn();
    const buffer = createAiDockStateBuffer({ onCommit });

    buffer.schedule({
      activeProvider: "chatgpt",
      activeView: "provider",
      isOpen: true,
      panelWidth: 640,
    });

    expect(onCommit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(DEFAULT_AI_DOCK_STATE_BUFFER_DELAY_MS - 1);

    expect(onCommit).not.toHaveBeenCalled();
  });

  it("coalesces rapid drag updates and persists only the latest state", () => {
    const onCommit = vi.fn();
    const buffer = createAiDockStateBuffer({ onCommit });

    buffer.schedule({
      activeProvider: "chatgpt",
      activeView: "provider",
      isOpen: true,
      panelWidth: 620,
    });
    buffer.schedule({
      activeProvider: "chatgpt",
      activeView: "provider",
      isOpen: true,
      panelWidth: 660,
    });

    vi.advanceTimersByTime(DEFAULT_AI_DOCK_STATE_BUFFER_DELAY_MS);

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith({
      activeProvider: "chatgpt",
      activeView: "provider",
      isOpen: true,
      panelWidth: 660,
    });
  });

  it("flushes any pending drag state before an immediate commit", () => {
    const onCommit = vi.fn((state) => state);
    const buffer = createAiDockStateBuffer({ onCommit });

    buffer.schedule({
      activeProvider: "chatgpt",
      activeView: "provider",
      isOpen: true,
      panelWidth: 700,
    });

    const result = buffer.commit({
      activeProvider: "gemini",
      activeView: "provider",
      isOpen: true,
      panelWidth: 700,
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith({
      activeProvider: "gemini",
      activeView: "provider",
      isOpen: true,
      panelWidth: 700,
    });
    expect(result).toEqual({
      activeProvider: "gemini",
      activeView: "provider",
      isOpen: true,
      panelWidth: 700,
    });

    vi.advanceTimersByTime(DEFAULT_AI_DOCK_STATE_BUFFER_DELAY_MS);

    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
