import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotesEmbeddedBrowser } from "@/components/notes-v2/notes-embedded-browser";
import type {
  BrowserChromeSnapshot,
  BrowserNativeBridge,
} from "@/features/browser/browser-bridge";

class TestResizeObserver {
  static instances: TestResizeObserver[] = [];
  readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    TestResizeObserver.instances.push(this);
  }

  disconnect = vi.fn();
  observe = vi.fn();
  unobserve = vi.fn();

  emit() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

describe("NotesEmbeddedBrowser", () => {
  beforeEach(() => {
    TestResizeObserver.instances = [];
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
  });

  afterEach(() => {
    delete window.aurisBrowser;
    vi.unstubAllGlobals();
  });

  it("creates the default-on human page and reports the Note viewport to Electron", async () => {
    const fixture = installBridge(emptySnapshot());
    const onReturnToNotes = vi.fn();
    const view = render(
      <NotesEmbeddedBrowser layoutVersion="base" onReturnToNotes={onReturnToNotes} />,
    );
    const viewport = await screen.findByTestId("notes-embedded-browser-viewport");
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({
      bottom: 620,
      height: 500,
      left: 210,
      right: 1010,
      toJSON: () => ({}),
      top: 120,
      width: 800,
      x: 210,
      y: 120,
    });

    act(() => TestResizeObserver.instances.at(-1)?.emit());

    await waitFor(() => {
      expect(fixture.invoke).toHaveBeenCalledWith("createTab", {
        automationMode: "Human",
        url: "https://duckduckgo.com/",
      });
      expect(fixture.invoke).toHaveBeenCalledWith("setViewport", {
        height: 500,
        visible: true,
        width: 800,
        x: 210,
        y: 120,
      });
    });

    view.unmount();
    expect(fixture.invoke).toHaveBeenLastCalledWith("setViewport", {
      height: 0,
      visible: false,
      width: 0,
      x: 0,
      y: 0,
    });
  });

  it("keeps the last native page alive when its close button returns to the note", async () => {
    const user = userEvent.setup();
    const fixture = installBridge(snapshot());
    const onReturnToNotes = vi.fn();
    render(<NotesEmbeddedBrowser layoutVersion="base" onReturnToNotes={onReturnToNotes} />);

    await user.click(await screen.findByRole("button", { name: "关闭 Auris 文档" }));

    expect(onReturnToNotes).toHaveBeenCalledOnce();
    expect(fixture.invoke).not.toHaveBeenCalledWith("closeTab", expect.anything());
  });
});

function emptySnapshot(): BrowserChromeSnapshot {
  return {
    currentWindowId: "browser-window-embedded",
    windows: [{
      activeTabId: null,
      tabs: [],
      windowId: "browser-window-embedded",
    }],
  };
}

function snapshot(): BrowserChromeSnapshot {
  return {
    currentWindowId: "browser-window-embedded",
    windows: [{
      activeTabId: "browser-tab-1",
      tabs: [{
        active: true,
        automationMode: "Human",
        lifecycle: "ready",
        loading: false,
        navigationGeneration: 1,
        tabId: "browser-tab-1",
        title: "Auris 文档",
        url: "https://example.com/docs",
      }],
      windowId: "browser-window-embedded",
    }],
  };
}

function installBridge(initial: BrowserChromeSnapshot) {
  const listeners = new Set<(value: BrowserChromeSnapshot) => void>();
  const invoke = vi.fn((command: string, payload?: unknown) => {
    void payload;
    return command === "getSnapshot" ? Promise.resolve(initial) : Promise.resolve(true);
  });
  const native: BrowserNativeBridge = {
    invoke: (command, payload) => invoke(command, payload),
    subscribe(listener) {
      listeners.add(listener);
      return true;
    },
    unsubscribe(listener) {
      return listeners.delete(listener);
    },
  };
  window.aurisBrowser = native;
  return { invoke };
}
