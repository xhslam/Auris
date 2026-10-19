import userEvent from "@testing-library/user-event";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { saveAppWindowPreferences } from "@/features/appearance/app-window-preferences";
import { DesktopAppFrame } from "@/components/desktop/desktop-app-frame";
import {
  DEFAULT_DESKTOP_ROUTE_PREFETCHES,
  DESKTOP_ROUTE_PREFETCH_DELAY_MS,
  DESKTOP_ROUTE_PREFETCH_STAGGER_MS,
  resetDesktopRoutePrefetchCacheForTests,
} from "@/platform/desktop/use-desktop-route-prefetch";
import { resetHydratedDesktopBridgeCacheForTests } from "@/platform/desktop/use-hydrated-desktop-bridge";

const { persistLastWorkspace } = vi.hoisted(() => ({
  persistLastWorkspace: vi.fn(),
}));

const { getDesktopBridgeMock } = vi.hoisted(() => ({
  getDesktopBridgeMock: vi.fn<() => unknown>(() => null),
}));

const { prefetchMock, pushMock } = vi.hoisted(() => ({
  prefetchMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    prefetch: prefetchMock,
    push: pushMock,
  }),
}));

vi.mock("@/components/desktop/desktop-app-sidebar", () => ({
  DesktopAppSidebar: ({
    isPersistentRail,
    isVisible,
  }: {
    isPersistentRail?: boolean;
    isVisible: boolean;
  }) => (
    <aside
      data-focus-reveal="false"
      data-persistent-rail={isPersistentRail ? "true" : "false"}
      data-testid="desktop-sidebar"
      data-visible={isVisible ? "true" : "false"}
    />
  ),
}));

vi.mock("@/components/ai-dock/ai-dock-shell", () => ({
  DesktopAiDockShell: ({ desktopBridge }: { desktopBridge: unknown }) => (
    <div
      data-bridge={desktopBridge ? "true" : "false"}
      data-testid="desktop-ai-dock-shell"
    />
  ),
}));

vi.mock("@/features/app-runtime/app-runtime-storage", async () => {
  const actual = await vi.importActual("@/features/app-runtime/app-runtime-storage");

  return {
    ...actual,
    persistLastWorkspace,
  };
});

vi.mock("@/platform/desktop/desktop-runtime", () => ({
  getDesktopBridge: getDesktopBridgeMock,
}));

describe("DesktopAppFrame", () => {
  it("shows an active filename in the native window title when provided", async () => {
    render(
      <DesktopAppFrame
        activeWorkspace="notes"
        subtitle="Notes"
        title="Notebook"
        windowTitle="daily-review.md"
      >
        <div>Notes</div>
      </DesktopAppFrame>,
    );

    await waitFor(() => {
      expect(document.title).toBe("daily-review.md · Auris");
    });
  });

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    persistLastWorkspace.mockReset();
    getDesktopBridgeMock.mockReset();
    getDesktopBridgeMock.mockReturnValue(null);
    prefetchMock.mockReset();
    pushMock.mockReset();
    resetDesktopRoutePrefetchCacheForTests();
    resetHydratedDesktopBridgeCacheForTests();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders only the floating sidebar shell and viewport content without a shared desktop header", async () => {
    const user = userEvent.setup();

    render(
      <DesktopAppFrame activeWorkspace="home" subtitle="Courses" title="Study plan">
        <main>content</main>
      </DesktopAppFrame>,
    );

    expect(screen.getByText("content")).toBeInTheDocument();
    expect(screen.getByTestId("desktop-sidebar")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "Study plan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Search" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Workspace status")).not.toBeInTheDocument();

    await user.click(document.body);

    expect(persistLastWorkspace).toHaveBeenCalledWith(null, window.localStorage, "home");
  });

  it("keeps non-home workspaces on the same persistent rail as home", () => {
    const { container } = render(
      <DesktopAppFrame activeWorkspace="workspace" subtitle="Courses" title="Study plan">
        <main>content</main>
      </DesktopAppFrame>,
    );

    const shell = container.querySelector(".desktop-app-shell");
    const sidebar = screen.getByTestId("desktop-sidebar");

    expect(shell).toHaveAttribute("data-sidebar-visible", "false");
    expect(shell).not.toHaveAttribute("data-sidebar-expanded");
    expect(sidebar).toHaveAttribute("data-visible", "false");
    expect(sidebar).toHaveAttribute("data-persistent-rail", "true");
    expect(sidebar).toHaveAttribute("data-focus-reveal", "false");
    expect(sidebar).not.toHaveAttribute("data-expanded");
    expect(screen.queryByTestId("desktop-sidebar-reveal-zone")).not.toBeInTheDocument();
  });

  it("can reserve a permanently visible rail for focused workspaces", () => {
    const { container } = render(
      <DesktopAppFrame activeWorkspace="workspace" sidebarVisible subtitle="Nia" title="Nia">
        <main>Nia workspace</main>
      </DesktopAppFrame>,
    );

    expect(container.querySelector(".desktop-app-shell")).toHaveAttribute("data-sidebar-visible", "true");
    expect(screen.getByTestId("desktop-sidebar")).toHaveAttribute("data-visible", "true");
  });

  it("does not use hover/focus reveal for the persistent rail", () => {
    const { container } = render(
      <DesktopAppFrame activeWorkspace="home" subtitle="Home" title="Workbench">
        <main>content</main>
      </DesktopAppFrame>,
    );

    const shell = container.querySelector(".desktop-app-shell");
    const sidebar = screen.getByTestId("desktop-sidebar");

    expect(sidebar).toHaveAttribute("data-persistent-rail", "true");
    expect(sidebar).toHaveAttribute("data-focus-reveal", "false");
    expect(shell).toHaveAttribute("data-sidebar-visible", "false");
    expect(shell).not.toHaveAttribute("data-sidebar-expanded");

    fireEvent.focus(sidebar);

    expect(shell).toHaveAttribute("data-sidebar-visible", "false");
    expect(shell).not.toHaveAttribute("data-sidebar-expanded");
  });

  it.each(["home", "notes", "workspace", "assessment"] as const)("keeps the rail visible even when status auto-hide is enabled in %s", (activeWorkspace) => {
    vi.useFakeTimers();
    saveAppWindowPreferences({ hideStatus: true, focusDim: 0, titlebarName: false });
    const { container } = render(<DesktopAppFrame activeWorkspace={activeWorkspace} title="Test" subtitle="Test"><main>content</main></DesktopAppFrame>);
    act(() => vi.advanceTimersByTime(10000));
    expect(container.querySelector(".desktop-app-shell")).not.toHaveAttribute("data-chrome-hidden");
    expect(screen.getByTestId("desktop-sidebar")).toHaveAttribute("data-persistent-rail", "true");
    act(() => saveAppWindowPreferences({ hideStatus: false, focusDim: 0, titlebarName: false }));
  });

  it("ignores the retired expansion preference", () => {
    window.sessionStorage.setItem("auris.desktop.sidebar-expanded", "true");
    const { container } = render(<DesktopAppFrame activeWorkspace="notes" subtitle="Notes" title="Notes"><main>notes</main></DesktopAppFrame>);
    expect(container.querySelector(".desktop-app-shell")).not.toHaveAttribute("data-sidebar-expanded");
    expect(screen.queryByRole("button", { name: /展开侧栏|收起侧栏/ })).toBeNull();
  });

  it("marks the shell as desktop-enabled when the bridge is available after hydration", async () => {
    getDesktopBridgeMock.mockReturnValue({
      aiDock: {
        setActiveProvider: vi.fn(),
        setActiveView: vi.fn(),
        setVisibility: vi.fn(),
        syncLayout: vi.fn(),
      },
      commands: { list: vi.fn(), run: vi.fn() },
      downloads: {
        exportJson: vi.fn(),
        getDirectoryInfo: vi.fn(),
        revealDirectory: vi.fn(),
      },
      plugins: {
        list: vi.fn(),
        openDirectory: vi.fn(),
        setEnabled: vi.fn(),
      },
      runtimeState: {
        get: vi.fn(),
        importLegacy: vi.fn(),
        setLastWorkspace: vi.fn(),
      },
      system: {
        openUpgrade: vi.fn(),
      },
      vault: {
        getDirectoryInfo: vi.fn(),
        listFiles: vi.fn(),
        onDidChange: vi.fn(),
        pickDirectory: vi.fn(),
        readFile: vi.fn(),
        removeFile: vi.fn(),
        revealPluginsDirectory: vi.fn(),
        saveFile: vi.fn(),
      },
      window: {
        showInFolder: vi.fn(),
      },
    });

    const { container } = render(
      <DesktopAppFrame activeWorkspace="home" subtitle="Courses" title="Study plan">
        <main>content</main>
      </DesktopAppFrame>,
    );

    await waitFor(() => {
      expect(container.querySelector(".desktop-app-shell")).toHaveAttribute(
        "data-desktop-runtime",
        "true",
      );
    });

    expect(screen.queryByTestId("desktop-ai-dock-shell")).not.toBeInTheDocument();
  });

  it("warms up the bounded desktop route set after mount", () => {
    vi.useFakeTimers();

    render(
      <DesktopAppFrame activeWorkspace="home" subtitle="Courses" title="Study plan">
        <main>content</main>
      </DesktopAppFrame>,
    );

    act(() => {
      vi.advanceTimersByTime(
        DESKTOP_ROUTE_PREFETCH_DELAY_MS +
          DESKTOP_ROUTE_PREFETCH_STAGGER_MS * DEFAULT_DESKTOP_ROUTE_PREFETCHES.length,
      );
    });

    expect(prefetchMock.mock.calls.map(([href]) => href)).toEqual([
      ...DEFAULT_DESKTOP_ROUTE_PREFETCHES,
    ]);
  });

  it("keeps SSR and hydration aligned when the desktop bridge becomes available on the client", async () => {
    const desktopBridge = {
      aiDock: {
        setActiveProvider: vi.fn(),
        setActiveView: vi.fn(),
        setVisibility: vi.fn(),
        syncLayout: vi.fn(),
      },
      commands: { list: vi.fn(), run: vi.fn() },
      downloads: {
        exportJson: vi.fn(),
        getDirectoryInfo: vi.fn(),
        revealDirectory: vi.fn(),
      },
      plugins: {
        list: vi.fn(),
        openDirectory: vi.fn(),
        setEnabled: vi.fn(),
      },
      runtimeState: {
        get: vi.fn(),
        importLegacy: vi.fn(),
        setLastWorkspace: vi.fn(),
      },
      system: {
        openUpgrade: vi.fn(),
      },
      vault: {
        getDirectoryInfo: vi.fn(),
        listFiles: vi.fn(),
        onDidChange: vi.fn(),
        pickDirectory: vi.fn(),
        readFile: vi.fn(),
        removeFile: vi.fn(),
        revealPluginsDirectory: vi.fn(),
        saveFile: vi.fn(),
      },
      window: {
        showInFolder: vi.fn(),
      },
    };
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    getDesktopBridgeMock.mockReturnValue(desktopBridge);

    const container = document.createElement("div");
    container.innerHTML = renderToString(
      <DesktopAppFrame activeWorkspace="home" subtitle="Courses" title="Study plan">
        <main>content</main>
      </DesktopAppFrame>,
    );

    expect(getDesktopBridgeMock).not.toHaveBeenCalled();

    expect(container.querySelector(".desktop-app-shell")).toHaveAttribute(
      "data-desktop-runtime",
      "false",
    );

    await act(async () => {
      hydrateRoot(
        container,
        <DesktopAppFrame activeWorkspace="home" subtitle="Courses" title="Study plan">
          <main>content</main>
        </DesktopAppFrame>,
      );
      await Promise.resolve();
    });

    const hydrationMessages = consoleErrorSpy.mock.calls
      .flat()
      .filter((value): value is string => typeof value === "string")
      .join("\n");

    expect(hydrationMessages).not.toContain("Hydration failed");
    expect(hydrationMessages).not.toContain("didn't match the client");
    expect(getDesktopBridgeMock).toHaveBeenCalled();

    await waitFor(() => {
      expect(container.querySelector(".desktop-app-shell")).toHaveAttribute(
        "data-desktop-runtime",
        "true",
      );
    });

    consoleErrorSpy.mockRestore();
  });

  it("reuses the hydrated desktop runtime on remount so route changes do not flash the fallback shell", async () => {
    const desktopBridge = {
      aiDock: {
        setActiveProvider: vi.fn(),
        setActiveView: vi.fn(),
        setVisibility: vi.fn(),
        syncLayout: vi.fn(),
      },
      commands: { list: vi.fn(), run: vi.fn() },
      downloads: {
        exportJson: vi.fn(),
        getDirectoryInfo: vi.fn(),
        revealDirectory: vi.fn(),
      },
      plugins: {
        list: vi.fn(),
        openDirectory: vi.fn(),
        setEnabled: vi.fn(),
      },
      runtimeState: {
        get: vi.fn(),
        importLegacy: vi.fn(),
        setLastWorkspace: vi.fn(),
      },
      system: {
        openUpgrade: vi.fn(),
      },
      vault: {
        getDirectoryInfo: vi.fn(),
        listFiles: vi.fn(),
        onDidChange: vi.fn(),
        pickDirectory: vi.fn(),
        readFile: vi.fn(),
        removeFile: vi.fn(),
        revealPluginsDirectory: vi.fn(),
        saveFile: vi.fn(),
      },
      window: {
        showInFolder: vi.fn(),
      },
    };

    getDesktopBridgeMock.mockReturnValue(desktopBridge);

    const firstRender = render(
      <DesktopAppFrame activeWorkspace="home" subtitle="Courses" title="Study plan">
        <main>content</main>
      </DesktopAppFrame>,
    );

    await waitFor(() => {
      expect(firstRender.container.querySelector(".desktop-app-shell")).toHaveAttribute(
        "data-desktop-runtime",
        "true",
      );
    });

    firstRender.unmount();

    const secondRender = render(
      <DesktopAppFrame activeWorkspace="notes" subtitle="Notes" title="Notebook">
        <main>notes</main>
      </DesktopAppFrame>,
    );

    expect(secondRender.container.querySelector(".desktop-app-shell")).toHaveAttribute(
      "data-desktop-runtime",
      "true",
    );
  });
});
