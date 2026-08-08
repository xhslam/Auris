import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AurisSettings } from "@/components/settings/auris-settings";
import type {
  DesktopBridge,
  DesktopBrowserSecuritySnapshot,
} from "@/platform/desktop/desktop-bridge";
import { resetHydratedDesktopBridgeCacheForTests } from "@/platform/desktop/use-hydrated-desktop-bridge";

function installDesktopBridge(security: DesktopBrowserSecuritySnapshot) {
  const unsubscribe = vi.fn();
  const bridge = {
    browserSecurity: {
      getSnapshot: vi.fn(async () => security),
      setAutomationEnabled: vi.fn(async (enabled: boolean) => ({
        ...security,
        automationEnabled: enabled,
        automationToggleAvailable: security.automationToggleAvailable,
      })),
      subscribe: vi.fn(() => unsubscribe),
    },
    browserGrants: {
      getSnapshot: vi.fn(async () => ({
        available: true,
        attachments: [],
        standingGrants: [],
      })),
      revoke: vi.fn(async (grantId: string) => ({
        grantId,
        revoked: true,
        snapshot: { available: true, attachments: [], standingGrants: [] },
      })),
      subscribe: vi.fn(() => () => undefined),
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

describe("AurisSettings browser security enablement", () => {
  afterEach(() => {
    delete window.shadowingDesktop;
    resetHydratedDesktopBridgeCacheForTests();
    vi.restoreAllMocks();
  });

  it("keeps automation enablement disabled with an explicit capability reason until security is green", async () => {
    const user = userEvent.setup();
    installDesktopBridge({
      available: true,
      automationEnabled: false,
      automationToggleAvailable: false,
      cookieReplay: false,
      eval: {
        description: "",
        enabled: false,
        scope: "",
      },
      localFixture: false,
      localStorageReplay: false,
      namedProfiles: false,
      production: false,
      securityReason: "phase4-security-incomplete:adversarial",
      securityVerified: false,
    });

    render(<AurisSettings />);
    await user.click(screen.getByText("集成"));

    expect(await screen.findByText("浏览器自动化")).toBeInTheDocument();
    expect(await screen.findByText(/能力原因：phase4-security-incomplete:adversarial/u)).toBeInTheDocument();
    const toggle = await screen.findByTestId("browser-automation-toggle");
    await waitFor(() => {
      expect(toggle).toHaveAttribute("data-disabled", "true");
    });
    await user.click(toggle);
    expect(window.shadowingDesktop?.browserSecurity?.setAutomationEnabled).not.toHaveBeenCalled();
  });

  it("exposes the automation toggle only after the compiled security gate is green", async () => {
    const user = userEvent.setup();
    const fixture = installDesktopBridge({
      available: true,
      automationEnabled: false,
      automationToggleAvailable: true,
      cookieReplay: false,
      eval: {
        description: "Exact-approved eval only in nonpersistent AiSandbox without Human/Keychain session material.",
        enabled: true,
        scope: "ai-sandbox-nonpersistent-no-session",
      },
      localFixture: false,
      localStorageReplay: false,
      namedProfiles: false,
      production: true,
      securityReason: null,
      securityVerified: true,
    });

    render(<AurisSettings />);
    await user.click(screen.getByText("集成"));

    await waitFor(async () => {
      const toggle = await screen.findByTestId("browser-automation-toggle");
      expect(toggle).toHaveAttribute("data-disabled", "false");
    });
    expect(await screen.findByText(/Eval 范围：ai-sandbox-nonpersistent-no-session/u)).toBeInTheDocument();
    expect(await screen.findByText(/localStorage 回放：关/u)).toBeInTheDocument();
    expect(await screen.findByText(/回放关闭是当前生产能力的刻意策略/u)).toBeInTheDocument();
    await user.click(screen.getByTestId("browser-automation-toggle"));
    await waitFor(() => {
      expect(fixture.bridge.browserSecurity?.setAutomationEnabled).toHaveBeenCalledWith(true);
    });
  });
});
