import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BrowserStatusCenter } from "@/components/desktop/browser-status-center";
import type { BrowserStatusSnapshot } from "@/features/browser/window-status";

const snapshot: BrowserStatusSnapshot = {
  appWindows: [{ focused: true, lifecycle: "ready", title: "Auris", visible: true, windowId: "auris-1" }],
  pendingApprovalCount: 1,
  revision: 1,
  windows: [{
    active: true,
    lastActiveAt: 2,
    lifecycle: "ready",
    windowId: "window-1",
    tabs: [
      { active: true, activity: "workflow", automationMode: "AiShared", crashMode: "ok", leaseHolderKind: "workflow", lifecycle: "ready", loading: true, pendingApprovalCount: 1, standingGrant: true, tabId: "tab-1", title: "Research", url: "https://example.com/path" },
      { active: false, activity: "idle", automationMode: "Human", crashMode: "manual-only", leaseHolderKind: null, lifecycle: "crashed", loading: false, pendingApprovalCount: 0, standingGrant: false, tabId: "tab-2", title: "Crashed", url: "" },
    ],
  }],
};

describe("BrowserStatusCenter", () => {
  it("renders grouped safe status and keyboard-operable focus intents", async () => {
    const focusBrowserWindow = vi.fn(async () => true);
    const focusBrowserTab = vi.fn(async () => true);
    const unsubscribe = vi.fn();
    render(<BrowserStatusCenter bridge={{
      focusBrowserTab,
      focusBrowserWindow,
      getBrowserStatus: vi.fn(async () => snapshot),
      subscribe: vi.fn(() => unsubscribe),
    }} />);
    fireEvent.click(screen.getByText("Browser status"));
    const windows = await screen.findByRole("list", { name: "Browser windows" });
    expect(within(windows).getByText("Research")).toBeInTheDocument();
    expect(within(windows).getByText("https://example.com/path")).toBeInTheDocument();
    expect(within(windows).getByText(/workflow/u)).toBeInTheDocument();
    expect(within(windows).getByText(/manual-only|crashed/u)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Focus browser window window-1" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Focus tab Research" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Focus tab Research" }));
    await waitFor(() => expect(focusBrowserWindow).toHaveBeenCalledWith("window-1"));
    expect(focusBrowserTab).toHaveBeenCalledWith("window-1", "tab-1");
  });

  it("renders empty and unavailable states", async () => {
    const { rerender } = render(<BrowserStatusCenter bridge={null} />);
    fireEvent.click(screen.getByText("Browser status"));
    expect(screen.getByText("Browser status is unavailable.")).toBeInTheDocument();
    rerender(<BrowserStatusCenter bridge={{
      focusBrowserTab: vi.fn(), focusBrowserWindow: vi.fn(),
      getBrowserStatus: vi.fn(async () => ({ ...snapshot, pendingApprovalCount: 0, windows: [] })),
      subscribe: vi.fn(() => vi.fn()),
    }} />);
    expect(await screen.findByText("No browser windows are open.")).toBeInTheDocument();
  });
});
