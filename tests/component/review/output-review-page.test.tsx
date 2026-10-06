import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewPageClient } from "@/components/review/review-page-client";
import {
  EMPTY_OUTPUT_REVIEW_STATE,
  addCalendarDays,
  completeCurrentReview,
  createKnowledgePoint,
  createProject,
  toLocalDateKey,
} from "@/features/output-review/output-review-model";
import { OUTPUT_REVIEW_STORAGE_KEY } from "@/features/output-review/output-review-storage";

vi.mock("@/components/desktop/desktop-app-frame", () => ({
  DesktopAppFrame: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("output review page", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("creates a project and knowledge point, then completes the due output", async () => {
    const user = userEvent.setup();
    render(<ReviewPageClient />);

    await user.click(screen.getByRole("button", { name: /^项目$/ }));
    await user.click(screen.getByRole("button", { name: "新建项目" }));
    const projectForm = screen.getByRole("form", { name: "新建项目" });
    await user.type(within(projectForm).getByLabelText(/项目名称/), "线性代数");
    await user.type(within(projectForm).getByLabelText("描述"), "矩阵与线性空间");
    await user.click(within(projectForm).getByRole("button", { name: "创建项目" }));

    await user.click(screen.getByRole("button", { name: "添加知识点" }));
    const knowledgeForm = screen.getByRole("form", { name: "添加知识点" });
    await user.type(within(knowledgeForm).getByLabelText(/标题/), "特征值与特征向量");
    const yesterday = addCalendarDays(toLocalDateKey(new Date()), -1);
    await user.clear(within(knowledgeForm).getByLabelText("开始日期"));
    await user.type(within(knowledgeForm).getByLabelText("开始日期"), yesterday);
    await user.click(within(knowledgeForm).getByRole("button", { name: "开始 1/2/4/7 复习" }));

    await user.click(screen.getByRole("button", { name: /^今天$/ }));
    expect(screen.getByLabelText("今日复盘概览")).toBeInTheDocument();
    expect(screen.queryByLabelText("Nia 复习监督")).not.toBeInTheDocument();
    expect(within(screen.getByLabelText("复习执行工作区")).getByText("特征值与特征向量")).toBeInTheDocument();
    expect(screen.getAllByText("今天到期")).toHaveLength(2);
    expect(screen.getByRole("region", { name: "复习摩天轮" })).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: "调整复习左右区域宽度" })).toBeInTheDocument();
    expect(screen.queryByText("复习要点")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "完成输出" }));
    const confirmation = screen.getByRole("dialog");
    expect(within(confirmation).getByText("完成这次输出复习？")).toBeInTheDocument();
    await user.click(within(confirmation).getByRole("button", { name: "完成" }));

    const saved = JSON.parse(window.localStorage.getItem(OUTPUT_REVIEW_STORAGE_KEY) ?? "null");
    expect(saved.knowledgePoints[0]).toMatchObject({ currentStage: "day2", status: "active" });
    expect(saved.cycles[0].events[0]).toMatchObject({ delayDays: 0, status: "completed" });
    expect(screen.getByRole("status")).toHaveTextContent("输出复习已完成");
    expect(screen.getByLabelText("接下来复习预览")).toHaveAttribute("open");

    await user.click(screen.getByRole("button", { name: /^全部$/ }));
    expect(screen.getByRole("heading", { name: "全部知识点" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^项目$/ }));
    expect(screen.getByRole("heading", { name: "项目" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^日历$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^洞察$/ })).not.toBeInTheDocument();
  });

  it("opens a valid knowledge point deep link after local state hydration", async () => {
    let state = createProject(EMPTY_OUTPUT_REVIEW_STATE, { name: "线性代数" });
    state = createKnowledgePoint(state, {
      projectId: state.projects[0].id,
      startDate: toLocalDateKey(new Date()),
      title: "特征值与特征向量",
    });
    const pointId = state.knowledgePoints[0].id;
    window.localStorage.setItem(OUTPUT_REVIEW_STORAGE_KEY, JSON.stringify(state));

    render(<ReviewPageClient initialKnowledgePointId={pointId} />);

    expect(await screen.findByLabelText("知识点详情：特征值与特征向量")).toBeInTheDocument();
  });

  it("ignores an unknown knowledge point deep link", async () => {
    render(<ReviewPageClient initialKnowledgePointId="missing-point" />);

    expect(await screen.findByText("还没有复习周期")).toBeInTheDocument();
    expect(screen.queryByLabelText(/知识点详情/)).not.toBeInTheDocument();
  });

  it("browses overdue tasks and project knowledge through the wheel and remembers the split", async () => {
    let state = createProject(EMPTY_OUTPUT_REVIEW_STATE, { name: "控制原理" });
    state = createKnowledgePoint(state, {
      projectId: state.projects[0].id,
      startDate: addCalendarDays(toLocalDateKey(new Date()), -10),
      title: "闭环反馈",
    });
    window.localStorage.setItem(OUTPUT_REVIEW_STORAGE_KEY, JSON.stringify(state));
    const user = userEvent.setup();
    let now = 10000;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    const rendered = render(<ReviewPageClient />);
    try {
      const divider = screen.getByRole("separator");
      divider.focus();
      await user.keyboard("{ArrowRight}");
      expect(divider).toHaveAttribute("aria-valuenow", "47");
      expect(window.localStorage.getItem("auris.review.split")).toBe("47");

      await user.click(screen.getByRole("button", { name: "按下摇杆切换下一组" }));
      const overdue = screen.getByRole("tabpanel", { name: /已经逾期的任务/ });
      await user.click(within(overdue).getByRole("button", { name: /闭环反馈/ }));
      expect(screen.getByLabelText("知识点详情：闭环反馈")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "关闭详情" }));

      now += 1300;
      await user.click(screen.getByRole("button", { name: "下一组卡片" }));
      const projects = screen.getByRole("tabpanel", { name: /我创建的项目/ });
      await user.click(within(projects).getByRole("button", { name: /控制原理/ }));
      await user.click(within(projects).getByRole("button", { name: /闭环反馈/ }));
      expect(screen.getByLabelText("知识点详情：闭环反馈")).toBeInTheDocument();
      rendered.unmount();
      render(<ReviewPageClient />);
      expect(screen.getByRole("separator")).toHaveAttribute("aria-valuenow", "47");
    } finally { clock.mockRestore(); }
  });

  it("navigates through all, projects, and heatmap app workspace views seamlessly", async () => {
    let state = createProject(EMPTY_OUTPUT_REVIEW_STATE, { name: "计算机网络", description: "TCP/IP协议族" });
    state = createKnowledgePoint(state, {
      projectId: state.projects[0].id,
      startDate: toLocalDateKey(new Date()),
      title: "TCP 三次握手",
    });
    window.localStorage.setItem(OUTPUT_REVIEW_STORAGE_KEY, JSON.stringify(state));

    const user = userEvent.setup();
    render(<ReviewPageClient />);

    // 1. 全部视图 (AllView)
    await user.click(screen.getByRole("button", { name: /^全部$/ }));
    expect(screen.getByRole("region", { name: "全部知识点" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/搜索标题、描述、项目或标签/)).toBeInTheDocument();
    expect(screen.getByText("TCP 三次握手")).toBeInTheDocument();

    // 2. 项目视图 (ProjectsView) & 项目内详情
    await user.click(screen.getByRole("button", { name: /^项目$/ }));
    expect(screen.getByRole("region", { name: "项目列表" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /计算机网络/ })).toBeInTheDocument();

    // 进入项目详情
    await user.click(screen.getByRole("button", { name: /计算机网络/ }));
    expect(screen.getByRole("region", { name: "项目详情：计算机网络" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "← 返回项目" })).toBeInTheDocument();
    expect(screen.getByText("TCP/IP协议族")).toBeInTheDocument();

    // 返回项目列表
    await user.click(screen.getByRole("button", { name: "← 返回项目" }));
    expect(screen.getByRole("region", { name: "项目列表" })).toBeInTheDocument();

    // 3. 热力图保留，日历入口和界面移除
    await user.click(screen.getByRole("button", { name: /^复盘热力图$/ }));
    expect(screen.getByRole("region", { name: "复盘热力图" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^日历$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "日历视图" })).not.toBeInTheDocument();

    // 4. 洞察视图已移除
    expect(screen.queryByRole("button", { name: /^洞察$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "执行洞察" })).not.toBeInTheDocument();
  });

  it("navigates to review heatmap view, interacts with modes, and inspects completed review drilldown", async () => {
    let state = createProject(EMPTY_OUTPUT_REVIEW_STATE, { name: "概率论" });
    state = createKnowledgePoint(state, {
      projectId: state.projects[0].id,
      startDate: toLocalDateKey(new Date()),
      title: "大数定律与中心极限定理",
    });
    const pointId = state.knowledgePoints[0].id;
    // Complete Day 1 review
    state = completeCurrentReview(state, pointId, new Date());
    window.localStorage.setItem(OUTPUT_REVIEW_STORAGE_KEY, JSON.stringify(state));

    const user = userEvent.setup();
    render(<ReviewPageClient />);

    HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };

    // Click heatmap tab
    await user.click(screen.getByRole("button", { name: /^复盘热力图$/ }));
    expect(screen.getByRole("region", { name: "复盘热力图" })).toBeInTheDocument();

    // Verify heading aligned with other pages, and verify user profile bar is NOT rendered
    expect(screen.getByRole("heading", { name: "复盘热力图", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("过去 365 天 · 按知识点统计你的复习足迹")).toBeInTheDocument();
    expect(screen.queryByText("落花流水")).not.toBeInTheDocument();
    expect(screen.queryByText("@gan798798@qq.com")).not.toBeInTheDocument();

    expect(screen.queryByRole("tab", { name: "学习时长" })).not.toBeInTheDocument();
    // Verify 5 metric cards matching IMG_6320
    expect(screen.getByText("累计复习")).toBeInTheDocument();
    expect(screen.getByText("平均每日")).toBeInTheDocument();
    expect(screen.getByText("单日最多")).toBeInTheDocument();
    expect(screen.getByText("当前连续")).toBeInTheDocument();
    expect(screen.getByText("最长连续")).toBeInTheDocument();
    expect(screen.getAllByText("1 个知识点").length).toBeGreaterThanOrEqual(1);

    // Verify Learning Insights section
    expect(screen.getByText("学习洞察")).toBeInTheDocument();
    expect(screen.getByText("项目掌握")).toBeInTheDocument();
    expect(screen.getByText("待巩固")).toBeInTheDocument();
    expect(screen.getByText("复习节奏")).toBeInTheDocument();
    expect(screen.getByText("复习明细")).toBeInTheDocument();
    expect(screen.getByText("还没有项目掌握满 3 个知识点")).toBeInTheDocument();
    expect(screen.getByText("暂无待巩固知识点")).toBeInTheDocument();

    // Verify heatmap time tabs
    const dayTab = screen.getByRole("tab", { name: "每日" });
    const weekTab = screen.getByRole("tab", { name: "每周" });
    const cumulativeTab = screen.getByRole("tab", { name: "累计" });
    expect(dayTab).toHaveAttribute("aria-selected", "true");

    // Switch to week mode
    await user.click(weekTab);
    expect(weekTab).toHaveAttribute("aria-selected", "true");

    // Switch to cumulative mode
    await user.click(cumulativeTab);
    expect(cumulativeTab).toHaveAttribute("aria-selected", "true");

    // Switch back to day mode
    await user.click(dayTab);
    expect(dayTab).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("button", { name: /复习明细.*选择日期/ }));

    // Verify drilldown list shows the completed review
    expect(screen.getByText("大数定律与中心极限定理")).toBeInTheDocument();
    expect(screen.getByText("Day 1")).toBeInTheDocument();
    expect(screen.getByText("· 概率论")).toBeInTheDocument();

    // Click completed item to open detail dialog
    await user.click(screen.getByText("大数定律与中心极限定理"));
    expect(screen.getByLabelText("知识点详情：大数定律与中心极限定理")).toBeInTheDocument();
  });

  it("keeps one shared navigation and add action across the four remaining views", async () => {
    const user = userEvent.setup();
    render(<ReviewPageClient />);
    const navigation = screen.getByRole("navigation", { name: "输出复习视图" });
    const labels = ["今天", "全部", "项目", "复盘热力图"];
    expect(within(navigation).getAllByRole("button").map((button) => button.textContent)).toEqual(labels);
    for (const label of labels) {
      const button = within(navigation).getByRole("button", { name: label });
      await user.click(button);
      expect(screen.getByRole("navigation", { name: "输出复习视图" })).toBe(navigation);
      expect(button).toHaveAttribute("aria-current", "page");
      expect(navigation.querySelectorAll('[data-active="true"]')).toHaveLength(1);
      expect(within(navigation.parentElement!).getByRole("button", { name: "添加知识点" })).toBeInTheDocument();
    }
  });

  it("displays empty state when no reviews are completed yet", async () => {
    const user = userEvent.setup();
    render(<ReviewPageClient />);

    await user.click(screen.getByRole("button", { name: /^复盘热力图$/ }));
    expect(screen.getByRole("heading", { name: "还没有复盘记录" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "去今日复习" })).toBeInTheDocument();

    // Clicking '去今日复习' takes user back to today view
    await user.click(screen.getByRole("button", { name: "去今日复习" }));
    expect(screen.getByLabelText("今日复盘概览")).toBeInTheDocument();
  });
});
