/**
 * CC-Switch deep-link builder (issue #1008; wire format corrected in #1361).
 *
 * Builds a `ccswitch://v1/import` deep link that one-click-imports Auris's
 * MCP server into CC-Switch (the cross-CLI config manager).
 *
 * Format (CC-Switch v1):
 *   ccswitch://v1/import?resource=mcp&name=auris-notes&apps=<csv>&config=<urlenc base64 JSON>
 */

export const SERVER_ID = "auris-notes";
export const DEFAULT_APPS = ["claude", "codex", "grok", "opencode"];

function base64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function buildCcSwitchImportLink(
  command: string,
  args: string[] = [],
  apps: string[] = DEFAULT_APPS,
): string {
  const serverConfig: Record<string, unknown> = { command };
  if (args && args.length > 0) {
    serverConfig.args = args;
  }
  serverConfig.env = { ELECTRON_RUN_AS_NODE: "1" };
  const config = encodeURIComponent(
    base64Utf8(JSON.stringify({ mcpServers: { [SERVER_ID]: serverConfig } })),
  );
  return `ccswitch://v1/import?resource=mcp&name=${SERVER_ID}&apps=${apps.join(",")}&config=${config}`;
}
