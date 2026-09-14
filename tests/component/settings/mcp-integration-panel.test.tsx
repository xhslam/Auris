import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { McpIntegrationPanel } from "@/components/settings/mcp-integration-panel";

describe("McpIntegrationPanel", () => {
  it("renders current service status and persists an enable request", async () => {
    const updatePolicy = vi.fn().mockResolvedValue({
      enabled: true,
      policy: { autoApproveEdits: false, enabled: true, startOnLaunch: true },
      port: 41234,
    });

    const listClients = vi.fn().mockResolvedValue([
      {
        configPath: "/home/u/.codex/config.toml",
        detail: "尚未配置",
        format: "toml",
        id: "codex-cli",
        label: "Codex CLI",
        status: "not-installed",
      },
    ]);
    const installClient = vi.fn().mockResolvedValue([
      {
        configPath: "/home/u/.codex/config.toml",
        detail: "已接入，指向当前 Auris",
        format: "toml",
        id: "codex-cli",
        label: "Codex CLI",
        status: "connected",
      },
    ]);

    render(
      <McpIntegrationPanel
        bridge={{
          getServerInfo: vi.fn().mockResolvedValue({
            enabled: false,
            policy: { autoApproveEdits: false, enabled: false, startOnLaunch: true },
            port: null,
          }),
          installClient,
          listClients,
          removeClient: vi.fn().mockResolvedValue([]),
          updatePolicy,
        }}
      />,
    );

    expect(await screen.findByText("MCP 服务")).toBeInTheDocument();
    expect(screen.getByText("已停止")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "启用 MCP 服务" }));

    await waitFor(() => {
      expect(updatePolicy).toHaveBeenCalledWith({ enabled: true });
    });

    // 客户端接入区：从列表加载状态，点击安装后回传刷新。
    expect(await screen.findByText("Codex CLI")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "安装" }));
    await waitFor(() => {
      expect(installClient).toHaveBeenCalledWith("codex-cli");
    });
    expect(await screen.findByText("已接入")).toBeInTheDocument();
  });
});
