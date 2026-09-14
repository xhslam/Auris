const os = require("node:os");
const path = require("node:path");
const { parse: parseToml, stringify: stringifyToml } = require("smol-toml");
const {
  getMcpClientCredentialsPath,
} = require("./auris-mcp-config.cjs");
const {
  createMcpClientCredentialStore,
} = require("./mcp/client-credential-store.cjs");
const {
  CONFIG_CONFLICT_CODE,
  durableCompareAndSwapWrite,
  readFileOrNull: readDurableFileOrNull,
} = require("./mcp/durable-config-writer.cjs");

// 写进各客户端配置里的 MCP server 标识；移除时只认这个 key，避免误删用户其它 server。
const SERVER_KEY = "auris-notes";
const MAX_CONFIG_WRITE_ATTEMPTS = 3;

// Auris 的 MCP server 是一个 .mjs（stdio），由外部客户端拉起。
// 为了不依赖用户机器上是否装了 `node`，统一用 Electron 自身二进制当 node 运行。
const RUN_AS_NODE_ENV = { ELECTRON_RUN_AS_NODE: "1" };
const CLIENT_ID_ENV = "AURIS_MCP_CLIENT_ID";
const CLIENT_TOKEN_ENV = "AURIS_MCP_CLIENT_TOKEN";

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

function isOwnedScriptArgument(value) {
  return (
    typeof value === "string" &&
    path.basename(value) === "auris-notes-mcp-server.mjs"
  );
}

function buildServerEntry(
  { clientId, clientToken, execPath, serverScriptPath },
  existingEntry,
) {
  const existing =
    existingEntry && typeof existingEntry === "object" && !Array.isArray(existingEntry)
      ? existingEntry
      : {};
  const existingArgs = Array.isArray(existing.args) ? existing.args : [];
  const existingEnv =
    existing.env && typeof existing.env === "object" && !Array.isArray(existing.env)
      ? existing.env
      : {};
  return {
    ...existing,
    args: [
      serverScriptPath,
      ...existingArgs.filter((argument) => !isOwnedScriptArgument(argument)),
    ],
    command: execPath,
    env: {
      ...existingEnv,
      ...RUN_AS_NODE_ENV,
      [CLIENT_ID_ENV]: clientId,
      [CLIENT_TOKEN_ENV]: clientToken,
    },
  };
}

// 判断已有配置是否就是"当前这套 Auris"——execPath 或脚本路径变了（升级/换机/重装）就算 outdated，需要修复。
function isEntryCurrent(entry, { execPath, serverScriptPath }) {
  if (!entry || typeof entry !== "object") {
    return false;
  }

  const args = Array.isArray(entry.args) ? entry.args : [];
  return (
    entry.command === execPath &&
    args.includes(serverScriptPath) &&
    typeof entry.env?.[CLIENT_ID_ENV] === "string" &&
    entry.env[CLIENT_ID_ENV].length > 0 &&
    typeof entry.env?.[CLIENT_TOKEN_ENV] === "string" &&
    entry.env[CLIENT_TOKEN_ENV].length >= 32
  );
}

function readFileOrNull(filePath, options = {}) {
  return readDurableFileOrNull(options.fileSystem, filePath);
}

async function updateConfigFile(filePath, transform, options = {}) {
  let beforeCommit = options.beforeConfigCommit;
  for (let attempt = 1; attempt <= MAX_CONFIG_WRITE_ATTEMPTS; attempt += 1) {
    const expectedContent = await readFileOrNull(filePath, options);
    const nextContent = transform(expectedContent);
    if (nextContent === null || nextContent === expectedContent) {
      return null;
    }

    try {
      const result = await durableCompareAndSwapWrite({
        beforeCommit,
        expectedContent,
        fileSystem: options.fileSystem,
        nextContent,
        randomId: options.randomId,
        targetPath: filePath,
      });
      return result.backupPath;
    } catch (error) {
      if (error?.code !== CONFIG_CONFLICT_CODE || attempt === MAX_CONFIG_WRITE_ATTEMPTS) {
        throw error;
      }
      beforeCommit = undefined;
    }
  }
  throw new Error("The MCP client configuration could not be updated.");
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

async function applyJsonChange(definition, mutate, options) {
  return updateConfigFile(definition.configPath, (content) => {
    const parsed = parseJsonConfig(content);
    if (!parsed.ok) {
      throw new Error(`${definition.label} 的配置文件不是合法 JSON，已中止以避免破坏现有内容。`);
    }

    const config = parsed.value;
    const servers =
      config[definition.jsonRoot] &&
      typeof config[definition.jsonRoot] === "object" &&
      !Array.isArray(config[definition.jsonRoot])
        ? config[definition.jsonRoot]
        : {};

    mutate(servers);

    if (Object.keys(servers).length > 0) {
      config[definition.jsonRoot] = servers;
    } else if (definition.jsonRoot in config) {
      delete config[definition.jsonRoot];
    }

    return `${JSON.stringify(config, null, 2)}\n`;
  }, options);
}

// ---------- TOML 客户端（Codex CLI）----------
// 只做"块级"合并：识别 [mcp_servers.auris-notes] 这一段，替换/新增/删除它，
// 其余字节原样保留——比全量 parse + stringify 更安全，不会丢用户的注释和格式。

const TOML_HEADER_RE =
  /^\s*\[mcp_servers\.(?:auris-notes|"auris-notes")\]\s*$/;
const TOML_OWNED_HEADER_RE =
  /^\s*\[mcp_servers\.(?:auris-notes|"auris-notes")(?:\.|\])[^]*$/;

function locateTomlBlock(lines) {
  const start = lines.findIndex((line) => TOML_HEADER_RE.test(line));
  if (start === -1) {
    return null;
  }

  let end = start + 1;
  while (
    end < lines.length &&
    (!/^\s*\[/.test(lines[end]) || TOML_OWNED_HEADER_RE.test(lines[end]))
  ) {
    end += 1;
  }

  return { end, start };
}

function parseTomlConfig(content) {
  if (content == null || content.trim() === "") {
    return { ok: true, value: {} };
  }
  try {
    const value = parseToml(content);
    return value && typeof value === "object" && !Array.isArray(value)
      ? { ok: true, value }
      : { ok: false };
  } catch {
    return { ok: false };
  }
}

function buildTomlBlock(entry) {
  return stringifyToml({
    mcp_servers: {
      [SERVER_KEY]: entry,
    },
  }).trim();
}

function getTomlServerEntry(config) {
  const servers =
    config.mcp_servers &&
    typeof config.mcp_servers === "object" &&
    !Array.isArray(config.mcp_servers)
      ? config.mcp_servers
      : {};
  return servers[SERVER_KEY];
}

function getCredentialStore(options) {
  if (options.credentialStore) return options.credentialStore;
  return createMcpClientCredentialStore({
    fileSystem: options.fileSystem,
    registryPath: getMcpClientCredentialsPath(
      options.env,
      options.platform,
      options.home,
    ),
  });
}

function getInstalledEntry(definition, content) {
  if (definition.format === "toml") {
    const parsed = parseTomlConfig(content);
    if (!parsed.ok) return null;
    return getTomlServerEntry(parsed.value);
  }
  const parsed = parseJsonConfig(content);
  if (!parsed.ok) return null;
  const servers = parsed.value[definition.jsonRoot];
  return servers && typeof servers === "object"
    ? servers[SERVER_KEY]
    : null;
}

async function readInstalledEntry(definition, options) {
  return getInstalledEntry(
    definition,
    await readFileOrNull(definition.configPath, options),
  );
}

function detectTomlStatus(content, target) {
  if (content == null) {
    return { detail: "尚未配置", status: "not-installed" };
  }
  const parsed = parseTomlConfig(content);
  if (!parsed.ok) {
    return { detail: "配置文件无法解析（非合法 TOML），请先手动检查", status: "unreadable" };
  }

  const lines = content.split("\n");
  const block = locateTomlBlock(lines);

  if (!block) {
    return { detail: "尚未配置", status: "not-installed" };
  }

  const entry = getTomlServerEntry(parsed.value);
  if (isEntryCurrent(entry, target)) {
    return { detail: "已接入，指向当前 Auris", status: "connected" };
  }

  return { detail: "已配置但路径已过期，需要修复", status: "outdated" };
}

async function applyTomlChange(definition, mutate, options) {
  return updateConfigFile(definition.configPath, (rawContent) => {
    const content = rawContent ?? "";
    const parsed = parseTomlConfig(content);
    if (!parsed.ok) {
      throw new Error(`${definition.label} 的配置文件不是合法 TOML，已中止以避免破坏现有内容。`);
    }
    const lines = content === "" ? [] : content.split("\n");
    const block = locateTomlBlock(lines);
    const nextEntry = mutate(getTomlServerEntry(parsed.value));

    let nextLines;
    if (nextEntry == null) {
      if (!block) {
        return rawContent;
      }

      let removeEnd = block.end;
      while (removeEnd < lines.length && lines[removeEnd].trim() === "") {
        removeEnd += 1;
      }
      nextLines = [...lines.slice(0, block.start), ...lines.slice(removeEnd)];
    } else {
      const blockText = buildTomlBlock(nextEntry);
      if (block) {
        nextLines = [
          ...lines.slice(0, block.start),
          ...blockText.split("\n"),
          ...lines.slice(block.end),
        ];
      } else {
        const trimmed = [...lines];
        while (trimmed.length > 0 && trimmed.at(-1)?.trim() === "") {
          trimmed.pop();
        }
        nextLines =
          trimmed.length > 0
            ? [...trimmed, "", ...blockText.split("\n")]
            : blockText.split("\n");
      }
    }

    let nextContent = nextLines.join("\n");
    if (nextContent.trim() !== "" && !nextContent.endsWith("\n")) {
      nextContent += "\n";
    }
    return nextContent;
  }, options);
}

// ---------- 对外操作 ----------

async function listMcpClients(options) {
  const target = { execPath: options.execPath, serverScriptPath: options.serverScriptPath };
  const definitions = getClientDefinitions(options);
  const credentialStore = getCredentialStore(options);

  return Promise.all(
    definitions.map(async (definition) => {
      let result;
      try {
        const content = await readFileOrNull(definition.configPath, options);
        result =
          definition.format === "toml"
            ? detectTomlStatus(content, target)
            : detectJsonStatus(definition, content, target);
        if (result.status === "connected") {
          const entry = getInstalledEntry(definition, content);
          const principal = await credentialStore.verify(
            entry?.env?.[CLIENT_ID_ENV],
            entry?.env?.[CLIENT_TOKEN_ENV],
          );
          if (!principal || principal.id !== definition.id) {
            result = {
              detail: "客户端凭据缺失或已失效，需要重新安装",
              status: "outdated",
            };
          }
        }
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
  const existingEntry = await readInstalledEntry(definition, options);
  const existingToken =
    existingEntry?.env?.[CLIENT_ID_ENV] === clientId
      ? existingEntry.env[CLIENT_TOKEN_ENV]
      : null;
  const credential = await getCredentialStore(options).issue(
    clientId,
    existingToken,
  );
  const target = {
    clientId,
    clientToken: credential.token,
    execPath: options.execPath,
    serverScriptPath: options.serverScriptPath,
  };

  const backupPath =
    definition.format === "toml"
      ? await applyTomlChange(
          definition,
          (existingEntry) => buildServerEntry(target, existingEntry),
          options,
        )
      : await applyJsonChange(definition, (servers) => {
          servers[SERVER_KEY] = buildServerEntry(
            target,
            servers[SERVER_KEY],
          );
        }, options);

  return { backupPath, clientId, configPath: definition.configPath, ok: true };
}

async function removeMcpClient(clientId, options) {
  const definition = findClientDefinition(clientId, options);

  const backupPath =
    definition.format === "toml"
      ? await applyTomlChange(definition, () => null, options)
      : await applyJsonChange(definition, (servers) => {
          delete servers[SERVER_KEY];
        }, options);

  await getCredentialStore(options).revoke(clientId);
  return { backupPath, clientId, configPath: definition.configPath, ok: true };
}

module.exports = {
  SERVER_KEY,
  CLIENT_ID_ENV,
  CLIENT_TOKEN_ENV,
  buildServerEntry,
  getClientDefinitions,
  installMcpClient,
  listMcpClients,
  removeMcpClient,
};
