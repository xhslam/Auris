import type { ComponentPropsWithoutRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
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

  it("renders a compact navigation rail with brand and optional expand toggle", () => {
    render(<DesktopAppSidebar activeNavId="home" activeWorkspace="home" isVisible />);

    const sidebar = screen.getByLabelText("App navigation");

    expect(sidebar).toHaveAttribute("data-visible", "true");
    expect(sidebar).toHaveAttribute("data-expanded", "false");
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
        activeNavId="home"
        activeWorkspace="home"
        isPersistentRail
        isVisible={false}
      />,
    );

    const sidebar = container.querySelector(".desktop-app-sidebar") as HTMLElement;

    expect(sidebar).toHaveAttribute("data-visible", "false");
    expect(sidebar).not.toHaveAttribute("aria-hidden");
    expect(screen.getByLabelText("首页")).toHaveAttribute("href", "/");
    expect(screen.getByLabelText("本地笔记")).toHaveAttribute("href", "/notes");
    expect(screen.getByLabelText("灵感闪念")).toHaveAttribute("href", "/flash");
    expect(screen.getByLabelText("每日回顾")).toHaveAttribute("href", "/review");
    expect(screen.getByLabelText("阅读精选")).toHaveAttribute("href", "/reading");
  });

  it("keeps persistent rail nav links even when the home sidebar receives visible state", () => {
    const { container } = render(
      <DesktopAppSidebar
        activeNavId="home"
        activeWorkspace="home"
        isPersistentRail
        isVisible
      />,
    );

    expect(container.querySelector(".desktop-app-sidebar__sections")).toBeInTheDocument();
    expect(container.querySelector("[data-testid='desktop-sidebar-expand-zone']")).toBeNull();
    expect(screen.queryByText("今天的节奏")).not.toBeInTheDocument();
    expect(screen.getByLabelText("首页")).toBeInTheDocument();
    expect(screen.getByLabelText("本地笔记")).toBeInTheDocument();
    expect(screen.getByLabelText("灵感闪念")).toBeInTheDocument();
    expect(screen.getByLabelText("每日回顾")).toBeInTheDocument();
    expect(screen.getByLabelText("阅读精选")).toBeInTheDocument();
  });

  it("shows full feature labels and toggle when expanded", () => {
    const onToggleExpanded = vi.fn();

    render(
      <DesktopAppSidebar
        activeNavId="reading"
        activeWorkspace="workspace"
        isExpanded
        isPersistentRail
        isVisible={false}
        onToggleExpanded={onToggleExpanded}
      />,
    );

    const sidebar = screen.getByLabelText("App navigation");
    expect(sidebar).toHaveAttribute("data-expanded", "true");
    expect(screen.getByText("Auris")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "阅读精选" })).toBeInTheDocument();
    expect(screen.getByLabelText("系统设置")).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "收起侧栏" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(onToggleExpanded).toHaveBeenCalledTimes(1);
  });

  it("merges the brand avatar into a hover-expand control while collapsed", () => {
    const onToggleExpanded = vi.fn();

    render(
      <DesktopAppSidebar
        activeNavId="home"
        activeWorkspace="home"
        isExpanded={false}
        isPersistentRail
        isVisible={false}
        onToggleExpanded={onToggleExpanded}
      />,
    );

    const toggle = screen.getByRole("button", { name: "展开侧栏" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveClass("desktop-app-sidebar__brand-swap");
    expect(screen.queryByRole("button", { name: "收起侧栏" })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(onToggleExpanded).toHaveBeenCalledTimes(1);
  });

  it("shows the reading curated tree when expanded on reading", () => {
    pathnameMock.mockReturnValue("/reading");
    searchParamsGetMock.mockImplementation((key: string) =>
      key === "filter" ? "article" : null,
    );

    render(
      <DesktopAppSidebar
        activeNavId="reading"
        activeWorkspace="workspace"
        isExpanded
        isPersistentRail
        isVisible={false}
        onToggleExpanded={vi.fn()}
      />,
    );

    const sidebar = screen.getByLabelText("App navigation");
    expect(sidebar).toHaveAttribute("data-reading-nav", "true");
    expect(screen.getByRole("button", { name: "阅读精选" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "阅读精选" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("link", { name: "文章" })).toHaveAttribute(
      "href",
      "/reading?filter=article",
    );
    expect(screen.getByRole("link", { name: "书籍" })).toHaveAttribute(
      "href",
      "/reading?filter=book",
    );
    expect(screen.getByRole("link", { name: "题目" })).toHaveAttribute(
      "href",
      "/reading?filter=exam",
    );
    expect(screen.queryByRole("link", { name: "导入" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "阅读概览" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "收藏夹" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "阅读历史" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "文章" })).toHaveAttribute(
      "data-active",
      "true",
    );
  });

  it("hides the reading curated tree when the sidebar is collapsed", () => {
    pathnameMock.mockReturnValue("/reading");

    render(
      <DesktopAppSidebar
        activeNavId="reading"
        activeWorkspace="workspace"
        isExpanded={false}
        isPersistentRail
        isVisible={false}
        onToggleExpanded={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("App navigation")).toHaveAttribute(
      "data-reading-nav",
      "false",
    );
    expect(screen.queryByRole("button", { name: "阅读精选" })).not.toBeInTheDocument();
    // Collapsed rail still keeps the reading icon link.
    expect(screen.getByLabelText("阅读精选")).toBeInTheDocument();
  });

  it("keeps modified nav link clicks on native browser behavior", () => {
    const onNavigate = vi.fn();

    render(
      <DesktopAppSidebar
        activeNavId="home"
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
    render(<DesktopAppSidebar activeNavId="home" activeWorkspace="home" isVisible />);

    const videoLink = getVideoLink();

    fireEvent.mouseEnter(videoLink);
    fireEvent.focus(videoLink);

    expect(prefetchMock).toHaveBeenCalledTimes(1);
    expect(prefetchMock).toHaveBeenCalledWith("/video");
  });

  it("starts the burst immediately but navigates quickly without rescheduling on repeated clicks", () => {
    vi.useFakeTimers();
    const onNavigate = vi.fn();

    render(
      <DesktopAppSidebar
        activeNavId="home"
        activeWorkspace="home"
        isVisible
        onNavigate={onNavigate}
      />,
    );

    const videoLink = getVideoLink();

    expect(videoLink).toHaveAttribute("data-bursting", "false");
    expect(videoLink.querySelectorAll(".desktop-app-sidebar__link-particle")).toHaveLength(8);

    fireEvent.click(videoLink);

    expect(videoLink).toHaveAttribute("data-bursting", "true");
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

    act(() => {
      vi.advanceTimersByTime(488);
    });

    expect(videoLink).toHaveAttribute("data-bursting", "false");
  });

  it("commits prefetched navigation on the next timer turn", () => {
    vi.useFakeTimers();
    const onNavigate = vi.fn();

    render(
      <DesktopAppSidebar
        activeNavId="home"
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
