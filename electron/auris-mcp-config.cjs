const os = require("node:os");
const path = require("node:path");

const MCP_DISCOVERY_VERSION = 1;

// The notes MCP stdio server (spawned by Claude Code / Codex) discovers the
// running Auris app through a small port file. The directory MUST be identical
// on the writer (Electron main) and the reader (auris-notes-mcp-server.mjs),
// and it must NOT depend on Electron's app name — which is "Electron" in dev
// and "auris" only when packaged. Pin it to a stable, app-name-independent
// location instead.
const DISCOVERY_APP_NAME = "auris";
const MCP_CLIENT_CREDENTIALS_FILE_NAME = "auris-mcp-clients.json";
const NOTES_MCP_DISCOVERY_FILE_NAME = "auris-notes-mcp-port";

function defaultDiscoveryDirectory(
  environment = process.env,
  plat = process.platform,
  home = os.homedir(),
) {

  switch (plat) {
    case "darwin":
      return path.join(home, "Library", "Application Support", DISCOVERY_APP_NAME);
    case "win32":
      return path.join(
        environment.APPDATA || path.join(home, "AppData", "Roaming"),
        DISCOVERY_APP_NAME,
      );
    default:
      return path.join(
        environment.XDG_DATA_HOME || path.join(home, ".local", "share"),
        DISCOVERY_APP_NAME,
      );
  }
}

function getNotesMcpDiscoveryPath(environment = process.env, plat = process.platform) {
  return environment.AURIS_NOTES_MCP_PORT_FILE
    ? path.resolve(environment.AURIS_NOTES_MCP_PORT_FILE)
    : path.join(defaultDiscoveryDirectory(environment, plat), NOTES_MCP_DISCOVERY_FILE_NAME);
}

function getMcpClientCredentialsPath(
  environment = process.env,
  plat = process.platform,
  home = os.homedir(),
) {
  return environment.AURIS_MCP_CLIENT_CREDENTIALS_FILE
    ? path.resolve(environment.AURIS_MCP_CLIENT_CREDENTIALS_FILE)
    : path.join(
        defaultDiscoveryDirectory(environment, plat, home),
        MCP_CLIENT_CREDENTIALS_FILE_NAME,
      );
}

function createDefaultMcpPolicy() {
  return {
    autoApproveEdits: false,
    enabled: false,
    startOnLaunch: true,
  };
}

function normalizeMcpPolicy(value) {
  const defaults = createDefaultMcpPolicy();

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaults;
  }

  const enabled = value.enabled === true;

  return {
    autoApproveEdits: enabled && value.autoApproveEdits === true,
    enabled,
    startOnLaunch:
      typeof value.startOnLaunch === "boolean"
        ? value.startOnLaunch
        : defaults.startOnLaunch,
  };
}

function validateDiscoveryValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Auris MCP discovery record.");
  }

  const { instance_id: instanceId, pid, port, token, version } = value;

  if (
    version !== MCP_DISCOVERY_VERSION ||
    typeof instanceId !== "string" ||
    !instanceId ||
    !Number.isInteger(pid) ||
    pid < 1 ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65_535 ||
    typeof token !== "string" ||
    !token
  ) {
    throw new Error("Invalid Auris MCP discovery record.");
  }

  return { instanceId, pid, port, token, version };
}

function serializeMcpDiscovery({ instanceId, pid, port, token }) {
  return JSON.stringify({
    instance_id: instanceId,
    pid,
    port,
    token,
    version: MCP_DISCOVERY_VERSION,
  });
}

function parseMcpDiscovery(content) {
  try {
    return validateDiscoveryValue(JSON.parse(content));
  } catch (error) {
    if (error instanceof Error && /Invalid Auris MCP discovery record/.test(error.message)) {
      throw error;
    }

    throw new Error("Invalid Auris MCP discovery record.");
  }
}

module.exports = {
  MCP_DISCOVERY_VERSION,
  MCP_CLIENT_CREDENTIALS_FILE_NAME,
  NOTES_MCP_DISCOVERY_FILE_NAME,
  createDefaultMcpPolicy,
  defaultDiscoveryDirectory,
  getMcpClientCredentialsPath,
  getNotesMcpDiscoveryPath,
  normalizeMcpPolicy,
  parseMcpDiscovery,
  serializeMcpDiscovery,
};
