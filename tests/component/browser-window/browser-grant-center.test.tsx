import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserGrantCenter } from "@/components/browser-window/browser-grant-center";
import type { DesktopBridge, DesktopBrowserGrantsSnapshot } from "@/platform/desktop/desktop-bridge";

function snapshot(
  overrides: Partial<DesktopBrowserGrantsSnapshot> = {},
): DesktopBrowserGrantsSnapshot {
  return {
    attachments: [],
    available: true,
    standingGrants: [{
      grantId: "standing-one",
      kind: "standing",
      operation: "click",
      origin: "https://example.com",
    }],
    ...overrides,
  };
}

function installBridge(initial = snapshot()) {
  let current = initial;
  const listeners = new Set<(value: DesktopBrowserGrantsSnapshot) => void>();
  const revoke = vi.fn(async (grantId: string) => {
    current = {
      ...current,
      standingGrants: current.standingGrants.filter((grant) => grant.grantId !== grantId),
      attachments: current.attachments.filter((grant) => grant.grantId !== grantId),
    };
    for (const listener of listeners) listener(current);
    return { grantId, revoked: true, snapshot: current };
  });
  const bridge = {
    browserGrants: {
      getSnapshot: vi.fn(async () => current),
      revoke,
      subscribe: vi.fn((listener: (value: DesktopBrowserGrantsSnapshot) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }),
    },
  } as unknown as DesktopBridge;
  return {
    bridge,
    emit(next: DesktopBrowserGrantsSnapshot) {
      current = next;
      for (const listener of listeners) listener(next);
    },
    revoke,
  };
}

describe("BrowserGrantCenter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("subscribes live, revokes through the bridge, and unsubscribes on unmount", async () => {
    const user = userEvent.setup();
    const fixture = installBridge();
    const view = render(<BrowserGrantCenter bridge={fixture.bridge} />);

    expect(await screen.findByText("记住：点击")).toBeInTheDocument();
    expect(screen.getByText("https://example.com")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "撤销" }));
    expect(fixture.revoke).toHaveBeenCalledWith("standing-one");
    await waitFor(() => {
      expect(screen.getByText("当前没有已记住的浏览器授权。")).toBeInTheDocument();
    });

    act(() => {
      fixture.emit(snapshot({
        standingGrants: [{
          grantId: "standing-two",
          kind: "standing",
          operation: "navigate",
          origin: "https://docs.example",
        }],
      }));
    });
    expect(await screen.findByText("记住：跳转")).toBeInTheDocument();

    view.unmount();
    expect(fixture.bridge.browserGrants?.subscribe).toHaveBeenCalled();
  });

  it("shows unavailable and empty restart states without inventing grants", async () => {
    render(<BrowserGrantCenter bridge={null} />);
    expect(await screen.findByText(/仅桌面端可用/u)).toBeInTheDocument();

    const unavailable = installBridge(snapshot({ available: false, standingGrants: [] }));
    render(<BrowserGrantCenter bridge={unavailable.bridge} />);
    expect(await screen.findByText(/尚未就绪/u)).toBeInTheDocument();
  });
});
