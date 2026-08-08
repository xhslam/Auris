# Auris VMark Port Phase 4: Browser Security, Sessions, and Resilience Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the main-authoritative operation guard, grants, mode isolation, Keychain-backed sessions, fail-closed browser surfaces, and lifecycle resilience required to safely enable MCP browser automation.

**Architecture:** One operation guard composes target resolution, lease, navigation/control epochs, origin policy, attachment, exact one-shot/standing grants, target/payload binding, and feature capability gates. Browser session partitions are selected from immutable automation mode. Auris-managed secrets are encrypted through Electron `safeStorage` (macOS Keychain-backed) and never enter page/MCP/workflow/log output. Recovery reconstructs safe UI state but never authority.

**Tech Stack:** Electron session/permission APIs, `safeStorage`, SQLite, Node crypto, WebContentsView lifecycle events, Vitest, Electron/macOS adversarial smoke tests.

---

## Preconditions

- Phases 1–3 pass; production browser automation remains disabled.
- Review the pinned VMark report and Phase 3 lease/approval handoff before changing authority code.
- Any inability to prove a capability results in an honest feature gate, not a permissive fallback.

## Task 1: Implement the closed operation policy and authoritative guard

**Files:**

- Create: `auris/electron/browser/browser-operation-policy.cjs`
- Create: `auris/electron/browser/browser-operation-guard.cjs`
- Create: `auris/electron/browser/browser-navigation-policy.cjs`
- Create: `auris/tests/unit/electron/browser/browser-operation-policy.test.ts`
- Create: `auris/tests/unit/electron/browser/browser-operation-guard.test.ts`
- Create: `auris/tests/unit/electron/browser/browser-navigation-policy.test.ts`
- Modify: `auris/electron/browser/browser-command-dispatcher.cjs`

- [x] Write a failing exhaustive table test that assigns every closed authority operation (`read`, `attach`, `click`, `type`, `scroll`, `key`, `style`, `navigate`, `publish`, `upload`, `eval`, `session`) a mode/origin/attachment/approval/payload/timeout policy and fails when a new operation lacks a row.
- [x] Add exhaustive tests that main derives the authority operation from the tool/workflow action and rejects any caller-supplied mismatch; `upload` stays human-only, while `eval` and `session` are never standing-grantable and require fresh exact per-call approval.
- [x] Write guard-order tests proving cheap structural validation occurs before authority lookup and final generation/control/target checks occur immediately before execution.
- [x] Add adversarial cases for owner substitution, target substitution, payload substitution, redirect origin change, stale refs, reused tab IDs, policy epoch change, concurrent retry, and time-of-check/time-of-use navigation.
- [x] Add failing AI-navigation tests for trimming, HTTP(S)-only, backslashes, URL credentials, malformed/special schemes, loopback outside explicit development policy, private/link-local/multicast/shared/documentation/special-use IPs, metadata hostnames, IPv4-in-IPv6/alternative numeric forms, DNS resolution to a blocked address, redirect to a blocked address, and DNS rebinding between checks. Keep human omnibox policy separate.
- [x] Run the three policy/guard/navigation test files and confirm failure.
- [x] Implement one `authorize(command, context)` result union: `allowed`, `approval-required`, or a typed denial. Do not distribute partial checks across IPC, renderer, and executor.
- [x] Implement navigation resolution with injected DNS/network metadata, bounded resolution timeout, all-address validation, and destination revalidation on every redirect/commit. Rotate `policyEpoch` whenever relevant settings or partition capability changes.
- [x] Require the dispatcher to call the guard before every observation/action/session/close/workflow command and to revalidate after asynchronous waits before committing a result.
- [x] Rerun tests and commit: `git commit -m "feat: centralize browser operation authority"`.

## Task 2: Complete one-shot, standing grant, and attachment semantics

**Files:**

- Create: `auris/electron/browser/browser-grants.cjs`
- Modify: `auris/electron/browser/browser-approvals.cjs`
- Modify: `auris/electron/browser/browser-operation-guard.cjs`
- Modify: `auris/electron/browser/browser-ipc.cjs`
- Modify: `auris/electron/preload.cjs`
- Modify: `auris/src/platform/desktop/desktop-bridge.ts`
- Modify: `auris/src/components/browser-window/browser-approval-dialog.tsx`
- Create: `auris/src/components/browser-window/browser-grant-center.tsx`
- Modify: `auris/src/components/settings/auris-settings.tsx`
- Create: `auris/tests/unit/electron/browser/browser-grants.test.ts`
- Create: `auris/tests/unit/electron/browser/browser-grants-ipc.test.ts`
- Create: `auris/tests/component/browser-window/browser-grant-center.test.tsx`
- Create: `auris/tests/component/settings/auris-settings-browser-grants.test.tsx`

- [x] Write failing tests for exact one-shots, in-memory standing grants keyed by origin+operation, explicit revocation, process-exit loss, retry consumption, and non-consumption of standing grants.
- [x] Write failing Human-tab attachment tests for `once` and `until-navigation`, including revoke, navigation invalidation, human reclaim, tab close, and process exit.
- [x] Add tests that standing navigation grants do not authorize read/type/click/session operations and that subdomain/scheme/port changes do not inherit an origin grant.
- [x] Run tests and confirm failure.
- [x] Implement grants in memory only. Never serialize grants, attachments, approvals, leases, tokens, or control epochs to the database.
- [x] Add approval UI choices only when policy allows: deny, exact once, attach once/until-navigation, or remember origin+operation for this process.
- [x] Add a grant center that shows safe descriptors and revokes through main IPC; renderer dismissal is not revocation.
- [x] Expose a fixed-channel, read/revoke-only grant API through the trusted main-window preload/desktop bridge. Bind calls to the registered Auris renderer; no page/browser action method is exposed there.
- [x] Mount the current-run grant center in the actual `AurisSettings` MCP/browser section. Test live subscription, immediate revoke, process-restart empty state, capability-unavailable state, and unsubscribe on settings unmount.
- [x] Rerun tests and commit: `git commit -m "feat: complete browser grants and attachments"`.

## Task 3: Enforce the Human, AiSandbox, and AiShared mode-authority matrix

**Files:**

- Modify: `auris/electron/browser/browser-partitions.cjs`
- Modify: `auris/electron/browser/browser-surface-manager.cjs`
- Modify: `auris/electron/browser/browser-window-manager.cjs`
- Modify: `auris/electron/browser/browser-command-dispatcher.cjs`
- Modify: `auris/electron/browser/browser-operation-guard.cjs`
- Modify: `auris/electron/browser/browser-ipc.cjs`
- Modify: `auris/electron/mcp/browser-tool-contract.mjs`
- Modify: `auris/src/features/browser/browser-bridge.ts`
- Modify: `auris/src/components/browser-window/browser-window-shell.tsx`
- Modify: `auris/src/components/browser-window/browser-status-pill.tsx`
- Modify: `auris/tests/unit/electron/browser/browser-partitions.test.ts`
- Create: `auris/tests/unit/electron/browser/browser-mode-authority.test.ts`
- Create: `auris/tests/component/browser-window/browser-mode-controls.test.tsx`
- Create: `auris/tests/electron/browser-partition-isolation-smoke.cjs`
- Modify: `auris/package.json`

- [x] Write failing unit tests mapping immutable mode to partitions: persistent Human, shared nonpersistent AiSandbox isolated from Human, and persistent-human AiShared with different authority policy.
- [x] Write the exhaustive failing mode-authority matrix: Human requires a valid `once`/`until-navigation` attachment in addition to normal authority for every AI read and action; AiSandbox reads require its sandbox origin policy and actions require normal grants; AiShared requires approval for every destination unless a current in-memory committed-origin+`navigate` standing grant applies, and still requires operation authority for subsequent reads/actions.
- [x] Add dispatcher/tool/UI tests for explicit mode selection, safe capability reporting, default MCP `open` to AiSandbox, human-created Human tabs, explicit AiShared approval, and rejection of caller attempts to relabel an existing tab.
- [x] Add tests proving mode cannot change in place for a live page view; switching mode creates a new view/document generation and tears down old authority.
- [x] Add a real Electron smoke fixture that sets cookie/localStorage in Human, proves AiSandbox cannot see either, proves sandbox state disappears on process restart, and proves AiShared uses human storage only after explicit approval.
- [x] Run unit test and smoke; confirm the expected initial failures.
- [x] Implement session creation and install policies once per partition. Generate no persisted per-run sandbox partition names that accidentally retain data.
- [x] Wire the matrix into the one main-process guard, not only the partition selector. Project the immutable mode in browser chrome/MCP state without exposing partition names or credentials.
- [x] Add `browser:partition-isolation` script and run it on macOS twice, including a full Electron process restart.
- [x] Commit: `git commit -m "feat: isolate browser automation partitions"`.

## Task 3b: Wire immediate human reclaim from real page input

**Files:**

- Create: `auris/electron/browser/browser-human-reclaim.cjs`
- Modify: `auris/electron/browser/browser-surface-manager.cjs`
- Modify: `auris/electron/browser/browser-lease.cjs`
- Modify: `auris/electron/browser/browser-command-dispatcher.cjs`
- Modify: `auris/electron/browser/browser-approvals.cjs`
- Create: `auris/tests/unit/electron/browser/browser-human-reclaim.test.ts`
- Create: `auris/tests/electron/browser-human-reclaim-smoke.cjs`
- Create: `auris/tests/fixtures/browser/human-reclaim.html`
- Modify: `auris/package.json`

- [x] Write failing tests that trusted page `before-input-event` and `before-mouse-event` synchronously reclaim a controlled tab, rotate `controlEpoch`, abort the owner's `AbortController`, deny pending approvals, release the lease, and discard a late result.
- [x] Add a negative test proving page-script `dispatchEvent` cannot forge the Electron input hooks or reclaim another tab.
- [x] Run the unit test and confirm failure.
- [x] Attach reclaim listeners when each page view is created and detach them before teardown/ID removal. Automation uses isolated DOM actions rather than Electron input injection, so its own click/type path must not masquerade as human input.
- [x] Add `browser:human-reclaim` smoke: start a delayed MCP action, deliver a native mouse input through Electron to the controlled page, assert immediate cancellation/control-epoch rotation, then assert the late page completion is ignored. Repeat with keyboard input.
- [x] Manually click a controlled local-fixture page in the macOS smoke app and verify the visible control indicator returns to Human immediately.
- [x] Commit: `git commit -m "feat: reclaim browser control on human input"`.

## Task 4: Add Keychain-backed session references and honest capability gates

**Files:**

- Create: `auris/electron/security/keychain-secret-store.cjs`
- Create: `auris/electron/browser/browser-session-capabilities.cjs`
- Create: `auris/electron/browser/browser-session-service.cjs`
- Create: `auris/electron/browser/page-scripts/session-storage.js`
- Modify: `auris/electron/browser/browser-state-db.cjs`
- Modify: `auris/electron/browser/browser-command-dispatcher.cjs`
- Modify: `auris/electron/mcp/browser-tool-contract.mjs`
- Modify: `auris/electron/auris-notes-mcp-server.mjs`
- Create: `auris/tests/unit/electron/security/keychain-secret-store.test.ts`
- Create: `auris/tests/unit/electron/browser/browser-session-service.test.ts`
- Modify: `auris/tests/unit/electron/auris-notes-mcp-server.test.ts`
- Create: `auris/tests/electron/browser-session-macos-smoke.cjs`

- [x] Write failing adapter tests for unavailable encryption, encrypt/decrypt round-trip, ciphertext-only persistence, named reference validation, overwrite, delete, corrupt ciphertext, and locked/unavailable Keychain behavior.
- [x] Write failing policy tests proving MCP/workflow receives opaque session reference/status only and cannot list, read, log, or inject credential values.
- [x] Add failing fidelity tests for committed-origin binding, cookie domain/path/hostOnly scoping, expiration, Secure, SameSite, HttpOnly, localStorage origin scoping, count-only summaries, cross-origin refusal, and fail-safe skip/refusal whenever an HttpOnly or other attribute cannot be restored without weakening it.
- [x] Add dispatcher/sidecar capability tests: `session_save`/`session_load` return `CAPABILITY_NOT_VERIFIED` until the independent cookie and localStorage macOS probes pass; responses expose handles/counts/capability flags only. A session-injected tab hard-denies `execute_js`.
- [x] Run narrow tests and confirm failure.
- [x] Implement secret encryption through injected Electron `safeStorage`. Store encrypted blobs plus nonsensitive metadata in the browser database; never store plaintext even transiently beyond the call scope.
- [x] Implement `session_save`/`session_load` as origin-bound, exact-payload, fresh human-approved capabilities. Capture/restore cookies through trusted Electron session APIs. Capture/restore localStorage with a fixed isolated-world script scoped to the already committed origin; values move directly into/out of the encrypted in-memory payload and are never returned to renderer/MCP/logs.
- [x] Keep cookie replay, localStorage replay, and named persistent profiles as separately reported capabilities. Enable each only after the live smoke validates its own capture/replay, domain/origin scoping, flag fidelity, teardown, restart, deletion, and Human/AiSandbox isolation; otherwise refuse rather than partially restoring.
- [x] Run the macOS smoke. If any live assertion fails, keep the gate false and record the exact reason; do not weaken the test.
- [x] Commit: `git commit -m "feat: add Keychain-backed browser session references"`.

## Task 5: Enforce every browser-owned UX surface in main

**Files:**

- Create: `auris/electron/browser/browser-ux-policy.cjs`
- Create: `auris/electron/browser/browser-dialog-service.cjs`
- Create: `auris/electron/browser/browser-download-service.cjs`
- Modify: `auris/electron/browser/browser-page-policy.cjs`
- Modify: `auris/electron/browser/browser-surface-manager.cjs`
- Create: `auris/tests/unit/electron/browser/browser-ux-policy.test.ts`
- Create: `auris/tests/electron/browser-dialog-feasibility-smoke.cjs`
- Create: `auris/tests/electron/browser-ux-policy-smoke.cjs`
- Create: `auris/tests/fixtures/browser/hostile-surfaces.html`

- [x] Write an exhaustive failing policy test for alert/confirm, prompt, popup/`_blank`, download, upload, TLS error, HTTP auth, camera, microphone, geolocation, notifications, external protocol, find, zoom, context menu, print, devtools, PDF/media/fullscreen.
- [x] Before implementing dialogs, run a focused Electron feasibility smoke using an internal DevTools Protocol attachment (`Page.javascriptDialogOpening`/`Page.handleJavaScriptDialog`) against the local fixture. Prove bounded alert/confirm interception, navigation/teardown cancellation, no page preload, and clean debugger detach. If the mechanism is unavailable or unsafe on the pinned Electron/macOS build, set `disableDialogs: true`, keep the user-facing browser capability disabled, and request a spec decision instead of silently shipping weaker behavior.
- [x] Add teardown tests proving late dialog/auth/download/file-picker callbacks cannot affect a closed or reused tab.
- [x] Run the tests and confirm failure.
- [x] Implement bounded native alert/confirm through the proven main-process mechanism; suppress prompt; block popups/external protocols/print; hard-deny certificate errors; deny browsed-page permissions; allow uploads only through a human native picker; allow downloads only after a human save destination, returning status only to agents.
- [x] Ensure HTTP auth uses a native human-only prompt and its values never enter page scripts, snapshots, MCP, workflows, or logs.
- [x] Make devtools available only under an explicit development-build predicate. Keep find/zoom/context menu bounded in trusted chrome.
- [x] Run the hostile-surface smoke and commit: `git commit -m "feat: enforce fail-closed browser surface policy"`.
- [x] Commit: `git commit -m "feat: enforce fail-closed browser surface policy"`.

## Task 6: Add crash budgets, hibernation, and authority-free recovery

**Files:**

- Create: `auris/electron/browser/browser-recovery.cjs`
- Create: `auris/electron/browser/browser-hibernation.cjs`
- Modify: `auris/electron/browser/browser-window-manager.cjs`
- Modify: `auris/electron/browser/browser-registry.cjs`
- Create: `auris/tests/unit/electron/browser/browser-recovery.test.ts`
- Create: `auris/tests/unit/electron/browser/browser-hibernation.test.ts`
- Create: `auris/tests/electron/browser-crash-recovery-smoke.cjs`

- [x] Write failing tests for renderer crash, unresponsive view, failed load, exact crash budget (first three consecutive crashes may auto-reload; the next enters manual-reload-only; a successful load resets the streak), bounded backoff, background-tab hibernation eligibility, active/controlled/pending-approval exclusion, and memory-pressure selection.
- [x] Add recovery assertions that restored Human tabs get fresh tab runtime state and no lease, attachment, approval, grant, history, AI ownership, or stable ref survives.
- [x] Run unit tests and confirm failure.
- [x] Implement bounded recovery with explicit crash UI state. Hibernation serializes only safe URL/title/mode metadata and destroys the old view; reactivation creates a new generation.
- [x] Ensure teardown cancels dialogs, downloads, prompts, auth, executor tasks, approvals, and lease ownership before IDs leave the registry.
- [x] Run a real crash/recovery smoke and commit: `git commit -m "feat: add browser crash recovery and hibernation"`.

## Task 7: Add redacted audit records without creating an authority log

**Files:**

- Create: `auris/electron/browser/browser-audit.cjs`
- Modify: `auris/electron/browser/browser-state-db.cjs`
- Modify: `auris/electron/browser/browser-operation-guard.cjs`
- Create: `auris/tests/unit/electron/browser/browser-audit.test.ts`

- [x] Write failing tests for bounded audit records containing time, owner kind, safe connection/run hash, window/tab, redacted origin, operation, decision, approval kind, and typed outcome.
- [x] Add secret-scanner fixtures for lease token, URL credentials, query tokens, typed passwords, headers, cookies, Keychain plaintext, page excerpts, and payload hashes; assert none are persisted.
- [x] Run the test and confirm failure.
- [x] Implement append/prune behavior with strict field construction, not post-hoc regex redaction of arbitrary objects.
- [x] Treat audit as diagnostics only: it cannot restore grants, approvals, attachments, leases, refs, or sessions.
- [x] Rerun tests and commit: `git commit -m "feat: add redacted browser authority audit"`.

## Task 8: Run the adversarial matrix and enable automation only on success

**Files:**

- Create: `auris/tests/integration/browser-authority-adversarial.test.ts`
- Create: `auris/tests/electron/browser-security-macos-smoke.cjs`
- Modify: `auris/electron/browser/browser-capabilities.cjs`
- Modify: `auris/electron/browser/browser-command-dispatcher.cjs`
- Modify: `auris/electron/browser/browser-window-manager.cjs`
- Modify: `auris/electron/menu-template.cjs`
- Modify: `auris/electron/main.cjs`
- Modify: `auris/electron/preload.cjs`
- Modify: `auris/src/platform/desktop/desktop-bridge.ts`
- Modify: `auris/src/components/settings/auris-settings.tsx`
- Create: `auris/tests/component/settings/auris-settings-browser-security.test.tsx`
- Modify: `auris/package.json`

- [x] Encode the spec's full adversarial probe set: replay after navigation/release/reclaim/disconnect, wrong owner/tab/origin/op/target/payload, redirect, popup, late callback, stale ref, ambiguous target, partition leak, crash restore, Keychain failure, and concurrent retry.
- [x] Add `execute_js` exfiltration probes for `document.cookie`, localStorage, obfuscated property access, DOM side-channel writes, and session injection. Hard-deny Human, AiShared, and every session-injected tab. Enable exact-approved `eval` only in nonpersistent AiSandbox after proving it has no Human/Keychain session material; capability response must state this narrower scope.
- [x] Write failing tests against the real `AurisSettings` route component that keep enablement disabled with an explicit capability reason until the Phase 4 security capability result is green.
- [x] Add `browser:security` script that runs the real macOS smoke without network dependence.
- [x] Run unit tests, `npm run test:integration -- tests/integration/browser-authority-adversarial.test.ts`, and smoke suites. Fix production behavior, not assertions, until all mandatory probes pass.
- [x] Expose the user-controlled automation toggle only after the compiled capability gate is true. Named profiles/cookie replay retain independent false gates unless their live tests passed.
- [x] Only after dialog/UX/session/mode/reclaim gates pass, turn the Phase 2 browser-surface capability on and add the `Nia 浏览器` menu/action. Before that exact point, production `openBrowser` must continue returning `CAPABILITY_NOT_VERIFIED`.
- [x] Commit: `git commit -m "feat: enable hardened MCP browser automation"`.

## Task 9: Phase gate and handoff

- [x] Run `npm run test -- tests/unit/electron/browser tests/unit/electron/security tests/component/settings/auris-settings-browser-grants.test.tsx tests/component/settings/auris-settings-browser-security.test.tsx` and `npm run test:integration -- tests/integration/browser-authority-adversarial.test.ts`.
- [x] Run `npm run browser:isolation`, `npm run browser:partition-isolation`, `npm run browser:human-reclaim`, `npm run browser:security`, and all session/dialog/crash/UX macOS smoke scripts.
- [x] Run the real MCP research loop once in Human, AiSandbox, and AiShared modes; verify the distinct approval/attachment/storage behavior.
- [x] Restart Auris and prove grants, attachments, leases, approvals, AI tabs, sandbox state, and history are gone.
- [x] Run `npm run lint`, `npm run build`, `npm run security:secrets`, and `git diff --check`.
- [x] Refresh/review the VMark report and commit report-only updates if needed: `git commit -m "docs: record phase four VMark comparison"`.
- [x] Handoff Phase 5 with capability flags and macOS evidence. Explicitly list any gated feature that remains unavailable.
