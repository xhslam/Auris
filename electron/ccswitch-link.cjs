"use strict";

/**
 * CC-Switch deep-link builder (issue #1008; wire format corrected in #1361).
 *
 * Builds a `ccswitch://v1/import` deep link that one-click-imports Auris's
 * MCP server into CC-Switch (the cross-CLI config manager).
 *
 * Format (CC-Switch v1):
 *   ccswitch://v1/import?resource=mcp&name=auris-notes&apps=<csv>&config=<urlenc base64 JSON>
 */

const SERVER_ID = "auris-notes";
const DEFAULT_APPS = Object.freeze(["claude", "codex", "grok", "opencode"]);

function buildCcSwitchImportLink(command, args = [], apps = DEFAULT_APPS) {
  const serverConfig = { command };
  if (Array.isArray(args) && args.length > 0) {
    serverConfig.args = args;
  }
  serverConfig.env = { ELECTRON_RUN_AS_NODE: "1" };
  const jsonStr = JSON.stringify({ mcpServers: { [SERVER_ID]: serverConfig } });
  const base64 = Buffer.from(jsonStr, "utf8").toString("base64");
  const config = encodeURIComponent(base64);
  const appList = Array.isArray(apps) ? apps.join(",") : DEFAULT_APPS.join(",");
  return `ccswitch://v1/import?resource=mcp&name=${SERVER_ID}&apps=${appList}&config=${config}`;
}

module.exports = {
  SERVER_ID,
  DEFAULT_APPS,
  buildCcSwitchImportLink,
};
