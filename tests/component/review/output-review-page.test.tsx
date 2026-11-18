import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesktopReviewNavigation } from "@/components/desktop/desktop-app-sidebar";
import { ReviewPageClient } from "@/components/review/review-page-client";
import {
  EMPTY_OUTPUT_REVIEW_STATE,
  addCalendarDays,
  completeCurrentReview,
  createKnowledgePoint,
  createProject,
  toLocalDateKey,
} from "@/features/output-review/output-review-model";
import { executeReviewMcpRequest } from "@/features/output-review/review-mcp-handler";
import { getDesktopBridge } from "@/platform/desktop/desktop-runtime";
import { OUTPUT_REVIEW_STORAGE_KEY } from "@/features/output-review/output-review-storage";

vi.mock("@/components/desktop/desktop-app-frame", () => ({
  DesktopAppFrame: ({ children, reviewNavigation }: { children: React.ReactNode; reviewNavigation: DesktopReviewNavigation }) => <>
    <button aria-expanded={reviewNavigation.expanded} onClick={reviewNavigation.onToggle} type="button">每日回顾</button>
    <div hidden={!reviewNavigation.expanded}>{reviewNavigation.children}</div>
    {children}
  </>,
}));

vi.mock("@/platform/desktop/desktop-runtime", { spy: true });

describe("daily evaluation calendar", () => {
  const today = toLocalDateKey(new Date());

  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["daily", ""],
    ["学习笔记", "daily/"],
  ])("counts unique recorded dates and updates when %s changes", async (directoryName, prefix) => {
    const paths = [
      { relativePath: `${prefix}2024-02-28.md` },
      { relativePath: `${prefix}2024-02-29.md` },
      { relativePath: `${prefix}2024-02-29.md` },
      { relativePath: `${prefix}2024-02-30.md` },
      { relativePath: `${prefix}模板.md` },
      { relativePath: `${prefix}archive/2024-02-20.md` },
      { relativePath: `${prefix}2024-02-21.md`, isDirectory: true },
      { relativePath: `${prefix}2024-02-22.md`, size: 0 },
      { relativePath: `${prefix}${addCalendarDays(today, 1)}.md` },
    ];
    let notifyChange: (() => void) | undefined;
    vi.mocked(getDesktopBridge).mockReturnValue({
      vault: {
        getDirectoryInfo: vi.fn().mockResolvedValue({ hasVault: true, directoryName }),
        listFiles: vi.fn(async () => paths),
        onDidChange: vi.fn((listener: () => void) => {
          notifyChange = listener;
          return () => undefined;
        }),
      },
    } as unknown as NonNullable<ReturnType<typeof getDesktopBridge>>);

    render(<ReviewPageClient />);
    expect(await screen.findByRole("heading", { name: "Day 2" })).toBeInTheDocument();
    paths.push({ relativePath: `${prefix}${today}.md` });
    act(() => notifyChange?.());
    expect(await screen.findByRole("heading", { name: "Day 3" })).toBeInTheDocument();
  });

  it("fills on the 21st recorded day and starts a new cycle on the next recorded day", async () => {
    let recordedDays = 0;
    let notifyChange: (() => void) | undefined;
    vi.mocked(getDesktopBridge).mockReturnValue({
      vault: {
        getDirectoryInfo: vi.fn().mockResolvedValue({ hasVault: true, directoryName: "daily" }),
        listFiles: vi.fn(async () => Array.from({ length: recordedDays }, (_, index) => ({
          relativePath: `${addCalendarDays(today, -2 * index)}.md`,
        }))),
        onDidChange: vi.fn((listener: () => void) => {
          notifyChange = listener;
          return () => undefined;
        }),
      },
    } as unknown as NonNullable<ReturnType<typeof getDesktopBridge>>);

    render(<ReviewPageClient />);
    expect(screen.getByRole("heading", { name: "Day 0" })).toHaveStyle({ backgroundSize: "100% 0%" });

    for (const [count, day] of [[20, 20], [21, 21], [22, 1], [42, 21]]) {
      recordedDays = count;
      act(() => notifyChange?.());
      const heading = await screen.findByRole("heading", { name: `Day ${day}` });
      expect(heading).toHaveAccessibleDescription(`日记周期：${day} / 21 天`);
      expect(heading).toHaveStyle({ backgroundSize: `100% ${day / 21 * 100}%` });
    }
  });

  it.each([
    ["daily", ""],
    ["学习笔记", "daily/"],
  ])("opens only the evaluation from the selected Markdown file under %s", async (directoryName, prefix) => {
    const user = userEvent.setup();
    const readFile = vi.fn().mockResolvedValue([
      "# 日记", "## 原始记录", "原始内容", "## 具体评价",
      "- **可确认的学习产出**：完成一套习题", "", "### 补充", "复核错题",
      "", "## 三点建议", "后续内容",
    ].join("\n"));
    vi.mocked(getDesktopBridge).mockReturnValue({
      vault: {
        getDirectoryInfo: vi.fn().mockResolvedValue({ hasVault: true, directoryName }),
        listFiles: vi.fn().mockResolvedValue([]),
        onDidChange: vi.fn(() => () => undefined),
        readFile,
      },
    } as unknown as NonNullable<ReturnType<typeof getDesktopBridge>>);
    Object.defineProperties(HTMLDialogElement.prototype, {
      showModal: { configurable: true, writable: true, value() { this.setAttribute("open", ""); } },
      close: { configurable: true, writable: true, value() { this.removeAttribute("open"); } },
    });

    render(<ReviewPageClient />);
    await goTo(user, "复习计划");
    expect(screen.getByRole("heading", { name: "每日评价" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "学习阶段" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "复习阶段" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "前 30 天" }));
    const date = addCalendarDays(today, -30);
    await user.click(screen.getByRole("button", { name: `${date} 的每日评价` }));
    const dialog = screen.getByRole("dialog", { name: "每日评价" });
    expect(await within(dialog).findByText("可确认的学习产出")).toHaveProperty("tagName", "STRONG");
    expect(dialog).toHaveTextContent("复核错题");
    expect(dialog).not.toHaveTextContent(/原始内容|后续内容/);
    expect(readFile).toHaveBeenCalledWith(`${prefix}${date}.md`);
    await user.click(within(dialog).getByRole("button", { name: "关闭每日评价" }));
    expect(dialog).not.toBeInTheDocument();
  });
});

async function goTo(user: ReturnType<typeof userEvent.setup>, name: string) {
  const toggle = screen.getByRole("button", { name: "每日回顾" });
  if (toggle.getAttribute("aria-expanded") === "false") await user.click(toggle);
  await user.click(within(screen.getByRole("group", { name: "复习导航" })).getByRole("button", { name }));
}

async function goToProjects(user: ReturnType<typeof userEvent.setup>) {
  await goTo(user, "复习计划");
  await user.click(screen.getByRole("button", { name: "管理项目" }));
}

describe("output review page", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows Agent-created records live and keeps them when the user creates another project", async () => {
    const user = userEvent.setup();
    render(<ReviewPageClient />);
    await goToProjects(user);
    act(() => { executeReviewMcpRequest({ method: "review.mcp.action", params: { action: "create_project", name: "Agent 项目" } }, window.localStorage); });
    expect(await screen.findByText("Agent 项目", { exact: true })).toBeInTheDocument();
    const stored = JSON.parse(window.localStorage.getItem(OUTPUT_REVIEW_STORAGE_KEY)!);
    act(() => { executeReviewMcpRequest({ method: "review.mcp.action", params: { action: "create_knowledge_point", project_id: stored.projects[0].id, title: "Agent 知识点" } }, window.localStorage); });
    await goTo(user, "全部条目");
    expect(await screen.findByRole("heading", { name: "Agent 知识点" })).toBeInTheDocument();
    await goToProjects(user);
    await user.click(screen.getByRole("button", { name: "新建项目" }));
    const form = screen.getByRole("form", { name: "新建项目" });
    await user.type(within(form).getByLabelText(/项目名称/), "用户项目");
    await user.click(within(form).getByRole("button", { name: "创建项目" }));
    const latest = JSON.parse(window.localStorage.getItem(OUTPUT_REVIEW_STORAGE_KEY)!);
    expect(latest.projects.map((project: { name: string }) => project.name)).toEqual(["Agent 项目", "用户项目"]);
    expect(latest.knowledgePoints).toHaveLength(1);
  });

  it("creates a project and knowledge point, then completes the due output", async () => {
    const user = userEvent.setup();
    render(<ReviewPageClient />);

    await goToProjects(user);
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

    await goTo(user, "今日复习");
    await user.click(screen.getByRole("button", { name: "复习全部" }));
    expect(screen.queryByLabelText("今日复盘概览")).not.toBeInTheDocument();
    const batch = screen.getByRole("region", { name: "条目复习" });
    expect(within(batch).getByRole("heading", { name: "特征值与特征向量" })).toBeInTheDocument();

    await user.click(within(batch).getByRole("button", { name: "完成复习" }));
    const confirmation = screen.getByRole("dialog");
    expect(within(confirmation).getByText("完成这次输出复习？")).toBeInTheDocument();
    await user.click(within(confirmation).getByRole("button", { name: "完成" }));

    const saved = JSON.parse(window.localStorage.getItem(OUTPUT_REVIEW_STORAGE_KEY) ?? "null");
    expect(saved.knowledgePoints[0]).toMatchObject({ currentStage: "day2", status: "active" });
    expect(saved.cycles[0].events[0]).toMatchObject({ delayDays: 0, status: "completed" });
    expect(screen.getByRole("status")).toHaveTextContent("输出复习已完成");
    expect(within(batch).getByRole("heading", { name: "所选条目没有待完成的复习" })).toBeInTheDocument();
    await user.click(within(batch).getByRole("button", { name: "返回今日复习" }));
    expect(screen.getByRole("region", { name: "今日复习" })).toBeInTheDocument();

    await goTo(user, "全部条目");
    expect(screen.getByRole("region", { name: "全部知识点" })).toBeInTheDocument();
    await goToProjects(user);
    expect(screen.getByRole("heading", { name: "项目" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复习日历" })).toBeInTheDocument();
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

    expect(await screen.findByRole("heading", { name: "Day 0" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/知识点详情/)).not.toBeInTheDocument();
  });

  it("moves the batch entry to the homepage and advances from overdue to due items", async () => {
    let state = createProject(EMPTY_OUTPUT_REVIEW_STATE, { name: "控制原理" });
    const today = toLocalDateKey(new Date());
    for (const [title, offset] of [["未来任务", 5], ["闭环反馈", -10], ["今日任务", -1]] as const) {
      state = createKnowledgePoint(state, {
        projectId: state.projects[0].id, startDate: addCalendarDays(today, offset), title,
      });
    }
    window.localStorage.setItem(OUTPUT_REVIEW_STORAGE_KEY, JSON.stringify(state));
    const user = userEvent.setup();
    render(<ReviewPageClient />);
    await goTo(user, "全部条目");
    expect(screen.queryByRole("button", { name: "复习全部" })).not.toBeInTheDocument();
    await goTo(user, "今日复习");
    await user.click(screen.getByRole("button", { name: "复习全部" }));

    const batch = screen.getByRole("region", { name: "条目复习" });
    expect(batch).toHaveTextContent("剩余 2 项");
    expect(within(batch).getByRole("heading", { name: "闭环反馈" })).toBeInTheDocument();
    await user.click(within(batch).getByRole("button", { name: "完成复习" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "完成" }));
    expect(batch).toHaveTextContent("剩余 1 项");
    expect(within(batch).getByRole("heading", { name: "今日任务" })).toBeInTheDocument();
    expect(batch).not.toHaveTextContent("未来任务");
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
    await goTo(user, "全部条目");
    expect(screen.getByRole("region", { name: "全部知识点" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "搜索知识点" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "全部知识点" })).getByRole("button", { name: /TCP 三次握手/ })).toBeInTheDocument();

    // 2. 项目视图 (ProjectsView) & 项目内详情
    await goToProjects(user);
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

    // 3. 统计和日历共用侧栏
    await goTo(user, "复习统计");
    expect(screen.getByRole("region", { name: "复盘热力图" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复习日历" })).toBeInTheDocument();
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
    await goTo(user, "复习统计");
    expect(screen.getByRole("region", { name: "复盘热力图" })).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "复习统计", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("过去 365 天")).toBeInTheDocument();
    expect(screen.queryByText("落花流水")).not.toBeInTheDocument();
    expect(screen.queryByText("@gan798798@qq.com")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "复习时长" }));
    expect(screen.getByText(/未记录的时长按阶段估算/)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "核心复盘指标" })).getAllByText("5 分钟").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "复习量" }));
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

  it("expands six icon destinations beneath the existing Review entry", async () => {
    const user = userEvent.setup();
    render(<ReviewPageClient />);
    const toggle = screen.getByRole("button", { name: "每日回顾" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    const navigation = screen.getByRole("group", { name: "复习导航" });
    const labels = ["今日复习", "复习计划", "知识点目录", "全部条目", "复习日历", "复习统计"];
    expect(within(navigation).getAllByRole("button").map(button => button.getAttribute("aria-label"))).toEqual(labels);
    for (const label of labels.filter(item => item !== "复习日历")) {
      const button = within(navigation).getByRole("button", { name: label });
      await user.click(button);
      expect(button).toHaveAttribute("aria-current", "page");
      expect(screen.getByRole("button", { name: "添加知识点" })).toBeInTheDocument();
    }
    await user.click(toggle);
    expect(navigation).not.toBeVisible();
  });

  it("opens 笔记回顾 directly from the landing page", async () => {
    const user = userEvent.setup();
    render(<ReviewPageClient />);

    await user.click(screen.getByRole("button", { name: "笔记回顾" }));
    expect(screen.getByRole("heading", { name: "笔记回顾工作台" })).toBeInTheDocument();
  });

  it("promotes a note review item into 1/2/4/7 spaced repetition under 笔记回顾 project", async () => {
    const user = userEvent.setup();
    // Seed note review item into localStorage
    window.localStorage.setItem(
      "auris.note-review.v1",
      JSON.stringify({
        version: 1,
        items: [
          {
            id: "nr_test_1",
            noteId: "note_alg_1",
            noteTitle: "线性代数总结",
            noteRelativePath: "Math/LA.md",
            scheduledDate: toLocalDateKey(new Date()),
            addedAt: new Date().toISOString(),
            lastReviewedAt: null,
            reviewCount: 0,
            status: "pending",
          },
        ],
      }),
    );

    render(<ReviewPageClient />);
    await user.click(screen.getByRole("button", { name: "笔记回顾" }));
    expect(screen.getByText("线性代数总结")).toBeInTheDocument();

    // Click 纳入 1/2/4/7
    const promoteBtn = screen.getByRole("button", { name: "纳入 1/2/4/7" });
    await user.click(promoteBtn);

    // Verify OutputReviewState now has project 笔记回顾 and knowledge point 线性代数总结
    const outputReview = JSON.parse(window.localStorage.getItem("auris.output-review.v1") ?? "{}");
    expect(outputReview.projects.some((p: { name: string }) => p.name === "笔记回顾")).toBe(true);
    expect(outputReview.knowledgePoints.some((kp: { title: string }) => kp.title === "线性代数总结")).toBe(true);
  });

  it("displays empty state when no reviews are completed yet", async () => {
    const user = userEvent.setup();
    render(<ReviewPageClient />);

    await goTo(user, "复习统计");
    expect(screen.getByRole("heading", { name: "还没有复盘记录" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "去今日复习" })).toBeInTheDocument();

    // Clicking '去今日复习' takes user back to today view
    await user.click(screen.getByRole("button", { name: "去今日复习" }));
    expect(screen.getByRole("region", { name: "今日复习" })).toBeInTheDocument();
  });
});
