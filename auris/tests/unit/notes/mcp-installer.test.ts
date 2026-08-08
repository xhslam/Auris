import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
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
  beforeConfigCommit?: (input: {
    expectedContent: string | null;
    nextContent: string;
    targetPath: string;
  }) => void | Promise<void>;
  env: Record<string, string>;
  execPath: string;
  home: string;
  platform: "darwin";
  serverScriptPath: string;
};

type Installer = {
  installMcpClient: (
    clientId: string,
    options: InstallerOptions,
  ) => Promise<{ backupPath: string | null; ok: boolean }>;
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
    expect(written.mcpServers["auris-notes"].env.AURIS_MCP_CLIENT_ID).toBe(
      "claude-desktop",
    );
    expect(written.mcpServers["auris-notes"].env.AURIS_MCP_CLIENT_TOKEN).toMatch(
      /^[0-9a-f]{64}$/u,
    );

    const clients = await installer.listMcpClients(makeOptions(home));
    expect(clientById(clients, "claude-desktop")?.status).toBe("connected");
  });

  it("preserves user fields inside the existing Auris JSON entry", async () => {
    const configDirectory = join(home, "Library", "Application Support", "Claude");
    const configPath = join(configDirectory, "claude_desktop_config.json");
    mkdirSync(configDirectory, { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: {
          "auris-notes": {
            args: ["/old/auris-notes-mcp-server.mjs", "--user-flag"],
            command: "/old/Auris",
            env: { CUSTOM: "keep", ELECTRON_RUN_AS_NODE: "0" },
            timeout: 42,
          },
        },
      }, null, 2),
    );

    await installer.installMcpClient("claude-desktop", makeOptions(home));

    const entry = JSON.parse(readFileSync(configPath, "utf8"))
      .mcpServers["auris-notes"];
    expect(entry).toMatchObject({
      args: [SCRIPT_PATH, "--user-flag"],
      command: EXEC_PATH,
      env: {
        CUSTOM: "keep",
        ELECTRON_RUN_AS_NODE: "1",
      },
      timeout: 42,
    });
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

  it("keeps a verified per-client token stable across repair installs", async () => {
    await installer.installMcpClient("claude-code", makeOptions(home));
    const configPath = join(home, ".claude.json");
    const first = JSON.parse(readFileSync(configPath, "utf8"))
      .mcpServers["auris-notes"].env.AURIS_MCP_CLIENT_TOKEN;

    await installer.installMcpClient("claude-code", makeOptions(home));
    const second = JSON.parse(readFileSync(configPath, "utf8"))
      .mcpServers["auris-notes"].env.AURIS_MCP_CLIENT_TOKEN;

    expect(second).toBe(first);
  });

  it("reports an installed path as outdated when its credential no longer verifies", async () => {
    await installer.installMcpClient("claude-code", makeOptions(home));
    const configPath = join(home, ".claude.json");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    config.mcpServers["auris-notes"].env.AURIS_MCP_CLIENT_TOKEN = "f".repeat(64);
    writeFileSync(configPath, JSON.stringify(config, null, 2));

    const clients = await installer.listMcpClients(makeOptions(home));
    expect(clientById(clients, "claude-code")).toMatchObject({
      detail: expect.stringMatching(/凭据.*重新安装/u),
      status: "outdated",
    });
  });

  it("merges and removes the Codex TOML block without touching other tables", async () => {
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

  it("rejects malformed TOML without replacing the original bytes", async () => {
    const configDirectory = join(home, ".codex");
    const configPath = join(configDirectory, "config.toml");
    mkdirSync(configDirectory, { recursive: true });
    const malformed = '[mcp_servers.keepme]\ncommand = "unterminated\n';
    writeFileSync(configPath, malformed);

    const clients = await installer.listMcpClients(makeOptions(home));
    expect(clientById(clients, "codex-cli")?.status).toBe("unreadable");
    await expect(
      installer.installMcpClient("codex-cli", makeOptions(home)),
    ).rejects.toThrow(/合法 TOML/);
    expect(readFileSync(configPath, "utf8")).toBe(malformed);
  });

  it("preserves custom Auris TOML fields and nested environment values", async () => {
    const configDirectory = join(home, ".codex");
    const configPath = join(configDirectory, "config.toml");
    mkdirSync(configDirectory, { recursive: true });
    writeFileSync(
      configPath,
      [
        "[mcp_servers.auris-notes]",
        'command = "/old/Auris"',
        'args = ["/old/auris-notes-mcp-server.mjs", "--user-flag"]',
        "timeout = 42",
        "",
        "[mcp_servers.auris-notes.env]",
        'CUSTOM = "keep"',
        "",
        "[mcp_servers.keepme]",
        'command = "keep"',
        "",
      ].join("\n"),
    );

    await installer.installMcpClient("codex-cli", makeOptions(home));

    const written = readFileSync(configPath, "utf8");
    expect(written).toContain(`command = "${EXEC_PATH}"`);
    expect(written).toContain(`"${SCRIPT_PATH}"`);
    expect(written).toContain('"--user-flag"');
    expect(written).toContain("timeout = 42");
    expect(written).toContain('CUSTOM = "keep"');
    expect(written).toContain('ELECTRON_RUN_AS_NODE = "1"');
    expect(written).toContain("[mcp_servers.keepme]");
  });

  it("retries a concurrent config change and preserves the external writer", async () => {
    const configDirectory = join(home, "Library", "Application Support", "Claude");
    const configPath = join(configDirectory, "claude_desktop_config.json");
    mkdirSync(configDirectory, { recursive: true });
    writeFileSync(configPath, JSON.stringify({ mcpServers: {} }, null, 2));
    let injected = false;
    const options = {
      ...makeOptions(home),
      beforeConfigCommit: () => {
        if (injected) return;
        injected = true;
        writeFileSync(
          configPath,
          JSON.stringify({
            mcpServers: {
              external: { args: [], command: "external" },
            },
          }, null, 2),
        );
      },
    };

    await installer.installMcpClient("claude-desktop", options);

    const written = JSON.parse(readFileSync(configPath, "utf8"));
    expect(written.mcpServers.external).toEqual({
      args: [],
      command: "external",
    });
    expect(written.mcpServers["auris-notes"].command).toBe(EXEC_PATH);
  });

  it("does not clobber a config created during first-time installation", async () => {
    const configDirectory = join(home, "Library", "Application Support", "Claude");
    const configPath = join(configDirectory, "claude_desktop_config.json");
    let injected = false;
    const options = {
      ...makeOptions(home),
      beforeConfigCommit: () => {
        if (injected) return;
        injected = true;
        writeFileSync(
          configPath,
          JSON.stringify({
            mcpServers: {
              firstWriter: { args: [], command: "first" },
            },
          }, null, 2),
        );
      },
    };

    await installer.installMcpClient("claude-desktop", options);

    const written = JSON.parse(readFileSync(configPath, "utf8"));
    expect(written.mcpServers.firstWriter.command).toBe("first");
    expect(written.mcpServers["auris-notes"].command).toBe(EXEC_PATH);
  });

  it("does not tighten permissions on an existing user-owned config directory", async () => {
    const configDirectory = join(home, "Library", "Application Support", "Claude");
    mkdirSync(configDirectory, { recursive: true });
    chmodSync(configDirectory, 0o755);

    await installer.installMcpClient("claude-desktop", makeOptions(home));

    expect(statSync(configDirectory).mode & 0o777).toBe(0o755);
  });

  it("writes private config and backup files with durable permissions", async () => {
    const configDirectory = join(home, "Library", "Application Support", "Claude");
    const configPath = join(configDirectory, "claude_desktop_config.json");
    mkdirSync(configDirectory, { recursive: true });
    writeFileSync(configPath, JSON.stringify({ mcpServers: {} }, null, 2));
    chmodSync(configPath, 0o644);

    const result = await installer.installMcpClient(
      "claude-desktop",
      makeOptions(home),
    );

    expect(statSync(configPath).mode & 0o777).toBe(0o600);
    expect(result.backupPath).toEqual(expect.any(String));
    expect(statSync(result.backupPath!).mode & 0o777).toBe(0o600);
    expect(readFileSync(result.backupPath!, "utf8")).toContain("mcpServers");
  });

  it("marks unreadable JSON instead of overwriting it", async () => {
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
