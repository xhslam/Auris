import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AurisSettings } from "@/components/settings/auris-settings";
import { resetHydratedDesktopBridgeCacheForTests } from "@/platform/desktop/use-hydrated-desktop-bridge";
import { createTestDesktopBridge } from "../../helpers/desktop-bridge";
import type { DesktopMcpClient } from "@/platform/desktop/desktop-bridge";

describe("AurisSettings Integrations panel", () => {
  const writeText = vi.fn(async () => undefined);
  const readText = vi.fn(async () => "");

  beforeEach(() => {
    writeText.mockClear();
    readText.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText, readText },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    delete (window as unknown as { shadowingDesktop?: unknown }).shadowingDesktop;
    window.localStorage.clear();
    window.sessionStorage.clear();
    resetHydratedDesktopBridgeCacheForTests();
  });

  it("renders the 6 active MCP clients and the CC-Switch row, excluding legacy Gemini CLI by default", async () => {
    const user = userEvent.setup();
    const mockClients: DesktopMcpClient[] = [
      { id: "claude-desktop", label: "Claude Desktop", configPath: "/home/.config/claude.json", format: "json", status: "not-installed", detail: "" },
      { id: "claude-code", label: "Claude Code", configPath: "/home/.claude.json", format: "json", status: "connected", detail: "" },
      { id: "codex-cli", label: "Codex CLI", configPath: "/home/.codex/config.toml", format: "toml", status: "connected", detail: "" },
      { id: "antigravity-cli", label: "Antigravity CLI", configPath: "/home/.gemini/config/mcp_config.json", format: "json", status: "connected", detail: "" },
      { id: "grok-cli", label: "Grok CLI", configPath: "/home/.grok/config.toml", format: "toml", status: "not-installed", detail: "" },
      { id: "opencode", label: "opencode", configPath: "/home/.config/opencode/opencode.json", format: "opencode", status: "not-installed", detail: "" },
    ];

    const testBridge = createTestDesktopBridge({
      notesMcp: {
        getServerInfo: vi.fn(async () => ({
          enabled: true,
          port: 49190,
          policy: { enabled: true, startOnLaunch: true, autoApproveEdits: false },
          ccSwitchLink: "ccswitch://v1/import?resource=mcp&name=auris-notes&apps=claude,codex,grok,opencode&config=eyJ0ZXN0IjoxfQ%3D%3D",
        })),
        updatePolicy: vi.fn(async () => undefined),
        onRequest: vi.fn(() => () => undefined),
        listClients: vi.fn(async () => mockClients),
        installClient: vi.fn(async () => mockClients),
        removeClient: vi.fn(async () => mockClients),
        getRecentClients: vi.fn(async () => []),
        getAuditLogs: vi.fn(async () => []),
        clearAuditLogs: vi.fn(async () => true),
      },
    });
    window.shadowingDesktop = testBridge;

    render(<AurisSettings />);

    // Switch to Integrations panel
    const integrationsTab = screen.getByRole("button", { name: "集成" });
    await user.click(integrationsTab);

    // Verify MCP client names appear
    expect(screen.getByText("Claude Desktop")).toBeInTheDocument();
    expect(screen.getByText("claude_desktop_config.json")).toBeInTheDocument();

    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText(".claude.json")).toBeInTheDocument();

    expect(screen.getByText("Codex CLI")).toBeInTheDocument();
    expect(screen.getByText("Antigravity CLI")).toBeInTheDocument();
    expect(screen.getByText("mcp_config.json")).toBeInTheDocument();

    expect(screen.getByText("Grok CLI")).toBeInTheDocument();
    expect(screen.getByText("opencode")).toBeInTheDocument();
    expect(screen.getByText("opencode.json")).toBeInTheDocument();

    // Verify Gemini CLI is NOT shown in default list
    expect(screen.queryByText("Gemini CLI")).not.toBeInTheDocument();
    expect(screen.queryByText("Gemini CLI (已废弃)")).not.toBeInTheDocument();

    // Verify CC-Switch row
    expect(screen.getByText("CC-Switch")).toBeInTheDocument();
    expect(
      screen.getByText("将 Auris 的 MCP 服务器交给 CC-Switch，由它同步到你在其中管理的 AI CLI。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加到 CC-Switch" })).toBeInTheDocument();

    // Verify AI CLI provider list contains Antigravity, not Gemini
    expect(screen.getByText("Antigravity")).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /gemini/i })).not.toBeInTheDocument();
  });

  it("handles copy and click on CC-Switch row and update button on connected clients", async () => {
    const user = userEvent.setup();
    const writeSpy = vi.spyOn(navigator.clipboard, "writeText");

    const mockClients: DesktopMcpClient[] = [
      { id: "claude-desktop", label: "Claude Desktop", configPath: "/home/.config/claude.json", format: "json", status: "not-installed", detail: "" },
      { id: "claude-code", label: "Claude Code", configPath: "/home/.claude.json", format: "json", status: "connected", detail: "" },
      { id: "codex-cli", label: "Codex CLI", configPath: "/home/.codex/config.toml", format: "toml", status: "connected", detail: "" },
      { id: "antigravity-cli", label: "Antigravity CLI", configPath: "/home/.gemini/config/mcp_config.json", format: "json", status: "connected", detail: "" },
      { id: "grok-cli", label: "Grok CLI", configPath: "/home/.grok/config.toml", format: "toml", status: "not-installed", detail: "" },
      { id: "opencode", label: "opencode", configPath: "/home/.config/opencode/opencode.json", format: "opencode", status: "not-installed", detail: "" },
    ];

    const installClient = vi.fn(async () => mockClients);
    const openExternal = vi.fn(async () => true);

    const ccSwitchLink = "ccswitch://v1/import?resource=mcp&name=auris-notes&apps=claude,codex,grok,opencode&config=eyJ0ZXN0IjoxfQ%3D%3D";

    window.shadowingDesktop = createTestDesktopBridge({
      system: {
        openExternal,
      },
      notesMcp: {
        getServerInfo: vi.fn(async () => ({
          enabled: true,
          port: 49190,
          policy: { enabled: true, startOnLaunch: true, autoApproveEdits: false },
          ccSwitchLink,
        })),
        updatePolicy: vi.fn(async () => undefined),
        onRequest: vi.fn(() => () => undefined),
        listClients: vi.fn(async () => mockClients),
        installClient,
        removeClient: vi.fn(async () => mockClients),
        getRecentClients: vi.fn(async () => []),
        getAuditLogs: vi.fn(async () => []),
        clearAuditLogs: vi.fn(async () => true),
      },
    });

    render(<AurisSettings />);
    await user.click(screen.getByRole("button", { name: "集成" }));

    // Wait for real clients to load into ref
    await waitFor(() => {
      expect(screen.getByText("Antigravity CLI")).toBeInTheDocument();
    });
    await new Promise((r) => setTimeout(r, 50));

    // Test clicking "更新" on Antigravity CLI specifically
    let antigravityRow = screen.getByText("Antigravity CLI").closest(".auris-settings__row") as HTMLElement;
    const updateButton = antigravityRow.querySelector("button.auris-settings__btn-sm") as HTMLElement;
    expect(updateButton).toHaveTextContent("更新");
    await user.click(updateButton);
    expect(installClient).toHaveBeenCalledWith("antigravity-cli");

    // Test copying the config path
    antigravityRow = screen.getByText("Antigravity CLI").closest(".auris-settings__row") as HTMLElement;
    const copyPathButton = antigravityRow.querySelector("button.auris-settings__installer-copy-btn") as HTMLElement;
    expect(copyPathButton).not.toBeNull();
    await user.click(copyPathButton);
    expect(writeSpy).toHaveBeenCalledWith("/home/.gemini/config/mcp_config.json");

    // Test clicking copy button for CC-Switch link
    const copyCcSwitchBtn = screen.getByTitle("复制 CC-Switch 导入链接");
    await user.click(copyCcSwitchBtn);
    expect(writeSpy).toHaveBeenCalledWith(ccSwitchLink);

    // Test clicking "添加到 CC-Switch"
    const addCcSwitchBtn = screen.getByRole("button", { name: "添加到 CC-Switch" });
    await user.click(addCcSwitchBtn);
    expect(openExternal).toHaveBeenCalledWith(ccSwitchLink);
  });

  it("detects CLI providers with Antigravity binary check", async () => {
    const user = userEvent.setup();
    const detectBinary = vi.fn(async (binary: string) => {
      if (binary === "antigravity") {
        return { installed: true, version: "0.1.0", path: "/usr/local/bin/agy" };
      }
      return { installed: true, version: "1.0.0", path: `/usr/local/bin/${binary}` };
    });

    window.shadowingDesktop = createTestDesktopBridge({
      system: {
        detectBinary,
      },
    });

    render(<AurisSettings />);
    await user.click(screen.getByRole("button", { name: "集成" }));

    const detectBtn = screen.getByRole("button", { name: "检测" });
    await user.click(detectBtn);

    expect(detectBinary).toHaveBeenCalledWith("claude");
    expect(detectBinary).toHaveBeenCalledWith("codex");
    expect(detectBinary).toHaveBeenCalledWith("antigravity");
    expect(detectBinary).not.toHaveBeenCalledWith("gemini");
  });

  it("shows legacy Gemini CLI if already installed on disk and allows removal", async () => {
    const user = userEvent.setup();
    const removeClient = vi.fn(async () => []);

    const mockClients: DesktopMcpClient[] = [
      { id: "gemini-cli", label: "Gemini CLI", configPath: "/home/.gemini/settings.json", format: "json", status: "connected", detail: "", legacy: true },
    ];

    window.shadowingDesktop = createTestDesktopBridge({
      notesMcp: {
        getServerInfo: vi.fn(async () => ({
          enabled: true,
          port: 49190,
          policy: { enabled: true, startOnLaunch: true, autoApproveEdits: false },
        })),
        updatePolicy: vi.fn(async () => undefined),
        onRequest: vi.fn(() => () => undefined),
        listClients: vi.fn(async () => mockClients),
        installClient: vi.fn(async () => mockClients),
        removeClient,
        getRecentClients: vi.fn(async () => []),
        getAuditLogs: vi.fn(async () => []),
        clearAuditLogs: vi.fn(async () => true),
      },
    });

    render(<AurisSettings />);
    await user.click(screen.getByRole("button", { name: "集成" }));

    // Wait for legacy client to be displayed
    await waitFor(() => {
      expect(screen.getByText("Gemini CLI (已废弃)")).toBeInTheDocument();
    });

    const geminiRow = screen.getByText("Gemini CLI (已废弃)").closest(".auris-settings__row") as HTMLElement;
    expect(geminiRow).not.toBeNull();

    const removeBtn = geminiRow.querySelector("button.auris-settings__btn-sm--danger") as HTMLElement;
    expect(removeBtn).toHaveTextContent("移除");
    await user.click(removeBtn);

    expect(removeClient).toHaveBeenCalledWith("gemini-cli");
  });
});
