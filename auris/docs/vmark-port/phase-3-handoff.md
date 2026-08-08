# Phase 3 handoff — MCP browser research loop

Pinned upstream: [`xiaolai/vmark@7c409688dc510d87183bdc46308e1ee645c2579f`](https://github.com/xiaolai/vmark/commit/7c409688dc510d87183bdc46308e1ee645c2579f).

## Gate evidence (2026-07-20)

| Gate | Result |
|---|---|
| Notes/MCP + `tests/unit/electron/browser` + `tests/unit/browser` (+ related component) | **601** passed |
| `npm run test:mcp-browser` | **3** passed (also under `--sequence.shuffle`) |
| `npm run browser:smoke` | passed |
| `npm run browser:isolation` | passed |
| Production automation composition | `browserMcpDispatcher` remains `null` in `electron/main.cjs`; no `createBrowserCommandDispatcher` require; `localFixtureEnabled: true` absent from production main |
| `npm run lint` | passed |
| `npm run build` | passed |
| `npm run security:secrets` | passed |
| `git diff --check` | passed |
| `npm run vmark:diff -- --upstream 7c409688…` | **blocked**: GitHub TLS/SSH unreachable from this environment (`GIT_FETCH_FAILED`). Manifest + this handoff record Phase 3 delivery; refresh `docs/vmark-sync/latest.*` when network recovers. |

Stdio loop proof lives in `tests/integration/mcp-browser-*.test.ts` against `tests/helpers/electron-browser-test-app.cjs`. No secrets, lease tokens, or raw approval payload hashes were committed in transcripts.

Manual production-client success verification is deferred to Phase 4 after production enablement exists.

## Lease / approval invariants already implemented

1. **Main is the only authority.** Browser MCP commands terminate in Electron main (`browser-command-dispatcher.cjs`). Renderer chrome never executes parked commands; it only resolves approvals.
2. **Connection-scoped leases.** Tokens are random, compared timing-safely, stored as hashes, and never appear in snapshots/logs/public errors.
3. **Two-call one-shot approvals only.** First call returns typed `APPROVAL_REQUIRED` with opaque `approvalId` / `target-*` aliases; retry must match owner, window/tab, generation, control epoch, origin, operation, and payload hash. Standing grants are not available.
4. **AiSandbox only for Phase 3 MCP open.** Shared non-persistent partition; Human / AiShared acquisition and public `execute_js` / session save-load return `CAPABILITY_NOT_VERIFIED`.
5. **Disconnect / close / navigation invalidate authority.** Pending approvals cancel; ownership releases; CDP targets receive irreversible terminal tombstones for closed tabs/windows.
6. **Evidence is revision-safe and vault-free.** Normalized evidence attaches to Notes pending review only; browser code never writes the vault directly; secrets/metadata are stripped.

## Remaining Phase 4 surfaces

> **Superseded (2026-07-20):** Phase 4 delivery is recorded in
> [`phase-4-handoff.md`](./phase-4-handoff.md). The bullets below are historical
> Phase 3 exit criteria.

- Standing grants (beyond deny / allow-once)
- Attachments / automation modes beyond mandatory AiSandbox
- Keychain-backed session references
- Hardened browser-owned UX policy surfaces
- Crash budgets, hibernation, authority-free recovery
- Live macOS capability gates and production `browserMcpDispatcher` composition behind an explicit enablement policy (no env bypass)

## Operator notes

- Integration Electron children must unset `ELECTRON_RUN_AS_NODE` (Cursor/agent shells often set it, which makes `require("electron")` return the binary path).
- Run the research loop with: `npm run test:mcp-browser`.
