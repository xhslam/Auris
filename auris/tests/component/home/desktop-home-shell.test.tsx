import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DesktopHomeShell } from "@/components/desktop/desktop-home-shell";
import {
  DEFAULT_CURRENT_AGE,
  HOME_STORAGE_KEY,
  toLocalDateKey,
  type HomeData,
} from "@/features/home/home-store";
import { createMemoryNotesStorage, createNotePage } from "@/features/notes/local-notes-store";

const pushMock = vi.fn();
const prefetchMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({
    prefetch: prefetchMock,
    push: pushMock,
  }),
  useSearchParams: () => ({
    get: () => null,
  }),
}));

function createNotesStorage() {
  return createMemoryNotesStorage({
    directoryName: "English Notes",
    pages: [
      createNotePage({
        fileName: "desktop-study-log.md",
        id: "desktop-note-1",
        markdownBody: "# Desktop Study Log",
        title: "Desktop Study Log",
        updatedAt: "2026-03-26T00:00:00.000Z",
      }),
    ],
  });
}

function readStoredHomeData() {
  return JSON.parse(window.localStorage.getItem(HOME_STORAGE_KEY) ?? "{}") as HomeData;
}

describe("DesktopHomeShell (Home v3)", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    window.localStorage.clear();
    pushMock.mockReset();
    prefetchMock.mockReset();
    Reflect.deleteProperty(window, "shadowingDesktop");
    Object.defineProperty(document, "hasFocus", {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    Element.prototype.scrollTo = vi.fn();
  });

  it("renders the connected Home v3 sections", () => {
    render(<DesktopHomeShell notesStorage={createNotesStorage()} />);

    expect(screen.queryByRole("heading", { name: "今日工作台" })).not.toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "App navigation" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "工作区" })).toBeInTheDocument();
    expect(screen.getByLabelText("每日格言")).toBeInTheDocument();
    expect(screen.getByTestId("life-road")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加计划" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "记录日历" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "快速笔记" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "快速闪念" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "更多操作" })).not.toBeInTheDocument();
    expect(document.querySelector(".demo-widget__menu")).not.toBeInTheDocument();

    const addWidgetButton = screen.getByRole("button", { name: "添加" });
    expect(addWidgetButton).toHaveAttribute("title", "添加");
    expect(addWidgetButton.textContent).toBe("");

    fireEvent.click(addWidgetButton);
    expect(screen.getByRole("complementary", { name: "添加组件" })).toBeInTheDocument();
  });

  it("persists daily quote edits", () => {
    render(<DesktopHomeShell notesStorage={null} />);

    fireEvent.change(screen.getByLabelText("编辑每日格言"), {
      target: { value: "今天只做最重要的一件事。" },
    });

    expect(readStoredHomeData().quote).toMatchObject({
      date: toLocalDateKey(new Date()),
      text: "今天只做最重要的一件事。",
    });
  });

  it("persists life road records for selected ages", () => {
    const currentYear = new Date().getFullYear();
    // 默认 birthYear = currentYear - DEFAULT_CURRENT_AGE，所以「现在」节点是这个岁数，
    // 对应的日历年份仍是 currentYear。
    const currentAge = DEFAULT_CURRENT_AGE;

    render(<DesktopHomeShell notesStorage={null} />);

    fireEvent.click(screen.getByRole("button", { name: `记录 ${currentAge} 岁` }));
    fireEvent.change(screen.getByLabelText(`编辑 ${currentAge} 岁人生阶段记录`), {
      target: { value: "把 Auris 首页变成真实工作台。" },
    });

    expect(readStoredHomeData().lifeRecords).toEqual([
      expect.objectContaining({
        text: "把 Auris 首页变成真实工作台。",
        year: currentYear,
      }),
    ]);
  });

  it("adds, edits, completes, and deletes plans with persistence", () => {
    render(<DesktopHomeShell notesStorage={null} />);

    fireEvent.click(screen.getByRole("button", { name: "添加计划" }));
    fireEvent.change(screen.getByLabelText("编辑计划"), {
      target: { value: "整理阅读材料" },
    });

    expect(readStoredHomeData().plans[0]).toMatchObject({
      done: false,
      title: "整理阅读材料",
    });

    fireEvent.click(screen.getByRole("button", { name: "完成 整理阅读材料" }));
    expect(readStoredHomeData().plans[0]).toMatchObject({
      done: true,
      title: "整理阅读材料",
    });
    expect(screen.getByLabelText("计划完成数量")).toHaveTextContent("1 / 1");

    fireEvent.click(screen.getByRole("button", { name: "删除 整理阅读材料" }));
    expect(readStoredHomeData().plans).toEqual([]);
  });

  it("renders the record calendar heatmap", () => {
    render(<DesktopHomeShell notesStorage={null} />);

    expect(screen.getByLabelText("记录日历")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "记录日历" })).toBeInTheDocument();
  });

  it("places the record calendar above the workspace", () => {
    render(<DesktopHomeShell notesStorage={null} />);

    const calendar = screen.getByLabelText("记录日历");
    const workspace = screen.getByLabelText("工作区");

    expect(calendar.compareDocumentPosition(workspace)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("routes the quick flash pill to the flash page", () => {
    const onPrimaryActionNavigate = vi.fn();

    render(
      <DesktopHomeShell
        notesStorage={createNotesStorage()}
        onPrimaryActionNavigate={onPrimaryActionNavigate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "快速闪念" }));

    expect(onPrimaryActionNavigate).toHaveBeenCalledWith("/flash");
  });

  it("embeds Browser status in the home side rail without import or video cards", () => {
    render(<DesktopHomeShell notesStorage={createNotesStorage()} />);

    expect(screen.getByLabelText("Browser status center")).toBeInTheDocument();
    expect(screen.getByText("Browser status")).toBeInTheDocument();
    expect(screen.getByLabelText("今日")).toBeInTheDocument();
    expect(screen.getByLabelText("我的库")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "视频学习" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "文章导入" })).not.toBeInTheDocument();
  });
});
