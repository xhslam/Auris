import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BrowserWindowMenu } from "@/components/browser-window/browser-window-menu";

describe("BrowserWindowMenu", () => {
  it("emits only explicit create/focus/close intents for selected windows", () => {
    const onCreateWindow = vi.fn();
    const onFocusWindow = vi.fn();
    const onCreateTab = vi.fn();
    const onCloseWindow = vi.fn();
    render(<BrowserWindowMenu
      currentWindowId="window-1"
      onCloseWindow={onCloseWindow}
      onCreateTab={onCreateTab}
      onCreateWindow={onCreateWindow}
      onFocusWindow={onFocusWindow}
      windows={[
        { activeTabId: "tab-1", tabs: [], windowId: "window-1" },
        { activeTabId: "tab-2", tabs: [], windowId: "window-2" },
      ]}
    />);
    fireEvent.click(screen.getByText("Windows · 窗口"));
    fireEvent.click(screen.getByRole("button", { name: "New window · 新建" }));
    fireEvent.click(screen.getByRole("button", { name: "Focus window-2" }));
    fireEvent.click(screen.getByRole("button", { name: "New tab in window-2" }));
    fireEvent.click(screen.getByRole("button", { name: "Close window-2" }));
    expect(onCreateWindow).toHaveBeenCalledOnce();
    expect(onFocusWindow).toHaveBeenCalledWith("window-2");
    expect(onCreateTab).toHaveBeenCalledWith("window-2");
    expect(onCloseWindow).toHaveBeenCalledWith("window-2");
    expect(screen.queryByText(/move tab/iu)).not.toBeInTheDocument();
  });
});
