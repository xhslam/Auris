import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AurisSettings } from "@/components/settings/auris-settings";
import type { DesktopBridge, DesktopBrowserGrantsSnapshot } from "@/platform/desktop/desktop-bridge";
import { resetHydratedDesktopBridgeCacheForTests } from "@/platform/desktop/use-hydrated-desktop-bridge";

function installDesktopBridge(snapshot: DesktopBrowserGrantsSnapshot) {
  const unsubscribe = vi.fn();
  const bridge = {
    browserGrants: {
      getSnapshot: vi.fn(async () => snapshot),
      revoke: vi.fn(async (grantId: string) => ({
        grantId,
        revoked: true,
        snapshot: { ...snapshot, standingGrants: [], attachments: [] },
      })),
      subscribe: vi.fn(() => unsubscribe),
    },
    notesMcp: {
      getServerInfo: vi.fn(async () => ({
        enabled: false,
        port: null,
        policy: { autoApproveEdits: false, enabled: false, startOnLaunch: false },
      })),
      installClient: vi.fn(async () => []),
      listClients: vi.fn(async () => []),
      removeClient: vi.fn(async () => []),
      updatePolicy: vi.fn(async (policy) => ({
        enabled: false,
        port: null,
        policy: {
          autoApproveEdits: false,
          enabled: false,
          startOnLaunch: false,
          ...policy,
        },
      })),
      onRequest: vi.fn(() => () => undefined),
    },
  } as unknown as DesktopBridge;
  window.shadowingDesktop = bridge;
  return { bridge, unsubscribe };
}

describe("AurisSettings browser grants", () => {
  afterEach(() => {
    delete window.shadowingDesktop;
    resetHydratedDesktopBridgeCacheForTests();
    vi.restoreAllMocks();
  });

  it("mounts the live grant center under integrations and unsubscribes on unmount", async () => {
    const user = userEvent.setup();
    const fixture = installDesktopBridge({
      available: true,
      attachments: [],
      standingGrants: [{
        grantId: "standing-settings",
        kind: "standing",
        operation: "type",
        origin: "https://example.com",
      }],
    });

    const view = render(<AurisSettings />);
    await user.click(screen.getByText("集成"));

    expect(await screen.findByText("浏览器授权（本次运行）")).toBeInTheDocument();
    expect(await screen.findByTestId("browser-grant-center")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("记住：输入")).toBeInTheDocument();
    });
    expect(fixture.bridge.browserGrants?.subscribe).toHaveBeenCalled();

    view.unmount();
    expect(fixture.unsubscribe).toHaveBeenCalled();
  });

  it("shows the unavailable desktop grant state when the bridge is missing", async () => {
    const user = userEvent.setup();
    render(<AurisSettings />);
    await user.click(screen.getByText("集成"));
    expect(await screen.findByText(/仅桌面端可用|尚未就绪/u)).toBeInTheDocument();
  });
});
