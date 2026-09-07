import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  constrainNiaInspectorWidth,
  NiaWorkspaceSurface,
} from "@/components/nia/nia-workspace-surface";
import { __resetNiaStandaloneStoreForTests } from "@/features/nia/nia-standalone-store";
import { __resetNiaTaskStoreForTests } from "@/features/nia/nia-task-store";
import { loadNiaCompanionScale } from "@/features/nia/nia-companion-scale";

vi.mock("@/features/home-learning/use-home-learning-summary", () => ({
  useHomeLearningSummary: () => ({
    review: { actionableCount: 0, status: "ready" },
  }),
}));

describe("NiaWorkspaceSurface split layout", () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetNiaStandaloneStoreForTests();
    __resetNiaTaskStoreForTests();
  });

  it("keeps the stage readable while constraining the inspector width", () => {
    expect(constrainNiaInspectorWidth(700, 1_200)).toBe(640);
    expect(constrainNiaInspectorWidth(640, 900)).toBe(402);
    expect(constrainNiaInspectorWidth(120, 1_200)).toBe(280);
  });

  it("replaces the context tab and duplicate archive entry with the conversation panel", () => {
    render(<NiaWorkspaceSurface />);

    expect(screen.getByRole("tab", { name: "会话记录" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: "上下文" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("tab", { name: "会话记录" })).toHaveLength(1);
    expect(screen.queryByText("当前主题")).not.toBeInTheDocument();
  });

  it("keeps the tool catalogue in the main stage and routing in a non-duplicated inspector", () => {
    render(<NiaWorkspaceSurface />);

    fireEvent.click(screen.getByRole("tab", { name: "工具" }));

    expect(screen.getByRole("article", { name: "可用工具与模型路由" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "工具连接概览" })).toBeInTheDocument();
    expect(screen.getAllByLabelText("Nia model routing and usage")).toHaveLength(1);
    expect(screen.getAllByText("独立陪伴模式")).toHaveLength(1);
  });

  it("uses the main-process snapshot as the conversation-saving authority", async () => {
    window.localStorage.setItem("auris.nia.save-conversations", "true");
    const invoke = vi.fn(async (command: string) => command === "snapshot"
      ? { state: "resting", savingConversations: false }
      : true);
    Object.defineProperty(window, "shadowingDesktop", {
      configurable: true,
      value: { niaCompanion: { invoke, subscribe: vi.fn(() => true), unsubscribe: vi.fn(() => true) } },
    });

    try {
      render(<NiaWorkspaceSurface />);
      await waitFor(() => expect(invoke).toHaveBeenCalledWith("snapshot"));
      fireEvent.click(screen.getByRole("button", { name: "Nia 设置" }));
      const savingSwitch = screen.getByText("保存新对话").closest(".nia-workspace__settings-row")?.querySelector("button");
      expect(savingSwitch).toHaveAttribute("aria-pressed", "false");
      expect(invoke).not.toHaveBeenCalledWith("conversation-saving", expect.anything());
    } finally {
      Reflect.deleteProperty(window, "shadowingDesktop");
    }
  });

  it("puts the desktop companion size slider inside Nia settings", async () => {
    render(<NiaWorkspaceSurface />);

    fireEvent.click(screen.getByRole("button", { name: "Nia 设置" }));
    const slider = screen.getByRole("slider", { name: "桌面形象大小" });

    expect(slider).toHaveValue("100");
    expect(screen.getByText("100%")).toBeInTheDocument();

    fireEvent.change(slider, { target: { value: "80" } });
    await waitFor(() => expect(loadNiaCompanionScale()).toBe(80));
    expect(screen.getByText("80%")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "使用她的原始大小" }));
    expect(slider).toHaveValue("100");
    expect(loadNiaCompanionScale()).toBe(100);
  });

  it("resizes both boards by pointer or keyboard and restores the default on double click", async () => {
    const { container } = render(<NiaWorkspaceSurface />);
    const body = container.querySelector(".nia-workspace__body") as HTMLDivElement;
    Object.defineProperty(body, "clientWidth", { configurable: true, value: 1_200 });
    const separator = screen.getByRole("separator", { name: "调整两个板块宽度" });

    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(separator).toHaveAttribute("aria-valuenow", "336");
    expect(body.style.getPropertyValue("--nia-side-pane-width")).toBe("336px");

    fireEvent.pointerDown(separator, { button: 0, clientX: 600, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 680, pointerId: 1 });
    expect(separator).toHaveAttribute("aria-valuenow", "416");
    expect(body).toHaveAttribute("data-resizing", "true");

    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(body).toHaveAttribute("data-resizing", "false");

    fireEvent.doubleClick(separator);
    expect(separator).toHaveAttribute("aria-valuenow", "320");
    await waitFor(() => {
      expect(window.localStorage.getItem("auris.nia.inspector-width")).toBe("320");
    });
  });

  it("renders all setting sections in the scrollable body and closes via close button, footer button, backdrop, or Escape", async () => {
    const { container } = render(<NiaWorkspaceSurface />);

    // Open settings
    fireEvent.click(screen.getByRole("button", { name: "Nia 设置" }));
    const dialog = screen.getByRole("dialog", { name: "Nia 角色设置" });
    expect(dialog).toHaveAttribute("aria-modal", "true");

    // Verify all sections are inside settings-body
    const settingsBody = container.querySelector(".nia-workspace__settings-body");
    expect(settingsBody).toBeInTheDocument();
    expect(settingsBody).toContainElement(screen.getByText("称呼"));
    expect(settingsBody).toContainElement(screen.getByText("外观"));
    expect(settingsBody).toContainElement(screen.getByRole("slider", { name: "桌面形象大小" }));
    expect(settingsBody).toContainElement(screen.getByText("语音"));
    expect(settingsBody).toContainElement(screen.getByText("显示桌面形象"));
    expect(settingsBody).toContainElement(screen.getByText("保存新对话"));
    expect(settingsBody).toContainElement(screen.getByText("提醒时间"));
    expect(settingsBody).toContainElement(screen.getByText("文字模型与 API Key"));

    // Close via close button (×)
    fireEvent.click(screen.getByRole("button", { name: "关闭设置" }));
    expect(screen.queryByRole("dialog", { name: "Nia 角色设置" })).not.toBeInTheDocument();

    // Reopen & close via footer "完成" button
    fireEvent.click(screen.getByRole("button", { name: "Nia 设置" }));
    expect(screen.getByRole("dialog", { name: "Nia 角色设置" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "完成" }));
    expect(screen.queryByRole("dialog", { name: "Nia 角色设置" })).not.toBeInTheDocument();

    // Reopen & close via backdrop click
    fireEvent.click(screen.getByRole("button", { name: "Nia 设置" }));
    const backdrop = container.querySelector(".nia-workspace__settings-backdrop") as HTMLDivElement;
    expect(backdrop).toBeInTheDocument();
    fireEvent.click(backdrop);
    expect(screen.queryByRole("dialog", { name: "Nia 角色设置" })).not.toBeInTheDocument();

    // Reopen & close via Escape key
    fireEvent.click(screen.getByRole("button", { name: "Nia 设置" }));
    expect(screen.getByRole("dialog", { name: "Nia 角色设置" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Nia 角色设置" })).not.toBeInTheDocument();
  });
});
