# Phase 4 handoff — Browser security & automation enablement

Pinned upstream: [`xiaolai/vmark@7c409688dc510d87183bdc46308e1ee645c2579f`](https://github.com/xiaolai/vmark/commit/7c409688dc510d87183bdc46308e1ee645c2579f).

## Gate evidence (2026-07-20)

| Gate | Result |
|---|---|
| `npm run test -- tests/unit/electron/browser tests/unit/electron/security tests/component/settings/auris-settings-browser-grants.test.tsx tests/component/settings/auris-settings-browser-security.test.tsx` | **315** passed |
| `npm run test:integration -- tests/integration/browser-authority-adversarial.test.ts` | **6** passed |
| `npm run test:mcp-browser` | **3** passed (AiSandbox research loop + failure paths) |
| `npm run browser:isolation` | passed |
| `npm run browser:partition-isolation` | passed |
| `npm run browser:human-reclaim` | passed |
| `npm run browser:security` | passed |
| `npm run browser:session` | passed (smoke may mark session replay locally; production defaults remain off) |
| `npm run browser:dialog-feasibility` | passed |
| `npm run browser:ux-policy` | passed |
| `npm run browser:crash-recovery` | passed |
| `npm run browser:smoke` | passed (restart persistence boundary for retained Human tabs/bookmarks) |
| Mode authority (Human / AiSandbox / AiShared) | unit: `browser-mode-authority.test.ts` + partition isolation smoke; MCP stdio research loop remains AiSandbox-only |
| Process restart authority wipe | grants / attachments / leases / approvals are memory-only; AiSandbox partition is non-persistent; retained Human window metadata may restore without authority |
| `npm run lint` | passed (warnings only in smoke fixtures if any) |
| `npm run build` | passed |
| `npm run security:secrets` | passed |
| `git diff --check` | passed |
| `npm run vmark:diff -- --upstream 7c409688…` | **blocked**: GitHub unreachable (`GIT_FETCH_FAILED`). Refresh `docs/vmark-sync/latest.*` when network recovers. |

## Production capability flags (post Task 8)

| Flag | Production default | Notes |
|---|---|---|
| `securityVerified` / `production` (browser surface) | **true** after compiled Phase 4 gates | Enables `openBrowser` + **Nia 浏览器** menu |
| `browserAutomationEnabled` (user toggle) | **false** | MCP `browserMcpDispatcher` composed only when user enables in Settings → 集成 |
| `eval.scope` | `ai-sandbox-nonpersistent-no-session` | Exact-approved `execute_js` only in pristine AiSandbox |
| `namedProfiles` / `cookieReplay` / `localStorageReplay` | **false** | Independent session gates; smoke can verify Keychain path without flipping production defaults |
| Standing grants / attachments | session-scoped (memory) | Exposed in grant center; cleared on quit |

## Authority invariants completed in Phase 4

1. **Operation guard** is the single authorize path (lease, origin, attachment, one-shot/standing, payload binding, navigation policy).
2. **Three modes** select immutable partitions; Human reclaim rotates control epoch from trusted Electron input only.
3. **Keychain session refs** store ciphertext + metadata only; session-injected tabs hard-deny `execute_js`.
4. **Fail-closed UX** covers dialogs, downloads, TLS, login cancel, context menu, print, DevTools, fullscreen.
5. **Crash budget / hibernation** recover UI metadata without restoring authority.
6. **Redacted audit** is diagnostics-only (no restore APIs; no secrets/tokens/payload hashes).
7. **Enablement** requires compiled security gates + explicit user automation toggle (no env bypass).

## Still gated / unavailable (handoff to Phase 5+)

- Named session profiles and cookie / localStorage replay remain **off** in production capability defaults until product chooses to flip independent session gates after reviewed live evidence.
- MCP stdio research-loop helper still opens **AiSandbox only**; Human / AiShared MCP end-to-end loops are not a Phase 4 production path.
- Live `vmark:diff` refresh against GitHub is blocked in this environment.
- Phase 5 Nia / workflow surfaces remain out of scope.

## Operator notes

- Agent shells must unset `ELECTRON_RUN_AS_NODE` for Electron smokes (`env -u ELECTRON_RUN_AS_NODE` is wired into `browser:*` scripts; `browser:smoke` also strips it from spawned children).
- Enable MCP browser automation only after reviewing Settings → 集成 → 浏览器自动化.
- Phase 5 entry: Nia workflows on top of the hardened browser authority already in main.
