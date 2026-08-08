import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { FlashPageClient } from "@/components/flash/flash-page-client";
import { FLASH_STORAGE_KEY } from "@/features/flash/flash-store";

vi.mock("@/components/desktop/desktop-app-frame", () => ({
  DesktopAppFrame: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/platform/notes/get-notes-storage", () => ({
  getNotesStorage: () => null,
}));

const storedItems = [
  {
    createdAt: "2026-08-07T08:00:00.000Z",
    id: "favorite-flash",
    isFavorite: true,
    text: "整理课程提纲",
  },
  {
    createdAt: "2026-08-06T08:00:00.000Z",
    id: "regular-flash",
    isFavorite: false,
    text: "阅读时想到的例子",
  },
];

describe("FlashPageClient", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(FLASH_STORAGE_KEY, JSON.stringify(storedItems));
  });

  it("renders the flomo-inspired workspace with stored flashes", async () => {
    render(<FlashPageClient />);

    expect(await screen.findByText("整理课程提纲")).toBeInTheDocument();
    expect(screen.getByText("阅读时想到的例子")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "全部闪念" })).toBeInTheDocument();
    expect(screen.getByLabelText("闪念活跃记录")).toBeInTheDocument();
  });

  it("saves a new flash with Ctrl+Enter and persists it", async () => {
    render(<FlashPageClient />);
    const composer = screen.getByLabelText("记录一条闪念");

    fireEvent.change(composer, { target: { value: "刚刚想到的新点子" } });
    fireEvent.keyDown(composer, { ctrlKey: true, key: "Enter" });

    expect(await screen.findByText("刚刚想到的新点子")).toBeInTheDocument();
    await waitFor(() => {
      expect(window.localStorage.getItem(FLASH_STORAGE_KEY)).toContain("刚刚想到的新点子");
    });
  });

  it("filters the timeline from the search field", async () => {
    render(<FlashPageClient />);
    await screen.findByText("整理课程提纲");

    fireEvent.change(screen.getByLabelText("搜索闪念"), {
      target: { value: "课程" },
    });

    expect(screen.getByText("整理课程提纲")).toBeInTheDocument();
    expect(screen.queryByText("阅读时想到的例子")).not.toBeInTheDocument();
  });

  it("shows only favorite flashes from the sidebar filter", async () => {
    render(<FlashPageClient />);
    await screen.findByText("整理课程提纲");

    fireEvent.click(screen.getByRole("button", { name: "收藏闪念" }));

    expect(screen.getByText("整理课程提纲")).toBeInTheDocument();
    expect(screen.queryByText("阅读时想到的例子")).not.toBeInTheDocument();
  });

  it("toggles favorite state without mutating other items", async () => {
    render(<FlashPageClient />);
    await screen.findByText("阅读时想到的例子");

    fireEvent.click(screen.getByRole("button", { name: "收藏 阅读时想到的例子" }));

    const persisted = JSON.parse(
      window.localStorage.getItem(FLASH_STORAGE_KEY) ?? "[]",
    ) as typeof storedItems;
    expect(persisted.find((item) => item.id === "regular-flash")?.isFavorite).toBe(true);
    expect(persisted.find((item) => item.id === "favorite-flash")?.isFavorite).toBe(true);
  });

  it("inserts markdown helpers at the current composer cursor", () => {
    render(<FlashPageClient />);
    const composer = screen.getByLabelText("记录一条闪念") as HTMLTextAreaElement;

    fireEvent.change(composer, { target: { value: "想法" } });
    composer.setSelectionRange(0, 0);
    fireEvent.click(screen.getByRole("button", { name: "插入任务" }));

    expect(composer.value).toBe("- [ ] 想法");
  });

  it("focuses search with the global Ctrl+K shortcut", () => {
    render(<FlashPageClient />);

    fireEvent.keyDown(window, { ctrlKey: true, key: "k" });

    expect(screen.getByLabelText("搜索闪念")).toHaveFocus();
  });

  it("deletes a flash from its overflow menu", async () => {
    render(<FlashPageClient />);
    await screen.findByText("阅读时想到的例子");

    fireEvent.click(
      screen.getByRole("button", { name: "更多操作 阅读时想到的例子" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "删除闪念" }));

    expect(screen.queryByText("阅读时想到的例子")).not.toBeInTheDocument();
    expect(window.localStorage.getItem(FLASH_STORAGE_KEY)).not.toContain("regular-flash");
  });

  it("keeps the flash and reports when the notes library is unavailable", async () => {
    render(<FlashPageClient />);
    await screen.findByText("整理课程提纲");

    fireEvent.click(
      screen.getByRole("button", { name: "更多操作 整理课程提纲" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "整理成笔记" }));

    expect(screen.getByRole("status")).toHaveTextContent("当前笔记库不可用");
    expect(screen.getByText("整理课程提纲")).toBeInTheDocument();
  });

  it("shows the search empty state when no flash matches", async () => {
    render(<FlashPageClient />);
    await screen.findByText("整理课程提纲");

    fireEvent.change(screen.getByLabelText("搜索闪念"), {
      target: { value: "不存在的内容" },
    });

    expect(screen.getByRole("heading", { name: "没有找到匹配的闪念" })).toBeInTheDocument();
  });

  it("closes the filter menu with Escape", () => {
    render(<FlashPageClient />);
    const filterTrigger = screen.getByRole("button", {
      expanded: false,
      name: "全部闪念",
    });

    fireEvent.click(filterTrigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
