import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserWindowShell } from "@/components/browser-window/browser-window-shell";
import type {
  BrowserChromeSnapshot,
  BrowserNativeBridge,
} from "@/features/browser/browser-bridge";

describe("BrowserWindowShell", () => {
  afterEach(() => {
    delete window.aurisBrowser;
    delete window.shadowingDesktop;
    window.localStorage.clear();
  });

  it("renders the sender-owned snapshot and issues tab intents", async () => {
    const user = userEvent.setup();
    const fixture = installBridge(snapshot());
    render(<BrowserWindowShell />);

    expect(await screen.findByRole("tab", { name: "Auris 文档" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "学习资料" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(document.querySelector('.browser-status-pill[data-mode="Human"]')).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "学习资料" }));
    await user.click(screen.getByRole("button", { name: "关闭 学习资料" }));
    await user.click(screen.getByRole("button", { name: "新建标签页" }));

    expect(fixture.invoke).toHaveBeenCalledWith("activateTab", { tabId: "browser-tab-2" });
    expect(fixture.invoke).toHaveBeenCalledWith("closeTab", { tabId: "browser-tab-2" });
    expect(fixture.invoke).toHaveBeenCalledWith("createTab", { automationMode: "Human" });
  });

  it("submits safe omnibox navigation and exposes load controls", async () => {
    const user = userEvent.setup();
    const fixture = installBridge(snapshot());
    render(<BrowserWindowShell />);

    const input = await screen.findByRole("textbox", { name: "地址或搜索" });
    await user.clear(input);
    await user.type(input, "example.org/guide{Enter}");
    expect(fixture.invoke).toHaveBeenCalledWith("navigate", {
      tabId: "browser-tab-1",
      url: "https://example.org/guide",
    });
    expect(screen.getByRole("button", { name: "重新加载" })).toBeInTheDocument();

    act(() => fixture.emit(snapshot({ loading: true })));
    expect(screen.getByRole("button", { name: "停止加载" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "停止加载" }));
    expect(fixture.invoke).toHaveBeenCalledWith("stop", { tabId: "browser-tab-1" });
  });

  it("adds and removes the exact active URL bookmark", async () => {
    const user = userEvent.setup();
    const fixture = installBridge(snapshot());
    render(<BrowserWindowShell />);

    await user.click(await screen.findByRole("button", { name: "收藏当前页面" }));
    expect(fixture.invoke).toHaveBeenCalledWith("bookmark", { tabId: "browser-tab-1" });

    act(() => fixture.emit(snapshot({ bookmarked: true })));
    await user.click(screen.getByRole("button", { name: "取消收藏当前页面" }));
    expect(fixture.invoke).toHaveBeenCalledWith("removeBookmark", {
      url: "https://example.com/docs",
    });
  });

  it("supports roving tab focus and announces loading state", async () => {
    const user = userEvent.setup();
    installBridge(snapshot({ loading: true }));
    render(<BrowserWindowShell />);

    const first = await screen.findByRole("tab", { name: "Auris 文档" });
    const second = screen.getByRole("tab", { name: "学习资料" });
    first.focus();
    await user.keyboard("{ArrowRight}");
    expect(second).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("正在载入页面");
  });

  it("shows connecting, bridge-unavailable, and bridge-error states", async () => {
    let resolveSnapshot: ((value: BrowserChromeSnapshot) => void) | undefined;
    window.aurisBrowser = nativeBridge(
      vi.fn((command) => command === "getSnapshot"
        ? new Promise((resolve) => { resolveSnapshot = resolve; })
        : Promise.resolve(true)),
    );
    const first = render(<BrowserWindowShell />);
    expect(screen.getByRole("status")).toHaveTextContent("正在连接浏览器");
    first.unmount();
    resolveSnapshot?.(snapshot());

    delete window.aurisBrowser;
    const unavailable = render(<BrowserWindowShell />);
    expect(await screen.findByRole("alert")).toHaveTextContent("浏览器桥接不可用");
    unavailable.unmount();

    window.aurisBrowser = nativeBridge(vi.fn().mockRejectedValue(new Error("offline")));
    render(<BrowserWindowShell />);
    expect(await screen.findByRole("alert")).toHaveTextContent("无法读取浏览器状态");
  });

  it("refuses to guess a window when a multi-window snapshot lacks owner identity", async () => {
    const ambiguous = snapshot();
    installBridge({ windows: [...ambiguous.windows, {
      activeTabId: null,
      tabs: [],
      windowId: "browser-window-2",
    }] });
    render(<BrowserWindowShell />);
    expect(await screen.findByRole("alert")).toHaveTextContent("无法确认当前浏览器窗口");
  });

  it("mounts the real approval surface and releases both subscriptions on unmount", async () => {
    const fixture = installBridge({
      ...snapshot(),
      pendingApprovals: [{
        action: "navigate",
        approvalId: "approval-shell",
        expiresAt: Date.now() + 10_000,
        operation: "navigate",
        origin: "https://example.com",
        tabId: "browser-tab-1",
        windowId: "browser-window-1",
      }],
    });
    const view = render(<BrowserWindowShell />);
    expect(await screen.findByRole("dialog", { name: "浏览器操作确认" })).toBeInTheDocument();
    view.unmount();
    expect(fixture.unsubscribe).toHaveBeenCalledTimes(2);
  });

  it("hands the active page to the independent Nia window and releases the browser inset", async () => {
    const user = userEvent.setup();
    const fixture = installBridge(snapshot());
    const open = vi.fn().mockResolvedValue(true);
    const subscribeLaunch = vi.fn(() => () => undefined);
    Object.defineProperty(window, "shadowingDesktop", {
      configurable: true,
      value: { niaStandalone: { open, subscribeLaunch } },
    });
    render(<BrowserWindowShell />);
    await waitFor(() => expect(fixture.invoke).toHaveBeenCalledWith("setSideInset", { width: 0 }));
    expect(screen.queryByLabelText("Nia side panel")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ask Nia about this page · 把当前页交给 Nia" }));
    expect(open).toHaveBeenCalledWith({
      browserTarget: { tabId: "browser-tab-1", windowId: "browser-window-1" },
      context: {
        kind: "browser_reference",
        provenance: "explicit_browser_reference",
        title: "Auris 文档",
        url: "https://example.com/docs",
      },
      origin: "browser",
    });
  });
});

function snapshot({ bookmarked = false, loading = false } = {}): BrowserChromeSnapshot {
  return {
    bookmarks: bookmarked
      ? [{ title: "Auris 文档", url: "https://example.com/docs" }]
      : [],
    currentWindowId: "browser-window-1",
    windows: [{
      activeTabId: "browser-tab-1",
      tabs: [
        {
          active: true,
          automationMode: "Human",
          lifecycle: "ready",
          loading,
          navigationGeneration: 1,
          tabId: "browser-tab-1",
          title: "Auris 文档",
          url: "https://example.com/docs",
        },
        {
          active: false,
          automationMode: "Human",
          lifecycle: "ready",
          loading: false,
          navigationGeneration: 1,
          tabId: "browser-tab-2",
          title: "学习资料",
          url: "https://example.org/learn",
        },
      ],
      windowId: "browser-window-1",
    }],
  };
}

function nativeBridge(invoke: ReturnType<typeof vi.fn>): BrowserNativeBridge {
  return {
    invoke: (command, payload) => invoke(command, payload),
    subscribe: vi.fn(() => true),
    unsubscribe: vi.fn(() => true),
  };
}

function installBridge(initial: BrowserChromeSnapshot) {
  const listeners = new Set<(value: BrowserChromeSnapshot) => void>();
  const invoke = vi.fn((command: string) =>
    command === "getSnapshot" ? Promise.resolve(initial) : Promise.resolve(true));
  const unsubscribe = vi.fn((next: (value: BrowserChromeSnapshot) => void) => {
    listeners.delete(next);
    return true;
  });
  window.aurisBrowser = {
    invoke,
    subscribe(next) {
      listeners.add(next);
      return true;
    },
    unsubscribe,
  };
  return {
    emit(value: BrowserChromeSnapshot) {
      for (const listener of listeners) listener(value);
    },
    invoke,
    unsubscribe,
  };
}
