# MCP browser tools

The authenticated local Notes sidecar exposes Browser and Workflow tools alongside
Notes tools. Start the desktop app first; the sidecar does not bypass the
Electron main authority boundary.

## Enablement prerequisites

MCP server on ≠ browser automation on. Complete both:

1. Start Auris desktop.
2. Open **设置 → 集成 → MCP 服务器** and enable the MCP server.
3. Open **设置 → 集成 → 浏览器自动化** and enable **启用 MCP 浏览器自动化**.
   The toggle is available only after compiled security gates pass. There is no
   environment-variable bypass.
4. Install or refresh the MCP client config under **安装 MCP 配置**, then
   reconnect the client.

Production capability snapshot keeps **named profiles**, **cookie replay**, and
**localStorage replay** off. `session_save` / `session_load` remain in the action
union for contract stability but return `CAPABILITY_NOT_VERIFIED` until a future
product flip with Settings UX and threat-model review. Prefer **AI Sandbox**
(`open`) for automation; do not expect logged-in Human session reuse.

See also [Notes MCP setup](../notes/mcp-agent-setup.md) for sidecar install and
[security model](./security-model.md) for the authority chain.

## Browser action sequence

The Browser action union is:

`get_state`, `open`, `acquire_control`, `release_control`, `close`, `focus`,
`navigate`, `wait`, `wait_for`, `read`, `screenshot`, `query`, `console`, `act`,
`style`, `execute_js`, `session_save`, and `session_load`.

`open` always creates an **AI Sandbox** tab (ephemeral, isolated from the Human
profile). Human / AI Shared tabs are created only through trusted chrome UI.

Use this order:

1. Call `get_state`. If no suitable target exists, call `open`; it creates an
   AI Sandbox target and returns control.
2. Call `acquire_control`, supplying both `windowId` and `tabId` when targeting
   explicitly. Keep the returned generation, epoch, and opaque lease token.
3. Use a fresh `read` or `query` result. Controlled calls must include the exact
   `windowId`, `tabId`, `navigationGeneration`, `controlEpoch`, and `leaseToken`.
4. If the result is `APPROVAL_REQUIRED`, ask the user and retry the same command
   with its `approvalId`. Do not modify the operation or payload.
5. Call `release_control` when finished. Disconnect also releases owner state.

Example inputs contain no credentials:

```json
{ "action": "acquire_control", "windowId": "<window-id>", "tabId": "<tab-id>" }
```

```json
{
  "action": "read",
  "windowId": "<window-id>",
  "tabId": "<tab-id>",
  "navigationGeneration": 3,
  "controlEpoch": 2,
  "leaseToken": "<opaque-token-from-acquire>"
}
```

Never put usernames, passwords, API keys, or bearer tokens in URLs, tool input,
workflow literals, logs, or shell arguments. Configure provider secrets through
the Nia settings UI; if persistence is chosen, Auris stores a Keychain reference
rather than returning the secret.

## Workflow actions

The Workflow tool supports `list`, `inspect`, `validate`, `start`, `get_state`,
`cancel`, and `resume` for `nia_yaml` and `browser_markdown`. Pure
list/inspect/validate operations do not grant execution authority. Both start
capabilities are independently runtime-gated. A Browser Markdown start requires
explicit `window_id` and `tab_id`; Nia YAML runs remain owner-isolated.

`resume` is **browser_markdown-only**. When a run is paused at `confirm`,
`goal`/`nia_review`, or `browser_approval`, call:

```json
{
  "action": "resume",
  "family": "browser_markdown",
  "run_id": "<run-id>",
  "approved": true,
  "approval_id": "<optional-when-browser_approval>"
}
```

Set `approved` to `false` to deny and cancel. Do not claim resume works for
`nia_yaml`.

## Recovery errors

- `AMBIGUOUS_TARGET`: refresh state and provide one explicit window/tab pair.
- `STALE_NAVIGATION`, `CONTROL_STALE`, or `LEASE_LOST`: reacquire and reread.
- `APPROVAL_EXPIRED` or `PAYLOAD_MISMATCH`: request a new approval.
- `OWNER_MISMATCH`: use the connection/run that owns the target.
- `PAGE_CRASHED`: reload or reopen; no lease survives the crash.
- `CAPABILITY_NOT_VERIFIED`: read the public message and `capability` metadata.
  Common cases:
  - `browser-automation-disabled` — enable **启用 MCP 浏览器自动化** in Settings.
  - `browser-automation` — security gates are not verified; update/rebuild; no
    env bypass.
  - `session-replay` / `cookie-replay` / `local-storage-replay` /
    `named-session-profiles` — session replay is intentionally off in
    production; do not retry as if cookies were available.
