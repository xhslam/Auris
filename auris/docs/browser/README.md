# Auris browser

Auris desktop provides native Electron browser windows alongside the main
Notes window. Each browser window and tab has a stable identity, and the main
window's **Browser status** center shows redacted activity, lifecycle, control,
workflow, and approval state. Focusing a row changes only visible UI focus; it
does not grant or transfer automation authority.

## Windows, tabs, and modes

- **Human** uses the persistent human partition. Human tabs selected for
  retention can restore on relaunch; navigation history is otherwise a live
  tab/session concern.
- **AI Sandbox** uses an ephemeral, non-persistent partition isolated from the
  human profile. MCP `open` creates this mode by default.
- **AI Shared** deliberately shares the human partition, requires explicit UI
  confirmation when created, and still requires normal attachment, lease,
  origin, operation, and approval checks.

The window menu can create a separate browser window, create a tab in a chosen
window, focus a target, or close a window. External callers must supply explicit
window and tab IDs when more than one target is possible; Auris returns
`AMBIGUOUS_TARGET` instead of guessing. Closing, navigating, hibernating,
crashing, or human-reclaiming a target invalidates stale control.

Bookmarks are stored as exact normalized HTTP(S) URLs and titles. Only retained
Human tabs are eligible for restart restoration. AI tabs, pending approvals,
leases, workflow authority, page references, and transient history are not
restored as authority after process exit.

## Capability boundary

Browser automation is available only after the compiled security gates pass and
the user enables it in Settings. Named profiles, cookie replay, and localStorage
replay currently remain **disabled** in the production capability snapshot — that
is intentional. Exact approved JavaScript evaluation is restricted to
non-persistent AI Sandbox tabs without injected Human/Keychain session material.

Start the desktop app with `npm run desktop:dev` during development or
`npm run desktop:start` after a Next.js build. See:

- [Security model](./security-model.md)
- [MCP browser tools](./mcp-tools.md)
- [Nia and workflows](./nia-and-workflows.md) (includes the in-app Nia browser tool loop)

## Troubleshooting

- **Approval required:** approve the exact payload in the browser window, then
  retry once with the returned `approvalId`. Any changed payload needs a new
  approval.
- **Stale navigation/control or lost lease:** call `get_state`, acquire control
  again, and rebuild page references from a fresh `read` or `query`.
- **Ambiguous target:** choose a unique `windowId` and `tabId`; UI focus is not a
  targeting shortcut for MCP or workflows.
- **Keychain unavailable:** keep provider credentials memory-only for this run,
  or restore macOS Keychain access before selecting “remember on this Mac.”
- **Crash budget reached:** reload manually or close/reopen the tab. Auris does
  not silently restore automation authority after a crash.
- **Provider cancelled/timed out:** inspect the Nia provider, retry with a
  bounded prompt, and do not assume a late provider result was applied.
- **VMark review:** run `npm run vmark:diff -- --upstream <reviewed-commit>` and
  inspect both files under `docs/vmark-sync/`. The command is read-only with
  respect to product source and never auto-ports upstream changes.
