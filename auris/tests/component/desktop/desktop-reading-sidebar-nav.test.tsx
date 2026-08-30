import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { DesktopReadingSidebarNav } from "@/components/desktop/desktop-reading-sidebar-nav";

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: () => null,
  }),
}));

describe("DesktopReadingSidebarNav", () => {
  it("nests articles, books and exams under the Reading parent", () => {
    render(<DesktopReadingSidebarNav />);

    const parent = screen.getByRole("button", { name: "阅读精选" });
    expect(parent).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "文章",
      "书籍",
      "题目",
    ]);
    expect(screen.queryByText("阅读概览")).not.toBeInTheDocument();
    expect(screen.queryByText("收藏夹")).not.toBeInTheDocument();
    expect(screen.queryByText("阅读历史")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "文章" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    fireEvent.click(parent);

    expect(parent).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "文章" })).not.toBeInTheDocument();
  });
});
