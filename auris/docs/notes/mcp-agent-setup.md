# Auris Notes MCP setup

`auris-notes` is a local, standard MCP server for the selected Auris Notes vault. It never exposes arbitrary host paths, terminal access, account data, or unrelated application settings.

## Prerequisites

1. Start Auris desktop.
2. Open **设置 → MCP 服务**, enable the service, and keep automatic approval off unless you trust the agent.
3. Open the Notes workspace (`/notes`) and select a vault.
3. Ensure Node.js is available to the MCP client process.

The server discovers the running desktop app through a short-lived file in Auris user data. On macOS the default location is `~/Library/Application Support/auris/auris-notes-mcp-port`. If your Electron user-data directory is customised, set `AURIS_NOTES_MCP_PORT_FILE` to the exact file path in the MCP client environment.

## Server command

Use `node` directly. Do not put `npm run mcp:notes` in a client configuration: package-manager output can corrupt the stdio MCP protocol.

```json
{
  "command": "node",
  "args": [
    "/absolute/path/to/auris/electron/auris-notes-mcp-server.mjs"
  ]
}
```

The server exposes six composite tools.

| Tool | Actions | Use |
| --- | --- |
| `auris_session` | `get_state` | Discover the selected vault, open tabs, active tab, dirty state, and revisions. Call this first. |
| `auris_workspace` | `new`, `open`, `save`, `close`, `switch_tab` | Manage only vault-relative Markdown note tabs. `close` refuses a dirty tab unless `force` is explicit. |
| `auris_document` | `read`, `write` | Read or revision-safely replace a complete open Markdown document. |
| `auris_selection` | `get`, `set` | Read or revision-safely replace the current editor selection. |
| `auris_browser` | see browser docs | Control the desktop browser under lease + approval. Requires a separate Settings toggle. |
| `auris_workflow` | `list`…`cancel`, `resume` | Start/inspect `nia_yaml` and `browser_markdown` runs. `resume` is browser_markdown-only after confirm/goal/approval pauses. |

## Browser tools

Notes MCP and Browser MCP share the same sidecar process. Enabling the MCP
server alone does **not** authorize browser automation.

1. Enable **设置 → 集成 → 浏览器自动化 → 启用 MCP 浏览器自动化** (only when
   security gates are verified).
2. Follow the action sequence in [Browser MCP tools](../browser/mcp-tools.md).

`open` creates an AI Sandbox tab. Cookie / localStorage / named-profile replay
stays off in the production capability snapshot.

## Safe editing sequence

1. Call `auris_session` with `action: "get_state"`.
2. Call `auris_document` with `action: "read"` or `auris_selection` with `action: "get"`.
3. For an edit, use `auris_document` `write` or `auris_selection` `set` with the returned `expected_revision`.
4. If the tool returns a `STALE` error, the note changed after the read. Read it again, reconcile the intended change, and retry once with the new revision.

## Troubleshooting

- `NOTES_UNAVAILABLE`: Auris is not running, MCP is disabled, `/notes` is not open, or no active note/editor is ready. Enable MCP, open the selected note, and call `get_state` again.
- Discovery-file error: start Auris first. For custom Electron user-data locations, set `AURIS_NOTES_MCP_PORT_FILE` in your agent configuration.
- Authentication error: restart Auris and the MCP client. Discovery tokens are regenerated every app launch.
- `STALE`: do not retry the same edit blindly; re-read first.

For a local health check that does not need Auris running:

```bash
node /absolute/path/to/auris/electron/auris-notes-mcp-server.mjs --health-check
```
