import { NIA_AVATAR_CUE_KEY } from "@/features/nia/nia-avatar-behavior";
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

  it("sends usable angry-expression and hop commands from the settings controls", () => {
    render(<NiaWorkspaceSurface />);
    fireEvent.click(screen.getByRole("button", { name: "Nia 设置" }));
    fireEvent.click(screen.getByRole("button", { name: "生气", exact: true }));
    expect(JSON.parse(localStorage.getItem(NIA_AVATAR_CUE_KEY)!)).toMatchObject({ expression: "angry", intensity: 1 });
    fireEvent.click(screen.getByRole("button", { name: "轻跳", exact: true }));
    expect(JSON.parse(localStorage.getItem(NIA_AVATAR_CUE_KEY)!)).toMatchObject({ motion: "hop" });
  });

  it("persists the independent desktop drift control from settings", () => {
    const first = render(<NiaWorkspaceSurface />);
    fireEvent.click(screen.getByRole("button", { name: "Nia 设置" }));
    const drift = screen.getByRole("button", { name: "桌面形象摇摆" });
    expect(drift).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(drift);
    expect(drift).toHaveAttribute("aria-pressed", "false");
    first.unmount();
    render(<NiaWorkspaceSurface />);
    fireEvent.click(screen.getByRole("button", { name: "Nia 设置" }));
    expect(screen.getByRole("button", { name: "桌面形象摇摆" })).toHaveAttribute("aria-pressed", "false");
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
    expect(settingsBody).toContainElement(screen.getByText("允许中途打断"));
    expect(settingsBody).toContainElement(screen.getByText("回答前等待时长"));
    expect(settingsBody).toContainElement(screen.getByText("提醒时间"));
    expect(settingsBody).toContainElement(screen.getByText("文字模型与 API Key"));

    // Toggle 允许中途打断
    const interruptSwitch = screen.getByRole("button", { name: "允许中途打断" });
    expect(interruptSwitch).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(interruptSwitch);
    expect(window.localStorage.getItem("auris.nia.interruptible")).toBe("false");

    // Select 回答前等待时长
    const slowerWait = screen.getByRole("button", { name: /等待更久/ });
    expect(slowerWait).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(slowerWait);
    expect(slowerWait).toHaveAttribute("aria-pressed", "true");
    expect(window.localStorage.getItem("auris.nia.eagerness")).toBe("low");

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

  it("defaults accentTheme to auto and allows switching between auto and explicit themes", async () => {
    const { container } = render(<NiaWorkspaceSurface />);
    const main = container.querySelector(".nia-workspace") as HTMLElement;
    expect(main).toHaveAttribute("data-accent-theme", "auto");

    fireEvent.click(screen.getByRole("button", { name: "Nia 设置" }));
    const autoButton = screen.getByRole("button", { name: "跟随主题" });
    const goldButton = screen.getByRole("button", { name: "金色主题" });

    expect(autoButton).toHaveAttribute("aria-pressed", "true");
    expect(goldButton).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: "紫色主题" })).not.toBeInTheDocument();

    const amberButton = screen.getByRole("button", { name: "暖橙主题" });
    expect(amberButton).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(amberButton);
    expect(amberButton).toHaveAttribute("aria-pressed", "true");
    expect(main).toHaveAttribute("data-accent-theme", "amber");
    expect(window.localStorage.getItem("auris.nia.accent-theme")).toBe("amber");

    fireEvent.click(goldButton);
    expect(goldButton).toHaveAttribute("aria-pressed", "true");
    expect(main).toHaveAttribute("data-accent-theme", "gold");
    expect(window.localStorage.getItem("auris.nia.accent-theme")).toBe("gold");

    fireEvent.click(autoButton);
    expect(autoButton).toHaveAttribute("aria-pressed", "true");
    expect(main).toHaveAttribute("data-accent-theme", "auto");
    expect(window.localStorage.getItem("auris.nia.accent-theme")).toBe("auto");
  });

  it("migrates legacy violet accent from localStorage to auto", () => {
    window.localStorage.setItem("auris.nia.accent-theme", "violet");
    const { container } = render(<NiaWorkspaceSurface />);
    const main = container.querySelector(".nia-workspace") as HTMLElement;

    expect(main).toHaveAttribute("data-accent-theme", "auto");
    expect(window.localStorage.getItem("auris.nia.accent-theme")).toBe("auto");
  });
});
