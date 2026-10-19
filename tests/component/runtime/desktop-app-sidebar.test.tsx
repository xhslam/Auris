import type { ComponentPropsWithoutRef } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DesktopAppSidebar } from "@/components/desktop/desktop-app-sidebar";
import { DESKTOP_NAV_ITEMS } from "@/components/desktop/desktop-shell-fixtures";

const pushMock = vi.fn();
const prefetchMock = vi.fn();
const pathnameMock = vi.fn(() => "/");
const searchParamsGetMock = vi.fn<(key: string) => string | null>(() => null);

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    onClick,
    ...props
  }: ComponentPropsWithoutRef<"a"> & { href: string }) => (
    <a href={href} onClick={onClick} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock(),
  useRouter: () => ({
    prefetch: prefetchMock,
    push: pushMock,
  }),
  useSearchParams: () => ({
    get: searchParamsGetMock,
  }),
}));

function getVideoLink() {
  const videoLink = screen
    .getAllByRole("link")
    .find((link) => link.getAttribute("href") === "/video");

  expect(videoLink).toBeTruthy();

  return videoLink!;
}

describe("DesktopAppSidebar", () => {
  beforeEach(() => {
    vi.useRealTimers();
    prefetchMock.mockReset();
    pushMock.mockReset();
    pathnameMock.mockReset();
    pathnameMock.mockReturnValue("/");
    searchParamsGetMock.mockReset();
    searchParamsGetMock.mockReturnValue(null);
  });

  it("renders a compact navigation rail with brand and no expansion control", () => {
    render(<DesktopAppSidebar activeNavId="review" activeWorkspace="home" isVisible />);

    const sidebar = screen.getByLabelText("App navigation");

    expect(sidebar).toHaveAttribute("data-visible", "true");
    expect(sidebar).not.toHaveAttribute("data-expanded");
    expect(
      screen.queryByLabelText("Technical Meeting Rehearsal"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("演练")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Materials")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Materials" })).not.toBeInTheDocument();
    expect(sidebar.querySelector('.desktop-app-sidebar__link[href="/documents"]')).toBeNull();
    expect(screen.getByLabelText("阅读精选")).toHaveAttribute(
      "href",
      "/reading",
    );
    expect(screen.getAllByRole("link")).toHaveLength(DESKTOP_NAV_ITEMS.length);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("opens the vault list when entering Notes even if it was previously open", async () => {
    window.sessionStorage.setItem("auris.desktop.notes-vault-open", "true");
    const { rerender } = render(
      <DesktopAppSidebar activeNavId="review" activeWorkspace="home" isVisible />,
    );
    fireEvent.click(screen.getByRole("link", { name: "本地笔记" }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/notes"));
    rerender(<DesktopAppSidebar activeNavId="notes" activeWorkspace="notes" isVisible />);
    const notes = screen.getByRole("link", { name: "本地笔记" });
    expect(notes).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("group", { name: "笔记库" })).toBeInTheDocument();
    fireEvent.click(notes);
    expect(notes).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("group", { name: "笔记库" })).not.toBeInTheDocument();
    const hiddenVault = screen.getByRole("group", { name: "笔记库", hidden: true });
    expect(hiddenVault.closest("[inert]")).not.toBeNull();
    fireEvent.click(notes);
    expect(notes).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("group", { name: "笔记库" })).toBeInTheDocument();
    window.sessionStorage.removeItem("auris.desktop.notes-vault-open");
  });

  it("renders the Nia navigation glyph", () => {
    render(<DesktopAppSidebar activeNavId="nia" activeWorkspace="workspace" isVisible />);

    const niaLink = screen.getByRole("link", { name: "Nia" });

    expect(niaLink).toHaveAttribute("href", "/nia");
    expect(niaLink.querySelector(".desktop-app-sidebar__glyph")).not.toBeNull();
  });

  it("maps the persisted home workspace to the Review entry", () => {
    render(<DesktopAppSidebar activeWorkspace="home" isVisible />);
    expect(screen.getByRole("link", { name: "每日回顾" })).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("link", { name: "每日回顾" })).toHaveAttribute("href", "/");
  });

  it("marks the rail as hidden without removing the navigation targets from the DOM", () => {
    const { container } = render(
      <DesktopAppSidebar activeNavId="notes" activeWorkspace="notes" isVisible={false} />,
    );

    const sidebar = container.querySelector(".desktop-app-sidebar") as HTMLElement;
    const activeLink = sidebar.querySelector('.desktop-app-sidebar__link[data-active="true"]');

    expect(sidebar).toHaveAttribute("data-visible", "false");
    expect(sidebar).toHaveAttribute("aria-hidden", "true");
    expect(activeLink).not.toBeNull();
    expect(sidebar.querySelectorAll(".desktop-app-sidebar__link")).toHaveLength(
      DESKTOP_NAV_ITEMS.length,
    );
  });

  it("keeps the persistent home rail accessible while visually collapsed", () => {
    const { container } = render(
      <DesktopAppSidebar
        activeNavId="review"
        activeWorkspace="home"
        isPersistentRail
        isVisible={false}
      />,
    );

    const sidebar = container.querySelector(".desktop-app-sidebar") as HTMLElement;

    expect(sidebar).toHaveAttribute("data-visible", "false");
    expect(sidebar).not.toHaveAttribute("aria-hidden");
    expect(screen.queryByLabelText("首页")).not.toBeInTheDocument();
    expect(screen.getByLabelText("本地笔记")).toHaveAttribute("href", "/notes");
    expect(screen.getByLabelText("灵感闪念")).toHaveAttribute("href", "/flash");
    expect(screen.getByLabelText("每日回顾")).toHaveAttribute("href", "/");
    expect(sidebar.querySelector('.desktop-app-sidebar__link')).toBe(screen.getByLabelText("每日回顾"));
    expect(sidebar.querySelectorAll('.desktop-app-sidebar__link[data-active="true"]')).toHaveLength(1);
    expect(screen.getByLabelText("阅读精选")).toHaveAttribute("href", "/reading");
  });

  it("keeps persistent rail nav links even when the home sidebar receives visible state", () => {
    const { container } = render(
      <DesktopAppSidebar
        activeNavId="review"
        activeWorkspace="home"
        isPersistentRail
        isVisible
      />,
    );

    expect(container.querySelector(".desktop-app-sidebar__sections")).toBeInTheDocument();
    expect(container.querySelector("[data-testid='desktop-sidebar-expand-zone']")).toBeNull();
    expect(screen.queryByText("今天的节奏")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("首页")).not.toBeInTheDocument();
    expect(screen.getByLabelText("本地笔记")).toBeInTheDocument();
    expect(screen.getByLabelText("灵感闪念")).toBeInTheDocument();
    expect(screen.getByLabelText("每日回顾")).toBeInTheDocument();
    expect(screen.getByLabelText("阅读精选")).toBeInTheDocument();
  });

  it("keeps reading as an icon link without an expanded tree or toggle", () => {
    pathnameMock.mockReturnValue("/reading");
    render(<DesktopAppSidebar activeNavId="reading" activeWorkspace="workspace" isPersistentRail isVisible />);
    expect(screen.getByRole("link", { name: "阅读精选" })).toHaveAttribute("href", "/reading");
    expect(screen.queryByRole("button", { name: /展开侧栏|收起侧栏/ })).toBeNull();
  });

  it("keeps modified nav link clicks on native browser behavior", () => {
    const onNavigate = vi.fn();

    render(
      <DesktopAppSidebar
        activeNavId="review"
        activeWorkspace="home"
        isVisible
        onNavigate={onNavigate}
      />,
    );

    fireEvent.click(screen.getAllByRole("link")[0]!, { metaKey: true });

    expect(onNavigate).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("prefetches a destination when the user hovers a nav link", () => {
    render(<DesktopAppSidebar activeNavId="review" activeWorkspace="home" isVisible />);

    const videoLink = getVideoLink();

    fireEvent.mouseEnter(videoLink);
    fireEvent.focus(videoLink);

    expect(prefetchMock).toHaveBeenCalledTimes(1);
    expect(prefetchMock).toHaveBeenCalledWith("/video");
  });

  it("navigates quickly without rescheduling on repeated clicks", () => {
    vi.useFakeTimers();
    const onNavigate = vi.fn();

    render(
      <DesktopAppSidebar
        activeNavId="review"
        activeWorkspace="home"
        isVisible
        onNavigate={onNavigate}
      />,
    );

    const videoLink = getVideoLink();

    expect(videoLink).not.toHaveAttribute("data-bursting");
    expect(videoLink.querySelector(".desktop-app-sidebar__link-ripple")).toBeNull();
    expect(videoLink.querySelector(".desktop-app-sidebar__link-particle-field")).toBeNull();

    fireEvent.click(videoLink);

    expect(onNavigate).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
    expect(prefetchMock).toHaveBeenCalledWith("/video");

    act(() => {
      vi.advanceTimersByTime(31);
    });

    expect(onNavigate).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();

    fireEvent.click(videoLink);

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/video");
  });

  it("commits prefetched navigation on the next timer turn", () => {
    vi.useFakeTimers();
    const onNavigate = vi.fn();

    render(
      <DesktopAppSidebar
        activeNavId="review"
        activeWorkspace="home"
        isVisible
        onNavigate={onNavigate}
      />,
    );

    const videoLink = getVideoLink();

    fireEvent.mouseEnter(videoLink);
    fireEvent.click(videoLink);

    act(() => {
      vi.advanceTimersByTime(0);
    });

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/video");
  });
});
