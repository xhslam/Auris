# Auris VMark Port Phase 3: MCP Browser Research Loop Implementation Plan

> **Status (2026-07-20):** Phase 3 gate passed. Evidence: `auris/docs/vmark-port/phase-3-handoff.md`. Live `vmark:diff` refresh was blocked by GitHub TLS from the gate environment; re-run when network recovers.

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing Auris stdio MCP entry point with a real browser research loop that opens, observes, acts, verifies, assembles evidence, and proposes revision-safe Note updates.

**Architecture:** The existing MCP server and authenticated loopback bridge remain compatibility anchors. Browser commands terminate in a new Electron-main dispatcher; only Notes methods continue to the renderer workbench. A minimal connection-scoped lease and two-call approval core protects the Phase 3 loop, while Phase 4 adds the complete grant/session/partition hardening before automation is enabled by default.

**Tech Stack:** MCP stdio server, authenticated WebSocket bridge, Electron main, isolated-world `webContents.executeJavaScript`, Zod, Vitest, local HTTP fixtures.

---

## Preconditions and delivery guard

- Phases 1–2 pass, including browser isolation smoke.
- Refresh and review the pinned VMark report before editing.
- Keep browser automation behind `browserAutomationEnabled: false` in normal user settings until Phase 4 passes. Tests use an injected explicit enablement policy, never a hidden environment bypass in production code.
- Existing Notes MCP names, schemas, discovery, and revision-safe review must remain compatible.

## Task 1: Add grouped Browser MCP schemas without changing Notes tools

**Files:**

- Modify: `auris/electron/auris-notes-mcp-server.mjs`
- Create: `auris/electron/mcp/browser-tool-contract.mjs`
- Modify: `auris/tests/unit/electron/auris-notes-mcp-server.test.ts`
- Create: `auris/tests/unit/electron/browser/browser-tool-contract.test.ts`

- [ ] Add failing server-list tests expecting exactly one additive `auris_browser` grouped tool while all existing Notes tool names/descriptions/input schemas remain byte-equivalent snapshots.
- [ ] Add failing discriminated-union tests for every Phase 1 Browser action, strict unknown-key rejection, size bounds, required target/control envelope fields, and safe result/error shapes.
- [ ] Add timeout tests proving existing Notes requests retain their exact fixed ten-second behavior, each Browser action timeout is explicit, Browser `action timeout < transport timeout` by a small fixed margin, and approval-producing requests return promptly rather than holding either path.
- [ ] Run the two narrow tests and confirm failure.
- [ ] Implement `browser-tool-contract.mjs` as an ESM description adapter that imports the canonical `electron/shared/browser-contract.cjs` validators/constants. Keep the server name/path compatible; do not fork a second sidecar or redefine the wire union.
- [ ] Route valid `auris_browser` calls through the existing authenticated client with a per-action execution timeout and a slightly larger transport timeout. Ensure approval time is excluded because `APPROVAL_REQUIRED` is a completed response.
- [ ] Rerun tests and commit: `git commit -m "feat: add grouped Browser MCP contract"`.

## Task 2: Route browser families to Electron main

**Files:**

- Modify: `auris/electron/notes-mcp-bridge.cjs`
- Create: `auris/electron/browser/browser-mcp-router.cjs`
- Modify: `auris/electron/main.cjs`
- Modify: `auris/tests/unit/electron/notes-mcp-bridge.test.ts`
- Create: `auris/tests/unit/electron/browser/browser-mcp-router.test.ts`

- [ ] Write failing routing tests: Notes methods still forward to the main renderer; Browser methods call an injected main-process dispatcher; Workflow methods are rejected until Phase 5; all unknown families fail closed.
- [ ] Add connection-lifecycle tests for random `connectionId`, bounded pending requests, disconnect cancellation, timeout cleanup, and late-result discard.
- [ ] Run the tests and confirm failure.
- [ ] Implement explicit method-family routing. Pass connection identity and an `AbortSignal` to the browser dispatcher; never pass a renderer-supplied authority object through unchecked.
- [ ] Add bridge shutdown hooks to release browser ownership and cancel pending approvals for that connection.
- [ ] Keep WebSocket discovery/token behavior unchanged and rerun the full existing bridge test file.
- [ ] Commit: `git commit -m "feat: route Browser MCP commands to main"`.

## Task 3: Implement main-process target resolution and lease foundation

**Files:**

- Create: `auris/electron/browser/browser-command-dispatcher.cjs`
- Create: `auris/electron/browser/browser-lease.cjs`
- Create: `auris/electron/browser/browser-partitions.cjs`
- Create: `auris/tests/unit/electron/browser/browser-command-dispatcher.test.ts`
- Create: `auris/tests/unit/electron/browser/browser-lease.test.ts`
- Create: `auris/tests/unit/electron/browser/browser-partitions.test.ts`

- [ ] Write failing tests that `get_state` needs no lease, `open` returns a new owner-bound token/control envelope, `acquire_control` binds an eligible tab, `release_control` is token-required and idempotent for the released owner, and all page commands reject absent/mismatched/stale tokens.
- [ ] Add failing Phase 3 isolation tests: MCP `open` always creates an `AiSandbox` tab in one shared non-persistent partition; `open` cannot fall back to the Human persistent session; `acquire_control` rejects Human/AiShared tabs with `CAPABILITY_NOT_VERIFIED` until Phase 4 attachment/mode authority lands.
- [ ] Add ambiguity tests: no implicit selection with multiple eligible windows/tabs; safe metadata includes IDs/title/redacted URL only.
- [ ] Add honest capability tests: Phase 3 returns `CAPABILITY_NOT_VERIFIED` for `session_save`, `session_load`, Human/AiShared acquisition, and public `execute_js` while still listing their contract shapes; no fallback execution is allowed.
- [ ] Add replay tests for wrong connection, wrong tab, wrong generation, wrong control epoch, release, navigation, tab close, window close, and disconnect.
- [ ] Run the narrow tests and confirm failure.
- [ ] Implement tokens with `crypto.randomBytes`, compare with timing-safe semantics, store only an in-memory hash, and never include the token in snapshots/logs/errors.
- [ ] Implement the minimum immutable partition selector needed for `AiSandbox`, install Phase 2 deny-by-default page policy on it, and keep Human/AiShared automation unavailable. Phase 4 extends this same module rather than replacing it.
- [ ] Separate `navigationGeneration` from `controlEpoch`; rotate control on ownership changes and both on document-identity changes.
- [ ] Compose lifecycle methods first; leave actual page actions delegated to the executor in Task 5.
- [ ] Rerun tests and commit: `git commit -m "feat: add main-authoritative browser command leases"`.

## Task 4: Implement the asynchronous two-call approval core

**Files:**

- Create: `auris/electron/browser/browser-approvals.cjs`
- Modify: `auris/electron/browser/browser-command-dispatcher.cjs`
- Modify: `auris/electron/browser/browser-ipc.cjs`
- Modify: `auris/src/features/browser/browser-bridge.ts`
- Create: `auris/src/components/browser-window/browser-approval-dialog.tsx`
- Modify: `auris/src/components/browser-window/browser-window-shell.tsx`
- Create: `auris/tests/unit/electron/browser/browser-approvals.test.ts`
- Create: `auris/tests/component/browser-window/browser-approval-dialog.test.tsx`
- Modify: `auris/tests/component/browser-window/browser-window-shell.test.tsx`

- [ ] Write failing tests for first-call `APPROVAL_REQUIRED`, opaque `approval_id`, safe descriptor, owner-bound retry, atomic one-shot consumption, expiry, deny, navigation/control loss, close, disconnect, payload substitution, and bounded pending count.
- [ ] Add a test that no pending MCP request remains while the user decides.
- [ ] Run unit/component tests and confirm failure.
- [ ] Implement in-memory pending approvals bound to connection/owner/window/tab/generation/control epoch/origin/operation/target/payload hash.
- [ ] Add chrome snapshot and `resolveApproval` IPC. Main revalidates the exact binding on retry; the UI never executes the parked command.
- [ ] Mount the approval dialog in the real browser window shell. Add shell tests for pending descriptor rendering, deny, allow-once, expired/invalidated disappearance, keyboard focus, and unsubscribe on shell unmount; the real MCP loop must resolve through this chrome IPC, not a test-only approval hook.
- [ ] In Phase 3 expose only deny and exact one-shot approval. Standing grants arrive in Phase 4.
- [ ] Rerun tests and commit: `git commit -m "feat: add two-call browser approvals"`.

## Task 5: Implement bounded page observation and action execution

**Files:**

- Create: `auris/electron/browser/browser-page-executor.cjs`
- Create: `auris/electron/browser/page-scripts/observe.js`
- Create: `auris/electron/browser/page-scripts/act.js`
- Create: `auris/electron/browser/page-scripts/wait-for.js`
- Create: `auris/tests/unit/electron/browser/browser-page-executor.test.ts`
- Create: `auris/tests/fixtures/browser/research-form.html`
- Create: `auris/tests/fixtures/browser/delayed-content.html`
- Modify: `auris/electron/browser/browser-command-dispatcher.cjs`

- [ ] Write failing executor tests for `navigate`, `wait`, `wait_for`, `read`, `query`, `console`, `act` variants, `screenshot`, `style`, and internal `execute_js`. Prove `style` is exact-payload-bound; prove the public dispatcher returns `CAPABILITY_NOT_VERIFIED` for `execute_js` throughout Phase 3 even after approval.
- [ ] Add stale-ref tests: refs are usable only on the tab/generation that issued them. Add timeout, cancellation, oversized result, detached node, hidden target, disabled target, and navigation-during-action cases.
- [ ] Run the narrow test and confirm failure.
- [ ] Load fixed observation/action script assets from disk and execute them in an isolated world. Pass structured arguments; do not interpolate selector/text/secret values into source strings. Execute approved `execute_js` as bounded caller code in the page world only after exact hash validation; cap time/result and treat navigation as invalidation.
- [ ] Keep `execute_js` capability-gated off at the dispatcher after implementing its bounded internal executor. Phase 4 may enable it only for a pristine `AiSandbox` tab with no loaded session capability; Human, AiShared, and session-injected tabs remain hard denied because arbitrary JS can exfiltrate cookie/localStorage through direct or DOM side channels.
- [ ] Reuse Phase 1 observation algorithms/budgets. Capture console data through bounded main-process listeners that redact URL credentials and cap entry count/size.
- [ ] Screenshot to an Auris-owned temporary evidence file with random name and lifecycle cleanup; return a reference, not base64 inside normal logs.
- [ ] Wire the dispatcher only after lease and approval validation, then verify post-action generation/control again before returning.
- [ ] Rerun tests and commit: `git commit -m "feat: execute bounded browser research actions"`.

## Task 6: Assemble evidence bundles and preserve Notes revision safety

**Files:**

- Create: `auris/src/features/browser/evidence.ts`
- Create: `auris/electron/browser/browser-evidence.cjs`
- Modify: `auris/electron/auris-notes-mcp-server.mjs`
- Modify: `auris/src/features/notes/workbench/notes-mcp-contract.ts`
- Modify: `auris/src/features/notes/workbench/notes-mcp-request-handler.ts`
- Create: `auris/tests/unit/browser/evidence.test.ts`
- Modify: `auris/tests/unit/electron/auris-notes-mcp-server.test.ts`
- Modify: `auris/tests/unit/notes/notes-mcp-contract.test.ts`
- Modify: `auris/tests/unit/notes/notes-mcp-request-handler.test.ts`

- [ ] Write failing evidence tests for final redacted URL/title/origin/access time, bounded excerpts, generation-scoped refs, screenshot references, approval trace, and source-to-draft citations.
- [ ] Add adversarial tests proving lease tokens, Keychain/session identifiers, typed secret payloads, and raw approval payload hashes are excluded.
- [ ] Write a failing additive Notes contract test for attaching an evidence bundle to an existing revision-safe proposal without changing stale-revision semantics.
- [ ] Add a failing real sidecar-schema test proving `auris_document` accepts the bounded optional evidence bundle and still rejects unknown/oversized/secret-bearing evidence fields; snapshot all pre-existing inputs to prove compatibility.
- [ ] Run the narrow tests and confirm failure.
- [ ] Implement immutable evidence normalization and an additive optional evidence field. Keep explicit visible page content when the user/agent requested a read; redact only Auris-managed secrets and unsafe metadata duplication.
- [ ] Extend the `auris_document` Zod schema in `auris-notes-mcp-server.mjs` with the same strict value-free evidence metadata contract so the real stdio path can carry it; do not pass arbitrary page objects through the sidecar.
- [ ] Reuse the current Notes review UI and handler; do not let browser code write the note vault directly.
- [ ] Rerun all Notes MCP tests and commit: `git commit -m "feat: attach browser evidence to Notes proposals"`.

## Task 7: Prove the loop with a real stdio MCP client

**Files:**

- Create: `auris/tests/integration/mcp-browser-research-loop.test.ts`
- Create: `auris/tests/integration/mcp-browser-failure-paths.test.ts`
- Create: `auris/tests/helpers/stdio-mcp-client.ts`
- Create: `auris/tests/helpers/electron-browser-test-app.cjs`
- Modify: `auris/tests/fixtures/browser/research-form.html`
- Modify: `auris/package.json`

- [ ] Write an initially failing integration test that launches an explicit Electron test-app composition plus the real `electron/auris-notes-mcp-server.mjs`, authenticates through the real bridge, opens the local fixture in mandatory non-persistent `AiSandbox`, receives/approves/retries an action, reads, types/clicks, waits for result, screenshots, and builds evidence.
- [ ] Complete the loop by proposing a Note edit against a known revision and assert the existing review/stale-revision path receives the evidence.
- [ ] Add failure tests for ambiguous target, wrong token, stale generation, denied/expired approval, unsupported operation, page timeout, bridge disconnect, and sidecar process exit.
- [ ] Make the test-app composition accept only its random loopback fixture origin and injected automation policy; it must not be imported by production bootstrap. Add `"test:mcp-browser": "vitest run --config vitest.integration.config.ts tests/integration/mcp-browser-*.test.ts"`.
- [ ] Run `npm run test:mcp-browser`; confirm the first expected failure, implement only missing glue, and rerun to green.
- [ ] Repeat the suite with randomized test order and assert no lease/approval survives between connections.
- [ ] Commit: `git commit -m "test: prove MCP browser research loop"`.

## Task 8: Phase gate and handoff

- [x] Run all existing MCP/Notes regression tests plus `tests/unit/electron/browser` and `tests/unit/browser`; run integration separately with `npm run test:mcp-browser`.
- [x] Run browser window/isolation smoke against the local fixtures.
- [x] Inspect the real stdio transcript produced by the explicit test-app composition; do not record secrets or lease tokens. Move manual production-client success verification to Phase 4 after production enablement exists.
- [x] Verify production settings still report browser automation disabled pending Phase 4.
- [x] Run `npm run lint`, `npm run build`, `npm run security:secrets`, and `git diff --check`.
- [x] Refresh/review the VMark report and commit report-only changes if needed: `git commit -m "docs: record phase three VMark comparison"`.
- [x] Handoff Phase 4 with the exact lease/approval invariants already implemented and an explicit list of remaining surfaces: standing grants, attachments/modes, Keychain sessions, hardened UX policy, crash/hibernation, and live macOS capability gates.
