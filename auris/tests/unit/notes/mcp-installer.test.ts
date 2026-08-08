import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

type InstallerClient = {
  configPath: string;
  detail: string;
  format: "json" | "toml";
  id: string;
  label: string;
  status: "connected" | "not-installed" | "outdated" | "unreadable";
};

type InstallerOptions = {
  env: Record<string, string>;
  execPath: string;
  home: string;
  platform: "darwin";
  serverScriptPath: string;
};

type Installer = {
  installMcpClient: (clientId: string, options: InstallerOptions) => Promise<{ ok: boolean }>;
  listMcpClients: (options: InstallerOptions) => Promise<InstallerClient[]>;
  removeMcpClient: (clientId: string, options: InstallerOptions) => Promise<{ ok: boolean }>;
};

const require = createRequire(import.meta.url);
const installer = require("../../../electron/auris-mcp-installer.cjs") as Installer;

const EXEC_PATH = "/Applications/Auris.app/Contents/MacOS/Auris";
const SCRIPT_PATH = "/Applications/Auris.app/Contents/Resources/auris-notes-mcp-server.mjs";

function makeOptions(home: string) {
  return {
    env: {},
    execPath: EXEC_PATH,
    home,
    platform: "darwin" as const,
    serverScriptPath: SCRIPT_PATH,
  };
}

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "auris-mcp-"));
});

afterEach(() => {
  // 临时目录交给 OS 回收，测试间互不影响。
});

function clientById(clients: InstallerClient[], id: string) {
  return clients.find((client) => client.id === id);
}

describe("auris mcp installer", () => {
  it("reports not-installed when no config files exist", async () => {
    const clients = await installer.listMcpClients(makeOptions(home));
    expect(clients).toHaveLength(3);
    expect(clients.every((client) => client.status === "not-installed")).toBe(true);
  });

  it("installs into Claude Desktop JSON and preserves existing servers", async () => {
    const configPath = join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
    // 预置一个用户自有 server，安装后必须保留。
    const { mkdirSync } = require("node:fs");
    mkdirSync(join(home, "Library", "Application Support", "Claude"), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({ mcpServers: { other: { command: "x", args: [] } } }, null, 2),
    );

    await installer.installMcpClient("claude-desktop", makeOptions(home));

    const written = JSON.parse(readFileSync(configPath, "utf8"));
    expect(written.mcpServers.other).toEqual({ command: "x", args: [] });
    expect(written.mcpServers["auris-notes"].command).toBe(EXEC_PATH);
    expect(written.mcpServers["auris-notes"].args).toContain(SCRIPT_PATH);
    expect(written.mcpServers["auris-notes"].env.ELECTRON_RUN_AS_NODE).toBe("1");

    const clients = await installer.listMcpClients(makeOptions(home));
    expect(clientById(clients, "claude-desktop")?.status).toBe("connected");
  });

  it("flags outdated when the script path changed and repair fixes it", async () => {
    await installer.installMcpClient("claude-code", makeOptions(home));
    const configPath = join(home, ".claude.json");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    config.mcpServers["auris-notes"].args = ["/old/path/server.mjs"];
    writeFileSync(configPath, JSON.stringify(config, null, 2));

    let clients = await installer.listMcpClients(makeOptions(home));
    expect(clientById(clients, "claude-code")?.status).toBe("outdated");

    await installer.installMcpClient("claude-code", makeOptions(home));
    clients = await installer.listMcpClients(makeOptions(home));
    expect(clientById(clients, "claude-code")?.status).toBe("connected");
  });

  it("merges and removes the Codex TOML block without touching other tables", async () => {
    const { mkdirSync } = require("node:fs");
    mkdirSync(join(home, ".codex"), { recursive: true });
    const configPath = join(home, ".codex", "config.toml");
    writeFileSync(configPath, '[mcp_servers.keepme]\ncommand = "keep"\nargs = []\n');

    await installer.installMcpClient("codex-cli", makeOptions(home));

    let toml = readFileSync(configPath, "utf8");
    expect(toml).toContain("[mcp_servers.keepme]");
    expect(toml).toContain("[mcp_servers.auris-notes]");
    expect(toml).toContain(SCRIPT_PATH);

    let clients = await installer.listMcpClients(makeOptions(home));
    expect(clientById(clients, "codex-cli")?.status).toBe("connected");

    await installer.removeMcpClient("codex-cli", makeOptions(home));
    toml = readFileSync(configPath, "utf8");
    expect(toml).toContain("[mcp_servers.keepme]");
    expect(toml).not.toContain("auris-notes");

    clients = await installer.listMcpClients(makeOptions(home));
    expect(clientById(clients, "codex-cli")?.status).toBe("not-installed");
  });

  it("marks unreadable JSON instead of overwriting it", async () => {
    const { mkdirSync } = require("node:fs");
    mkdirSync(join(home, "Library", "Application Support", "Claude"), { recursive: true });
    const configPath = join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
    writeFileSync(configPath, "{ this is not valid json ");

    const clients = await installer.listMcpClients(makeOptions(home));
    expect(clientById(clients, "claude-desktop")?.status).toBe("unreadable");

    await expect(installer.installMcpClient("claude-desktop", makeOptions(home))).rejects.toThrow();
    // 原文件保持不变。
    expect(readFileSync(configPath, "utf8")).toBe("{ this is not valid json ");
  });
});
