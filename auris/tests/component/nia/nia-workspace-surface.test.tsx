import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  constrainNiaInspectorWidth,
  NiaWorkspaceSurface,
} from "@/components/nia/nia-workspace-surface";
import { __resetNiaStandaloneStoreForTests } from "@/features/nia/nia-standalone-store";
import { __resetNiaTaskStoreForTests } from "@/features/nia/nia-task-store";

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

  it("resizes both boards by pointer or keyboard and restores the default on double click", async () => {
    const { container } = render(<NiaWorkspaceSurface />);
    const body = container.querySelector(".nia-workspace__body") as HTMLDivElement;
    Object.defineProperty(body, "clientWidth", { configurable: true, value: 1_200 });
    const separator = screen.getByRole("separator", { name: "调整两个板块宽度" });

    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    expect(separator).toHaveAttribute("aria-valuenow", "336");
    expect(body.style.getPropertyValue("--nia-side-pane-width")).toBe("336px");

    fireEvent.pointerDown(separator, { button: 0, clientX: 600, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 520, pointerId: 1 });
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
});
