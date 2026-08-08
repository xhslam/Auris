# Auris VMark Port Phase 2: Separate Browser Window Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separate macOS-first Auris browser window with trusted chrome, isolated `WebContentsView` pages, tabs, omnibox, session history, exact-URL bookmarks, and safe lifecycle recovery.

**Architecture:** Electron main owns a registry and creates one trusted `BrowserWindow` for chrome plus one untrusted `WebContentsView` per live page. Chrome receives a narrow preload API and projects authoritative snapshots; page views receive no Auris preload. Persistence stores bookmarks and safe window metadata, while history remains in memory.

**Tech Stack:** Electron `BrowserWindow`/`WebContentsView`, Next.js route `/browser`, React, TypeScript, SQLite `DatabaseSync`, Vitest, Electron smoke tests.

---

## Preconditions

- Phase 1 is complete and its contract tests pass.
- Refresh and review `npm run vmark:diff -- --upstream 7c409688dc510d87183bdc46308e1ee645c2579f` before editing.
- Keep `electron/main.cjs` as composition/bootstrap; new browser logic belongs in `electron/browser/`.

## Task 1: Create the main-process window and tab registry

**Files:**

- Create: `auris/electron/browser/browser-registry.cjs`
- Create: `auris/electron/browser/browser-ids.cjs`
- Create: `auris/tests/unit/electron/browser/browser-registry.test.ts`
- Modify: `auris/docs/vmark-port/manifest.json`

- [ ] Write failing tests for monotonic non-reused `windowId`/`tabId`, ordered tabs, one active tab, most-recently-active window lookup, explicit multi-window creation, lifecycle transitions, and immutable snapshots.
- [ ] Add edge tests for closing the active/background/last tab, duplicate IDs, late events for closed tabs, and process-local ID reset without persisted authority.
- [ ] Run `npm run test -- tests/unit/electron/browser/browser-registry.test.ts`; expect missing module failure.
- [ ] Implement a dependency-injected registry with no Electron imports. Store only identifiers, bounded metadata, lifecycle, `navigationGeneration`, `controlEpoch`, `policyEpoch`, automation mode, and opaque session/profile identity.
- [ ] Ensure every document identity change increments `navigationGeneration`; leave lease ownership empty until Phase 3/4.
- [ ] Return frozen snapshot DTOs rather than internal mutable records.
- [ ] Rerun the test and update the manifest mapping.
- [ ] Commit: `git commit -m "feat: add browser window and tab registry"`.

## Task 2: Create isolated page views and layout management

**Files:**

- Create: `auris/electron/browser/browser-surface-manager.cjs`
- Create: `auris/electron/browser/browser-page-policy.cjs`
- Create: `auris/tests/unit/electron/browser/browser-surface-manager.test.ts`
- Create: `auris/tests/unit/electron/browser/browser-page-policy.test.ts`

- [ ] Write failing constructor-option tests proving page views use `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and no preload.
- [ ] Write failing tests for adding/removing `WebContentsView`, active-view visibility, resize bounds below a fixed chrome inset, hidden tab behavior, teardown idempotence, and late event rejection.
- [ ] Add fail-closed navigation tests: allow `http:`/`https:` only through the URL decision helper; deny `will-attach-webview`, external protocols, and first-slice popup/new-window requests.
- [ ] Run the two narrow tests and confirm failure.
- [ ] Implement against injected Electron constructors so unit tests do not require a graphical session. Attach page listeners before the first load.
- [ ] Make teardown remove the child view, detach listeners, cancel pending state, and destroy `webContents` once.
- [ ] Rerun tests and lint the new directory.
- [ ] Commit: `git commit -m "feat: add isolated browser page surfaces"`.

## Task 3: Add a narrow browser-chrome IPC bridge

**Files:**

- Create: `auris/electron/browser/browser-preload.cjs`
- Create: `auris/electron/browser/browser-ipc.cjs`
- Create: `auris/src/features/browser/browser-bridge.ts`
- Create: `auris/tests/unit/electron/browser/browser-ipc.test.ts`
- Create: `auris/tests/unit/browser/browser-bridge.test.ts`

- [ ] Write failing allowlist tests for chrome commands: `getSnapshot`, `createTab`, `closeTab`, `activateTab`, `navigate`, `goBack`, `goForward`, `reload`, `stop`, `bookmark`, `removeBookmark`, `find`, `setZoom`, and `subscribe`.
- [ ] Add adversarial tests proving arbitrary channel names, caller-supplied `webContentsId`, unknown object keys, malformed IDs/URLs, and overlong omnibox input are rejected.
- [ ] Run narrow tests and confirm failure.
- [ ] Implement `contextBridge.exposeInMainWorld("aurisBrowser", ...)` with fixed channel names only. In main, bind each IPC caller to its owning chrome window; never trust a renderer-supplied window identity.
- [ ] Validate every command by requiring the canonical `electron/shared/browser-contract.cjs`; do not recreate schemas in Electron. Send only immutable redacted snapshots through the subscription channel.
- [ ] Add unsubscribe-on-unmount and destroy cleanup tests.
- [ ] Rerun tests and commit: `git commit -m "feat: add typed browser chrome bridge"`.

## Task 4: Compose separate browser windows from Electron bootstrap

**Files:**

- Create: `auris/electron/browser/browser-window-manager.cjs`
- Create: `auris/electron/browser/browser-capabilities.cjs`
- Modify: `auris/electron/main.cjs`
- Create: `auris/tests/unit/electron/browser/browser-window-manager.test.ts`
- Modify: `auris/tests/unit/platform/desktop-window-behavior.test.ts`

- [ ] Write failing tests for reuse-most-recent behavior, explicit new window, chrome preload path, trusted `/browser` URL, macOS title-bar configuration, close cleanup, and main-window independence.
- [ ] Add a test proving quitting the app closes browser windows, while closing a browser window does not close or navigate the main Auris window.
- [ ] Add a failing capability test proving normal production composition refuses `openBrowser` with `CAPABILITY_NOT_VERIFIED`; only an explicit injected local-fixture test composition may open it before Phase 4.
- [ ] Run the tests and confirm the new composition points are absent.
- [ ] Implement the manager with injected `BrowserWindow`, registry, surface manager, target URL, and logger. Expose `openBrowser({ newWindow, url })`, `focusTarget`, `closeAll`, and `snapshot`.
- [ ] Do not add a menu, navigation item, deep link, or normal IPC entry that exposes the browser yet. The Phase 2 manager is reachable only through the explicit local-fixture smoke composition until Phase 4 installs every fail-closed UX surface and turns on the capability.
- [ ] Keep browser creation behind `app.whenReady()` and dispose the manager during `before-quit`/window teardown.
- [ ] Rerun tests and commit: `git commit -m "feat: compose separate Auris browser windows"`.

## Task 5: Build the trusted browser chrome route

**Files:**

- Create: `auris/src/app/browser/page.tsx`
- Create: `auris/src/components/browser-window/browser-window-shell.tsx`
- Create: `auris/src/components/browser-window/browser-tab-strip.tsx`
- Create: `auris/src/components/browser-window/browser-omnibox.tsx`
- Create: `auris/src/components/browser-window/browser-toolbar.tsx`
- Create: `auris/src/components/browser-window/browser-status-pill.tsx`
- Create: `auris/src/features/browser/use-browser-window.ts`
- Create: `auris/tests/component/browser-window/browser-window-shell.test.tsx`
- Create: `auris/tests/component/browser-window/browser-omnibox.test.tsx`

- [ ] Write failing component tests for snapshot rendering, tab activation/close, new tab, omnibox submit, load controls, keyboard focus, loading/error state, and unavailable desktop bridge.
- [ ] Add accessibility assertions for named buttons, selected tab semantics, keyboard traversal, focus retention, and status announcements.
- [ ] Run component tests and confirm failure.
- [ ] Implement a restrained mint/white local-first UI consistent with the Auris visual baseline. Keep all state projection in `use-browser-window`; components issue intents but never authorize commands.
- [ ] Parse omnibox input as URL or search query via Phase 1 URL policy. Do not render remote title/favicon/URL as HTML.
- [ ] Add explicit `Human` status in this phase; reserve AI ownership indicators for Phase 3/4 without fake controls.
- [ ] Rerun tests and commit: `git commit -m "feat: build Auris browser window chrome"`.

## Task 6: Implement session history, bookmarks, and safe restore

**Files:**

- Create: `auris/electron/browser/browser-state-db.cjs`
- Create: `auris/electron/browser/browser-state-repository.cjs`
- Create: `auris/tests/unit/electron/browser/browser-state-db.test.ts`
- Modify: `auris/electron/browser/browser-window-manager.cjs`
- Modify: `auris/electron/browser/browser-ipc.cjs`
- Modify: `auris/src/components/browser-window/browser-window-shell.tsx`

- [ ] Write failing temp-database tests for exact bookmarked URL round-trip, duplicate bookmark idempotence, title update, removal, schema migration, corrupt-row normalization, and no history table/row persistence.
- [ ] Write failing restore tests for window geometry and explicitly retained Human tabs only; AI modes, leases, grants, attachments, history, and transient tab IDs must not restore.
- [ ] Run the narrow tests and confirm failure.
- [ ] Implement the schema/repository following `electron/runtime-state-db.cjs` normalization and transaction patterns, but keep browser persistence in its own cohesive module.
- [ ] Keep back/forward history in registry memory and expose bookmarks through snapshots/IPC.
- [ ] Clamp restored geometry to current displays and fall back to defaults if off-screen or invalid.
- [ ] Rerun tests and commit: `git commit -m "feat: persist browser bookmarks and safe window state"`.

## Task 7: Add real Electron isolation and lifecycle smoke tests

**Files:**

- Create: `auris/tests/electron/browser-window-smoke.cjs`
- Create: `auris/tests/electron/browser-isolation-smoke.cjs`
- Create: `auris/tests/fixtures/browser/basic-navigation.html`
- Create: `auris/tests/fixtures/browser/isolation-probe.html`
- Modify: `auris/package.json`

- [ ] Create a failing local HTTP fixture smoke that opens the main Auris window and a hidden browser window, navigates a page view, creates/switches/closes two tabs, and proves the main window remains alive.
- [ ] Add an isolation probe that evaluates page-visible globals and asserts `process`, `require`, `window.shadowingDesktop`, `window.aurisBrowser`, and privileged IPC are absent.
- [ ] Add a navigation-generation probe: navigate twice, send a late first-page event, and assert registry state remains on the second generation.
- [ ] Add a same-process lifecycle probe: build two history entries, close the browser window, reopen through the manager, and assert safe in-memory history/back-forward state is retained; then restart the Electron process and assert history is gone.
- [ ] Add `browser:smoke` and `browser:isolation` package scripts using Electron directly, following the timeout/cleanup pattern in `tests/electron/video-fullscreen-smoke.cjs`.
- [ ] Run both scripts in a macOS graphical session and preserve exact failure output if CI/headless execution is unavailable.
- [ ] Commit: `git commit -m "test: prove browser window isolation and lifecycle"`.

## Task 8: Phase gate and handoff

- [ ] Run `npm run test -- tests/unit/browser tests/unit/electron/browser tests/component/browser-window tests/unit/platform/desktop-window-behavior.test.ts`.
- [ ] Run `npm run browser:smoke` and `npm run browser:isolation` on macOS.
- [ ] Using the explicit local-fixture smoke composition, verify: open/reuse browser, explicitly open a second browser window, navigate only the fixture origin, switch tabs, bookmark an exact query URL, close/reopen in-process, and restart Auris.
- [ ] Confirm history survives only close/reopen in the same process; exact bookmarks persist; only retained Human tabs/geometry restore after restart.
- [ ] Run `npm run lint`, `npm run build`, `npm run security:secrets`, and `git diff --check`.
- [ ] Refresh the VMark report and update only reviewed Phase 2 mappings.
- [ ] Commit any report-only update: `git commit -m "docs: record phase two VMark comparison"`.
- [ ] Handoff Phase 3 with macOS smoke evidence and proof that the production browser capability remains unavailable until Phase 4.
