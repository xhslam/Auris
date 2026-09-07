import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewPageClient } from "@/components/review/review-page-client";
import {
  EMPTY_OUTPUT_REVIEW_STATE,
  addCalendarDays,
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
    expect(screen.getByText("特征值与特征向量")).toBeInTheDocument();
    expect(screen.getAllByText("今天到期")).toHaveLength(2);
    expect(screen.getByRole("complementary", { name: "后续复习" })).toBeInTheDocument();
    expect(screen.getByText("复习要点")).toBeInTheDocument();

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
    await user.click(screen.getByRole("button", { name: /^日历$/ }));
    expect(screen.getByText("显示当前调整后的计划。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^洞察$/ }));
    expect(screen.getByRole("heading", { name: "执行洞察" })).toBeInTheDocument();
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
});
