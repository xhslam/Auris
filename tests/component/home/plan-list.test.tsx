import { fireEvent, render, screen, within } from "@testing-library/react";
import { PlanList } from "@/components/home/plan-list";
import type { PlanItem } from "@/features/home/home-store";

const items: PlanItem[] = [
  {
    id: "plan-1",
    title: "整理阅读材料",
    done: true,
    createdAt: "2026-08-20T08:00:00.000Z",
    updatedAt: "2026-08-20T08:10:00.000Z",
  },
  {
    id: "plan-2",
    title: "完成 10 道真题",
    done: false,
    createdAt: "2026-08-20T08:20:00.000Z",
    updatedAt: "2026-08-20T08:20:00.000Z",
  },
];

function renderPlanList(plans = items) {
  const callbacks = {
    onAddTasks: vi.fn(),
    onDelete: vi.fn(),
    onExport: vi.fn(),
    onRecord: vi.fn(),
    onToggle: vi.fn(),
    onUpdateTitle: vi.fn(),
  };

  const result = render(<PlanList items={plans} {...callbacks} />);
  return { ...result, callbacks };
}

describe("PlanList", () => {
  it("presents progress and keeps list actions in a dedicated footer", () => {
    const { callbacks } = renderPlanList();
    const card = screen.getByRole("region", { name: "计划" });
    const progress = screen.getByRole("progressbar", { name: "今日任务完成度 50%" });

    expect(screen.getByLabelText("计划完成数量")).toHaveTextContent("1 / 2");
    expect(progress).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByText("再完成 1 项")).toBeInTheDocument();
    expect(within(card).queryByRole("heading", { name: "今日任务" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "导出每日计划" }));
    fireEvent.click(screen.getByRole("button", { name: "记录今日任务到 任务记录.md" }));
    fireEvent.click(screen.getByRole("button", { name: "添加计划" }));

    expect(screen.getByRole("textbox", { name: "批量添加任务" })).toBeInTheDocument();
    expect(callbacks.onExport).toHaveBeenCalledOnce();
    expect(callbacks.onRecord).toHaveBeenCalledOnce();
  });

  it("adds a pasted task list in one batch and normalizes common list markers", () => {
    const { callbacks } = renderPlanList([]);

    fireEvent.click(screen.getByRole("button", { name: "添加计划" }));
    fireEvent.change(screen.getByRole("textbox", { name: "批量添加任务" }), {
      target: { value: "1. 完成 10 道真题\n- 整理阅读材料\n- [ ] 复习单词\n\n" },
    });

    expect(screen.getByText("3 项")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "添加 3 项任务" }));

    expect(callbacks.onAddTasks).toHaveBeenCalledWith([
      "完成 10 道真题",
      "整理阅读材料",
      "复习单词",
    ]);
    expect(screen.queryByRole("textbox", { name: "批量添加任务" })).not.toBeInTheDocument();
  });

  it("uses the flexible task area for an intentional empty state", () => {
    renderPlanList([]);

    expect(screen.getByText("今天还没有任务")).toBeInTheDocument();
    expect(screen.getByText("把下一个可完成的动作写下来。")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });
});
