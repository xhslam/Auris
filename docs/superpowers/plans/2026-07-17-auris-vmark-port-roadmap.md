# Auris VMark-Compatible Browser and Nia Port Roadmap

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved VMark-compatible browser, MCP research, Nia, workflow, and multi-window capabilities inside the existing `auris/` desktop product without creating a second application.

**Architecture:** Electron main remains the sole browser authority. A trusted browser-chrome renderer controls isolated `WebContentsView` pages through typed IPC; the existing authenticated MCP sidecar routes Browser and Workflow commands to main while Notes writes retain the current revision-safe renderer path. Delivery is split into six independently runnable phases, with security authority added before automation is enabled by default.

**Tech Stack:** Electron 41, Next.js 16, React 19, TypeScript 5.9, Node.js CommonJS/ESM, Vitest, Playwright, Electron smoke tests, SQLite `DatabaseSync`, macOS Keychain adapter.

---

## Governing documents

- Approved design: `docs/superpowers/specs/2026-07-17-auris-vmark-browser-nia-multiwindow-design.md`
- VMark source baseline: `xiaolai/vmark@7c409688dc510d87183bdc46308e1ee645c2579f`
- License obligation: retain the upstream ISC copyright and permission notice for copied or adapted code.
- Product boundary: all implementation stays under `auris/`; do not create another Next.js, Electron, or Tauri product directory.

## Plan set and dependencies

| Order | Plan | Depends on | Runnable proof at phase end |
|---|---|---|---|
| 1 | `2026-07-17-auris-vmark-phase-1-compatibility-spine.md` | Approved spec | Manifest report, contract tests, pure algorithm tests |
| 2 | `2026-07-17-auris-vmark-phase-2-browser-window.md` | Phase 1 | Separate macOS browser window with isolated tabs and basic chrome |
| 3 | `2026-07-17-auris-vmark-phase-3-mcp-research-loop.md` | Phases 1–2 | Real MCP open/read/act/verify/evidence loop against local fixtures |
| 4 | `2026-07-17-auris-vmark-phase-4-browser-security-resilience.md` | Phases 1–3 | Main-authoritative grants, leases, sessions, partitions, crash recovery |
| 5 | `2026-07-17-auris-vmark-phase-5-nia-workflows.md` | Phases 1–4 | Nia plus both workflow families, with legacy Genie import compatibility |
| 6 | `2026-07-17-auris-vmark-phase-6-multiwindow-upstream-hardening.md` | Phases 1–5 | Multi-window status center, concurrency regression suite, final upstream report |

Complete phases in order. Within a phase, follow the task order unless the phase explicitly marks tasks as independent. Do not start Phase 5 by weakening the Phase 4 authority model.

## Cross-phase file map

### Existing files that remain compatibility anchors

- `auris/electron/main.cjs`: bootstrap only; progressively delegate browser responsibilities to `electron/browser/` modules.
- `auris/electron/preload.cjs`: main Auris window bridge; do not expose page privileges through it.
- `auris/electron/auris-notes-mcp-server.mjs`: preserve executable path and existing Notes tool contracts while adding grouped Browser/Workflow tools.
- `auris/electron/notes-mcp-bridge.cjs`: preserve authentication/discovery; route browser methods to main rather than a renderer.
- `auris/src/features/notes/workbench/notes-mcp-request-handler.ts`: retain revision-safe Notes behavior.
- `auris/src/platform/desktop/desktop-bridge.ts`: retain existing main-window API; add browser-window APIs behind separate types.

### New cohesive areas

- `auris/electron/browser/`: registry, view/window managers, policy, guard, lease, approvals, persistence, recovery, audit, IPC.
- `auris/electron/shared/`: packaged single-source runtime contracts consumed by Electron CJS, MCP ESM, and typed renderer adapters.
- `auris/electron/security/`: shared Keychain-backed opaque secret storage for browser sessions and Nia provider credentials.
- `auris/src/features/browser/`: contracts, URL/ref/reader algorithms, state projection, renderer bridge.
- `auris/src/components/browser-window/`: chrome, tabs, omnibox, history, bookmarks, approvals, crash and control UI.
- `auris/src/features/nia/` and `auris/src/components/nia/`: provider schemas, execution, history, apply/review UI.
- `auris/src/features/workflows/` and workflow components: both Nia YAML and browser Markdown workflow families.
- `auris/tests/fixtures/browser/`: deterministic local pages for navigation, refs, forms, dialogs, crashes, secrets, and concurrent targets.

## Cross-phase implementation rules

- Use test-first increments: add one failing assertion, run the narrow test, implement the smallest behavior, rerun, then commit.
- Keep untrusted page `webContents` free of privileged preload, Node integration, and Auris IPC.
- Never let renderer state authorize an operation. Main validates target, generation, control epoch, owner, lease, origin, operation, target descriptor, and payload hash.
- Do not log lease tokens, credentials, secret values, full page bodies, or unredacted sensitive URLs.
- Existing Notes tools and install paths are compatibility surfaces. Additive changes require regression tests.
- Stage only files named by the current task. The worktree may contain unrelated user changes.
- Each phase begins with `npm run vmark:diff -- --upstream 7c409688dc510d87183bdc46308e1ee645c2579f` after Phase 1 provides it, reviews the report, and updates only deliberately accepted mappings.

## Phase gates

### Gate 1 — compatibility spine

- [ ] `npm run vmark:diff -- --upstream 7c409688dc510d87183bdc46308e1ee645c2579f` exits 0 and emits deterministic JSON/Markdown.
- [ ] Contract and pure algorithm tests pass.
- [ ] Existing Notes MCP tests remain green.

### Gate 2 — browser window

- [ ] A separate browser window opens, navigates a local fixture, manages tabs, and closes without affecting the main Auris window.
- [ ] Isolation smoke proves no Node/Auris bridge in page content.
- [ ] History remains session-only and bookmarks persist exact URLs.

### Gate 3 — MCP research loop

- [x] A real stdio MCP client, launched against the explicit local-fixture Electron test composition, completes open → read → act → wait/verify → evidence → revision-safe Notes proposal in mandatory non-persistent AiSandbox.
- [x] Ambiguous target, stale ref, timeout, disconnect, and unsupported method paths fail with typed errors.
- [x] Existing `auris_session`, `auris_workspace`, `auris_document`, and `auris_selection` behavior is unchanged.

### Gate 4 — security and resilience

- [ ] Lease/approval/grant logic is main-authoritative and adversarial tests cover replay, navigation, reclaim, disconnect, teardown, and payload substitution.
- [ ] Human, AI sandbox, and AI shared partition behavior is verified on macOS.
- [ ] Keychain session capabilities do not export secret material; named profiles/cookie replay remain gated until live tests pass.

### Gate 5 — Nia and workflows

- [ ] Canonical `nia: v1` and `uses: nia/*` execute; legacy `genie: v1`, `uses: genie/*`, and unversioned v0 import.
- [ ] Browser Markdown workflows record, validate, run, cancel, retry, and self-heal with fresh authorization per attempt.
- [ ] Nia provider processes are bounded and cannot inherit the Auris workspace or unrestricted environment.

### Gate 6 — multi-window and release hardening

- [ ] N browser windows and tabs are visible in the main-window status center; focus never grants page authority.
- [ ] Explicit target selection and concurrent run tests pass.
- [ ] Full lint, unit/component, build, Playwright, Electron smoke, secret scan, and final VMark comparison pass.

## Global verification command set

Run narrow commands during each increment, then the relevant phase gate. At the final gate run:

```bash
cd /Users/apple/Desktop/大学markdown/auris
npm run lint
npm run security:secrets
npm run test
npm run test:integration
npm run build
npm run playwright:test
npm run vmark:diff -- --upstream 7c409688dc510d87183bdc46308e1ee645c2579f
```

Run the Electron smoke scripts named by the phase plans separately because they may require a macOS graphical session.

## Release discipline

- Do not enable browser automation by default until Gate 4 passes.
- Do not claim named profile or cookie replay support until the live macOS capability test is green.
- Do not remove legacy Genie parsing in the same release that introduces Nia.
- Do not promote the VMark comparison to automation until the manual report has been run and reviewed successfully at least three times.
- Every phase ends with a clean, focused commit and a short evidence note in its plan checkboxes or handoff summary.
