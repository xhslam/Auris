import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { NiaTextSidePane } from "@/components/nia/nia-text-side-pane";
import type { NiaSession } from "@/features/nia/use-nia-session";

vi.mock("@/components/nia/nia-panel", () => ({
  NiaPanelWithSession: ({ session }: { session: NiaSession }) => (
    <div data-testid="text-session">{session.providerId ?? "未连接"}</div>
  ),
}));

vi.mock("@/components/nia/nia-provider-settings", () => ({
  NiaProviderSettings: () => <div data-testid="provider-settings">连接表单</div>,
}));

function sessionFixture(overrides: Partial<NiaSession> = {}) {
  return {
    providerId: null,
    providers: [],
    model: null,
    configMessage: null,
    historyEnabled: false,
    setHistoryEnabled: vi.fn(),
    setModel: vi.fn(),
    selectProvider: vi.fn(),
    rememberOnThisMac: vi.fn(),
    upsertCliProvider: vi.fn(),
    upsertRestProvider: vi.fn(),
    setSessionApiKey: vi.fn(),
    testConnection: vi.fn(),
    ...overrides,
  } as unknown as NiaSession;
}

describe("Nia 文字模型侧栏", () => {
  it("在未连接时引导到连接页并保留同一会话", async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    const session = sessionFixture();
    render(<NiaTextSidePane onClose={vi.fn()} onTabChange={onTabChange} session={session} tab="chat" />);

    expect(screen.getByRole("tab", { name: "对话" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("连接一个文字模型")).toBeInTheDocument();
    expect(screen.getByTestId("text-session")).toHaveTextContent("未连接");
    await user.click(screen.getByRole("button", { name: "连接 API Key" }));
    expect(onTabChange).toHaveBeenCalledWith("connection");
  });

  it("在连接页显示现有配置能力并可收起", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<NiaTextSidePane onClose={onClose} onTabChange={vi.fn()} session={sessionFixture()} tab="connection" />);

    expect(screen.getByRole("tab", { name: "连接" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("provider-settings")).toHaveTextContent("连接表单");
    await user.click(screen.getByRole("button", { name: "收起文字模型侧栏" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("显示当前提供商与模型状态", () => {
    render(
      <NiaTextSidePane
        onClose={vi.fn()}
        onTabChange={vi.fn()}
        session={sessionFixture({
          model: "gpt-4.1",
          providerId: "openai",
          providers: [{
            id: "openai",
            label: "OpenAI",
            kind: "rest",
            enabled: true,
            defaultModel: "gpt-4.1",
            supportedModels: ["gpt-4.1"],
          }],
        })}
        tab="chat"
      />,
    );
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.queryByText("连接一个文字模型")).not.toBeInTheDocument();
  });
});
