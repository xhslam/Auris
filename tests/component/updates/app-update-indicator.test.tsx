import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppUpdateIndicator } from "@/components/updates/app-update-indicator";
import {
  UPDATE_CHECK_REQUEST_KEY,
  UPDATE_SETTINGS_NAVIGATION_EVENT,
} from "@/features/updates/update-navigation";
import { __resetAppUpdateStoreForTests } from "@/features/updates/update-store";
import { __resetUpdateSubscriptionForTests } from "@/features/updates/use-app-updates";
import type { DesktopUpdateSnapshot } from "@/platform/desktop/desktop-bridge";
import { createTestDesktopBridge } from "../../helpers/desktop-bridge";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

function installUpdatesBridge(overrides: Partial<DesktopUpdateSnapshot> = {}) {
  const snapshot: DesktopUpdateSnapshot = {
    canInstallInPlace: false,
    currentVersion: "1.0.0",
    downloadProgress: null,
    error: null,
    errorCode: null,
    lastCheckedAt: null,
    releasesUrl: "https://example.test/releases",
    stalledOperation: null,
    status: "idle",
    supported: true,
    updateInfo: null,
    ...overrides,
  };
  window.shadowingDesktop = createTestDesktopBridge({
    updates: {
      check: vi.fn(async () => snapshot),
      download: vi.fn(async () => snapshot),
      getState: vi.fn(async () => snapshot),
      onStateChange: vi.fn(() => () => undefined),
      openReleases: vi.fn(async () => ({ ok: true })),
      quitAndInstall: vi.fn(async () => ({ ok: true })),
      reset: vi.fn(async () => snapshot),
      recover: vi.fn(async () => ({ ok: true, snapshot })),
    },
  });
}

describe("AppUpdateIndicator", () => {
  afterEach(() => {
    delete window.shadowingDesktop;
    pushMock.mockReset();
    window.sessionStorage.clear();
    __resetUpdateSubscriptionForTests();
    __resetAppUpdateStoreForTests();
  });

  it("remains a visible update entry when the app is idle and opens a one-click check", async () => {
    installUpdatesBridge();
    const user = userEvent.setup();
    const navigationRequest = vi.fn();
    window.addEventListener(UPDATE_SETTINGS_NAVIGATION_EVENT, navigationRequest);
    render(<AppUpdateIndicator />);

    const button = await screen.findByRole("button", { name: "检查应用更新" });
    await user.click(button);

    expect(pushMock).toHaveBeenCalledWith("/settings?section=about&check=1#updates");
    expect(window.sessionStorage.getItem(UPDATE_CHECK_REQUEST_KEY)).toBe("1");
    expect(navigationRequest).toHaveBeenCalledTimes(1);
    window.removeEventListener(UPDATE_SETTINGS_NAVIGATION_EVENT, navigationRequest);
  });

  it("labels development mode without showing a false error", async () => {
    installUpdatesBridge({ supported: false });
    render(<AppUpdateIndicator />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "更新中心（开发模式）" }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("!")).not.toBeInTheDocument();
  });
});
