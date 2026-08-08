# Auris VMark Port Phase 6: Multi-Window and Upstream Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose robust multi-window control and a global status center, prove concurrent target isolation, complete the VMark mapping/report, and pass the full release-quality verification matrix.

**Architecture:** The existing main-process registry becomes the one source of truth for all Auris/browser windows, tabs, runs, leases, and pending approvals. The main Auris renderer receives redacted projections and sends focus intents only; target selection remains explicit and authority remains with the operation guard. Final upstream comparison is a reviewed artifact, never an automatic source rewrite.

**Tech Stack:** Electron window registry, typed IPC, React status UI, Vitest, Playwright, Electron smoke tests, deterministic VMark diff report.

---

## Preconditions

- Phases 1–5 pass, including all macOS security and workflow gates.
- Refresh/review the pinned VMark report before editing.
- Keep all work inside the existing `auris/` project.

## Task 1: Project a global redacted window/status model

**Files:**

- Create: `auris/electron/browser/browser-status-service.cjs`
- Modify: `auris/electron/browser/browser-registry.cjs`
- Modify: `auris/electron/browser/browser-command-dispatcher.cjs`
- Modify: `auris/electron/workflows/workflow-run-registry.cjs`
- Create: `auris/src/features/browser/window-status.ts`
- Create: `auris/tests/unit/electron/browser/browser-status-service.test.ts`

- [ ] Write failing projection tests for main Auris windows, browser windows, active/background tabs, redacted URLs, lifecycle/loading/crash state, lease holder kind, MCP/workflow activity, pending approval count, and standing-grant indicator.
- [ ] Add secret tests proving snapshots omit connection IDs in raw form, run internals, tokens, payload hashes, credentials, page text, secret references, and persisted grant details.
- [ ] Add ordering tests: active/recent windows first, tabs in window order, deterministic snapshots under concurrent updates.
- [ ] Run the narrow test and confirm failure.
- [ ] Implement a subscription service over registry/lease/approval/run events with coalescing and bounded update frequency.
- [ ] Return immutable redacted DTOs only; no renderer object becomes an authority input.
- [ ] Rerun tests and commit: `git commit -m "feat: project global browser window status"`.

## Task 2: Add the main-window status center and typed IPC

**Files:**

- Modify: `auris/electron/preload.cjs`
- Modify: `auris/src/platform/desktop/desktop-bridge.ts`
- Modify: `auris/electron/main.cjs`
- Create: `auris/src/components/desktop/browser-status-center.tsx`
- Create: `auris/src/components/desktop/browser-status-item.tsx`
- Modify: `auris/src/components/desktop/desktop-app-frame.tsx`
- Create: `auris/tests/component/desktop/browser-status-center.test.tsx`
- Create: `auris/tests/unit/electron/browser/browser-status-ipc.test.ts`

- [ ] Write failing IPC tests for `getBrowserStatus`, subscribe/unsubscribe, `focusBrowserWindow`, and `focusBrowserTab`; bind caller to the trusted main Auris renderer.
- [ ] Add a test proving focus changes OS/UI focus only and neither issues nor transfers a lease, attachment, grant, approval, or control epoch.
- [ ] Write component tests for all projected states, empty state, grouped windows/tabs, keyboard navigation, safe URL/title rendering, activity labels, and unavailable bridge.
- [ ] Run tests and confirm failure.
- [ ] Add a narrow status API to the existing main preload/desktop bridge. Do not expose browser action methods to the main Notes renderer.
- [ ] Build the status center using Auris's light mint visual baseline and accessible disclosure/list semantics.
- [ ] Rerun tests and commit: `git commit -m "feat: add Auris browser status center"`.

## Task 3: Complete explicit multi-window browser controls

**Files:**

- Modify: `auris/electron/browser/browser-window-manager.cjs`
- Modify: `auris/electron/browser/browser-ipc.cjs`
- Modify: `auris/src/components/browser-window/browser-window-shell.tsx`
- Create: `auris/src/components/browser-window/browser-window-menu.tsx`
- Create: `auris/tests/unit/electron/browser/browser-multiwindow.test.ts`
- Create: `auris/tests/component/browser-window/browser-window-menu.test.tsx`

- [ ] Write failing tests for default reuse-most-recent, explicit new window, tabs created in an explicitly selected window, no tab/window-ID reuse, independent active views, geometry persistence, and last-window closure.
- [ ] Add ownership tests proving opening/focusing another window does not transfer, duplicate, or cancel control in the original target, and closing a controlled window performs the normal cancellation/release path.
- [ ] Run tests and confirm failure.
- [ ] Implement explicit create/focus/close window controls and per-window tab creation. Cross-window tab moving/reparenting is outside the approved scope and must not be added.
- [ ] Make every ambiguous MCP/workflow target return `AMBIGUOUS_TARGET`; UI convenience never changes external selection behavior.
- [ ] Rerun tests and commit: `git commit -m "feat: complete explicit browser multi-window controls"`.

## Task 4: Stress concurrent targets, runs, and human reclaim

**Files:**

- Create: `auris/tests/integration/browser-multiwindow-concurrency.test.ts`
- Create: `auris/tests/integration/browser-control-races.test.ts`
- Create: `auris/tests/electron/browser-multiwindow-smoke.cjs`
- Modify: `auris/package.json`

- [ ] Write failing integration tests for two MCP connections on separate tabs, MCP plus workflow on separate windows, two Nia runs, and conflicting control requests on one tab.
- [ ] Add deterministic race tests for acquire-vs-close, action-vs-navigation, approval-vs-reclaim, retry-vs-expiry, hibernate-vs-control, window-focus-vs-action, and disconnect-vs-result.
- [ ] Assert exactly one terminal outcome, no double callback, no leaked lease/approval/run, and monotonic epochs/generations in every interleaving.
- [ ] Run `npm run test:integration -- tests/integration/browser-multiwindow-concurrency.test.ts tests/integration/browser-control-races.test.ts` repeatedly with seeded scheduling and confirm failures before fixing race handling.
- [ ] Add `browser:multiwindow` smoke that opens two real browser windows and four local fixture tabs, runs independent reads/actions, reclaims one, crashes another, and verifies the status center.
- [ ] Commit: `git commit -m "test: harden browser multi-window concurrency"`.

## Task 5: Finish every VMark source mapping and difference decision

**Files:**

- Modify: `auris/docs/vmark-port/manifest.json`
- Modify: `auris/docs/vmark-port/README.md`
- Modify through command: `auris/docs/vmark-sync/latest.json`
- Modify through command: `auris/docs/vmark-sync/latest.md`
- Modify: `auris/tests/unit/vmark/vmark-manifest.test.ts`
- Modify: `auris/tests/unit/vmark/vmark-sync-report.test.ts`

- [ ] Run the comparison against the pinned commit and enumerate every relevant browser, Genie/Nia, workflow, window-manager, and status upstream path.
- [ ] For each path, record a stable mapping ID, all upstream/Auris paths, honest disposition, specific intentional differences, current comparison commit, and covering tests.
- [ ] Mark truly irrelevant Tauri/Rust shell code `not-applicable` with the Electron/WebContentsView replacement rationale; do not use `not-applicable` to hide missing behavior.
- [ ] Add failing manifest coverage tests for relevant upstream path families and zero missing Auris targets for completed mappings.
- [ ] Rerun report/tests until there are no stale mappings, duplicate paths, unresolved relevant paths, or unreviewed missing targets.
- [ ] Generate the report twice and prove byte stability.
- [ ] Commit: `git commit -m "docs: complete VMark port compatibility map"`.

## Task 6: Add user-facing compatibility and capability documentation

**Files:**

- Create: `auris/docs/browser/README.md`
- Create: `auris/docs/browser/security-model.md`
- Create: `auris/docs/browser/mcp-tools.md`
- Create: `auris/docs/browser/nia-and-workflows.md`
- Modify: `auris/README.md`

- [ ] Document separate browser windows, automation modes, session/history/bookmark rules, status center, MCP approval retry protocol, Nia naming, both workflow families, and legacy Genie import behavior.
- [ ] State blocked/feature-gated capabilities exactly as runtime reports them, especially named profiles/cookie replay and providers with unavoidable tool authority.
- [ ] Include safe local examples with placeholder secrets by reference; never show tokens in argv, URLs, logs, or workflow literals.
- [ ] Add troubleshooting for approval required, stale generation/control, ambiguity, Keychain unavailable, crash budget, provider cancellation, and VMark report review.
- [ ] Run link/code-block checks available in the repo and manually compare docs to live UI/tool schemas.
- [ ] Commit: `git commit -m "docs: explain Auris browser Nia and workflows"`.

## Task 7: Complete accessibility, performance, and lifecycle probes

**Files:**

- Create: `auris/tests/e2e/browser-accessibility.spec.ts`
- Create: `auris/tests/e2e/browser-lifecycle.spec.ts`
- Create: `auris/tests/electron/browser-resource-budget-smoke.cjs`
- Modify: `auris/playwright.config.ts` only if an Electron/browser project is required

- [ ] Add keyboard-only and accessible-name tests for browser chrome, tabs, omnibox, approvals, grant center, Nia, workflows, crash state, and status center.
- [ ] Add lifecycle tests for close/reopen/restart, Human retained tabs, transient AI tabs, session-only history, exact bookmarks, cancelled pending UI, and process-exit authority loss.
- [ ] Define and test explicit resource budgets for maximum live views, hibernation threshold, snapshot/result sizes, console entries, pending approvals, simultaneous runs, and temporary evidence cleanup.
- [ ] Run probes on macOS with normal and reduced window sizes. Fix functional/accessibility failures; document hardware-sensitive performance observations without weakening safety caps.
- [ ] Commit: `git commit -m "test: cover browser accessibility and resource budgets"`.

## Task 8: Full release verification

**Files:**

- Modify product files only for genuine defects found by verification.
- Create: `auris/tests/electron/packaged-mcp-sidecar-smoke.cjs`
- Modify: `auris/package.json`

- [ ] Run focused suites once, then the full unit/component suite:

```bash
cd /Users/apple/Desktop/大学markdown/auris
npm run test
npm run test:integration
npm run lint
npm run security:secrets
npm run build
```

- [ ] Run all browser/Nia/workflow Electron smoke scripts: window, isolation, partition, session, UX, crash, security, workflow, multi-window, and resource budget.
- [ ] Run `npm run playwright:test`, including browser accessibility/lifecycle projects.
- [ ] Run a real stdio MCP client through Notes-only regression, one Human research loop, one AiSandbox loop, one AiShared approval flow, and one workflow cancellation/retry flow.
- [ ] Package/start the macOS desktop build with the existing desktop command and verify main Auris + multiple browser windows, Keychain prompt behavior, app quit cleanup, and relaunch restore.
- [ ] Add `desktop:build:verify` that assembles the audited `electron/node_modules` runtime closure, produces an unpacked macOS `.app`, runs `packaged-mcp-sidecar-smoke.cjs`, and only then allows normal release pruning/DMG packaging. The smoke must resolve modules from the packaged app with the workspace `node_modules` hidden.
- [ ] In the packaged smoke, launch the packaged Auris executable, wait for authenticated discovery, launch the packaged `electron/auris-notes-mcp-server.mjs` via the packaged Electron binary with `ELECTRON_RUN_AS_NODE=1`, and run real stdio minimum regressions for existing Notes state and Browser state. Assert no `MODULE_NOT_FOUND` for MCP SDK, Zod, YAML, WebSocket, or any shared contract.
- [ ] Exercise both packaged workflow runtimes, not validation alone: start/get_state/complete-or-cancel a deterministic `nia_yaml` run using a local fake Ollama-compatible provider, then start/get_state/cancel a local-fixture `browser_markdown` run while it is parked at approval. Assert normalized events, independent family capability flags, owner isolation, cancellation, lease/approval cleanup, and no fallback to workspace files or `node_modules`.
- [ ] Run the pinned VMark comparison twice and inspect both reports.
- [ ] Run `git diff --check`; inspect the complete phase diff and confirm no unrelated user files are staged.
- [ ] Fix every P0/P1 failure and rerun its narrow test plus the complete affected gate.
- [ ] Create the focused release commit only after all required gates pass: `git commit -m "feat: complete VMark-compatible Auris browser and Nia"`.

## Task 9: Final handoff and follow-up boundary

- [ ] Record exact commands, pass counts, macOS version, Electron version, VMark baseline/resolved commit, and any genuinely unavailable capability.
- [ ] Confirm no second desktop project, Tauri runtime, Knowcraft adapter, persisted authority, or automatic upstream source overwrite was introduced.
- [ ] Confirm current upstream tracking remains manual. Recommend automation only after three reviewed, stable report runs as required by workspace rules.
- [ ] List post-release work separately: Windows/Linux parity, named profiles/cookie replay if still gated, optional popup/print support, and eventual Knowcraft adapter. Do not smuggle these into this release.
