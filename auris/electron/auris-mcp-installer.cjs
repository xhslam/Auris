const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

// 写进各客户端配置里的 MCP server 标识；移除时只认这个 key，避免误删用户其它 server。
const SERVER_KEY = "auris-notes";
const BACKUP_SUFFIX = ".auris-backup";

// Auris 的 MCP server 是一个 .mjs（stdio），由外部客户端拉起。
// 为了不依赖用户机器上是否装了 `node`，统一用 Electron 自身二进制当 node 运行。
const RUN_AS_NODE_ENV = { ELECTRON_RUN_AS_NODE: "1" };

function getClientDefinitions({ home = os.homedir(), env = process.env, platform = process.platform } = {}) {
  const claudeDesktopPath = (() => {
    switch (platform) {
      case "darwin":
        return path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
      case "win32":
        return path.join(env.APPDATA || path.join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
      default:
        return path.join(env.XDG_CONFIG_HOME || path.join(home, ".config"), "Claude", "claude_desktop_config.json");
    }
  })();

  return [
    {
      configPath: claudeDesktopPath,
      format: "json",
      id: "claude-desktop",
      jsonRoot: "mcpServers",
      label: "Claude Desktop",
    },
    {
      configPath: path.join(home, ".claude.json"),
      format: "json",
      id: "claude-code",
      jsonRoot: "mcpServers",
      label: "Claude Code",
    },
    {
      configPath: path.join(home, ".codex", "config.toml"),
      format: "toml",
      id: "codex-cli",
      label: "Codex CLI",
    },
  ];
}

function findClientDefinition(clientId, options) {
  const definition = getClientDefinitions(options).find((client) => client.id === clientId);

  if (!definition) {
    throw new Error(`Unknown MCP client: ${clientId}`);
  }

  return definition;
}

function buildServerEntry({ execPath, serverScriptPath }) {
  return {
    args: [serverScriptPath],
    command: execPath,
    env: { ...RUN_AS_NODE_ENV },
  };
}

// 判断已有配置是否就是"当前这套 Auris"——execPath 或脚本路径变了（升级/换机/重装）就算 outdated，需要修复。
function isEntryCurrent(entry, { execPath, serverScriptPath }) {
  if (!entry || typeof entry !== "object") {
    return false;
  }

  const args = Array.isArray(entry.args) ? entry.args : [];
  return entry.command === execPath && args.includes(serverScriptPath);
}

async function readFileOrNull(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function backupAndWrite(filePath, nextContent) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  let backupPath = null;
  if (fsSync.existsSync(filePath)) {
    backupPath = `${filePath}${BACKUP_SUFFIX}-${Date.now()}`;
    await fs.copyFile(filePath, backupPath);
  }

  // 临时文件 + rename，避免写一半被读到造成损坏。
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tempPath, nextContent, "utf8");
  await fs.rename(tempPath, filePath);

  return backupPath;
}

// ---------- JSON 客户端（Claude Desktop / Claude Code）----------

function parseJsonConfig(content) {
  if (content == null || content.trim() === "") {
    return { ok: true, value: {} };
  }

  try {
    const value = JSON.parse(content);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false };
    }

    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

function detectJsonStatus(definition, content, target) {
  if (content == null) {
    return { detail: "尚未配置", status: "not-installed" };
  }

  const parsed = parseJsonConfig(content);
  if (!parsed.ok) {
    return { detail: "配置文件无法解析（非合法 JSON），请先手动检查", status: "unreadable" };
  }

  const servers = parsed.value[definition.jsonRoot];
  const entry = servers && typeof servers === "object" ? servers[SERVER_KEY] : undefined;

  if (!entry) {
    return { detail: "尚未配置", status: "not-installed" };
  }

  if (isEntryCurrent(entry, target)) {
    return { detail: "已接入，指向当前 Auris", status: "connected" };
  }

  return { detail: "已配置但路径已过期，需要修复", status: "outdated" };
}

async function applyJsonChange(definition, target, mutate) {
  const content = await readFileOrNull(definition.configPath);
  const parsed = parseJsonConfig(content);

  if (!parsed.ok) {
    throw new Error(`${definition.label} 的配置文件不是合法 JSON，已中止以避免破坏现有内容。`);
  }

  const config = parsed.value;
  const servers = config[definition.jsonRoot] && typeof config[definition.jsonRoot] === "object"
    ? config[definition.jsonRoot]
    : {};

  mutate(servers);

  if (Object.keys(servers).length > 0) {
    config[definition.jsonRoot] = servers;
  } else if (definition.jsonRoot in config) {
    delete config[definition.jsonRoot];
  }

  const nextContent = `${JSON.stringify(config, null, 2)}\n`;
  return backupAndWrite(definition.configPath, nextContent);
}

// ---------- TOML 客户端（Codex CLI）----------
// 只做"块级"合并：识别 [mcp_servers.auris-notes] 这一段，替换/新增/删除它，
// 其余字节原样保留——比全量 parse + stringify 更安全，不会丢用户的注释和格式。

const TOML_HEADER_RE = /^\s*\[mcp_servers\.(?:auris-notes|"auris-notes")\]\s*$/;

function locateTomlBlock(lines) {
  const start = lines.findIndex((line) => TOML_HEADER_RE.test(line));
  if (start === -1) {
    return null;
  }

  let end = start + 1;
  while (end < lines.length && !/^\s*\[/.test(lines[end])) {
    end += 1;
  }

  return { end, start };
}

function tomlString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function buildTomlBlock(entry) {
  const argsLiteral = entry.args.map((arg) => tomlString(arg)).join(", ");
  const envLiteral = Object.entries(entry.env)
    .map(([key, value]) => `${key} = ${tomlString(value)}`)
    .join(", ");

  return [
    `[mcp_servers.${SERVER_KEY}]`,
    `command = ${tomlString(entry.command)}`,
    `args = [${argsLiteral}]`,
    `env = { ${envLiteral} }`,
  ].join("\n");
}

function parseTomlBlockEntry(blockLines) {
  const entry = { args: [], command: undefined, env: {} };

  for (const line of blockLines) {
    const commandMatch = line.match(/^\s*command\s*=\s*"((?:[^"\\]|\\.)*)"/);
    if (commandMatch) {
      entry.command = commandMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      continue;
    }

    const argsMatch = line.match(/^\s*args\s*=\s*\[(.*)\]/);
    if (argsMatch) {
      entry.args = (argsMatch[1].match(/"((?:[^"\\]|\\.)*)"/g) || []).map((quoted) =>
        quoted.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\"),
      );
    }
  }

  return entry;
}

function detectTomlStatus(content, target) {
  if (content == null) {
    return { detail: "尚未配置", status: "not-installed" };
  }

  const lines = content.split("\n");
  const block = locateTomlBlock(lines);

  if (!block) {
    return { detail: "尚未配置", status: "not-installed" };
  }

  const entry = parseTomlBlockEntry(lines.slice(block.start + 1, block.end));
  if (isEntryCurrent(entry, target)) {
    return { detail: "已接入，指向当前 Auris", status: "connected" };
  }

  return { detail: "已配置但路径已过期，需要修复", status: "outdated" };
}

async function applyTomlChange(definition, nextEntry) {
  const content = (await readFileOrNull(definition.configPath)) ?? "";
  const lines = content === "" ? [] : content.split("\n");
  const block = locateTomlBlock(lines);

  let nextLines;
  if (nextEntry == null) {
    if (!block) {
      return null;
    }

    let removeEnd = block.end;
    // 顺带吞掉块后面紧跟的空行，避免删除后留下空洞。
    while (removeEnd < lines.length && lines[removeEnd].trim() === "") {
      removeEnd += 1;
    }
    nextLines = [...lines.slice(0, block.start), ...lines.slice(removeEnd)];
  } else {
    const blockText = buildTomlBlock(nextEntry);
    if (block) {
      nextLines = [...lines.slice(0, block.start), ...blockText.split("\n"), ...lines.slice(block.end)];
    } else {
      const trimmed = [...lines];
      while (trimmed.length > 0 && trimmed[trimmed.length - 1].trim() === "") {
        trimmed.pop();
      }
      nextLines = trimmed.length > 0 ? [...trimmed, "", ...blockText.split("\n")] : blockText.split("\n");
    }
  }

  let nextContent = nextLines.join("\n");
  if (nextContent.trim() !== "" && !nextContent.endsWith("\n")) {
    nextContent += "\n";
  }

  return backupAndWrite(definition.configPath, nextContent);
}

// ---------- 对外操作 ----------

async function listMcpClients(options) {
  const target = { execPath: options.execPath, serverScriptPath: options.serverScriptPath };
  const definitions = getClientDefinitions(options);

  return Promise.all(
    definitions.map(async (definition) => {
      let result;
      try {
        const content = await readFileOrNull(definition.configPath);
        result =
          definition.format === "toml"
            ? detectTomlStatus(content, target)
            : detectJsonStatus(definition, content, target);
      } catch (error) {
        result = { detail: error instanceof Error ? error.message : "检测失败", status: "unreadable" };
      }

      return {
        configPath: definition.configPath,
        detail: result.detail,
        format: definition.format,
        id: definition.id,
        label: definition.label,
        status: result.status,
      };
    }),
  );
}

async function installMcpClient(clientId, options) {
  const definition = findClientDefinition(clientId, options);
  const target = { execPath: options.execPath, serverScriptPath: options.serverScriptPath };
  const entry = buildServerEntry(target);

  const backupPath =
    definition.format === "toml"
      ? await applyTomlChange(definition, entry)
      : await applyJsonChange(definition, target, (servers) => {
          servers[SERVER_KEY] = entry;
        });

  return { backupPath, clientId, configPath: definition.configPath, ok: true };
}

async function removeMcpClient(clientId, options) {
  const definition = findClientDefinition(clientId, options);

  const backupPath =
    definition.format === "toml"
      ? await applyTomlChange(definition, null)
      : await applyJsonChange(definition, options, (servers) => {
          delete servers[SERVER_KEY];
        });

  return { backupPath, clientId, configPath: definition.configPath, ok: true };
}

module.exports = {
  SERVER_KEY,
  buildServerEntry,
  getClientDefinitions,
  installMcpClient,
  listMcpClients,
  removeMcpClient,
};
