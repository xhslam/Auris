import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { DesktopReadingSidebarNav } from "@/components/desktop/desktop-reading-sidebar-nav";

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: () => null,
  }),
}));

describe("DesktopReadingSidebarNav", () => {
  it("shows only articles, books and exams", () => {
    render(<DesktopReadingSidebarNav />);

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
  });
});
