> 历史归档（2026-10-21）：原文来自 `codex/nia-mochi-companion` 的 `a6310e4`。该分支的 14 个实现提交已经以等价补丁纳入主线；下文的 `auris/` 前缀、技术版本与未勾选步骤均为原始历史记录，不代表当前待执行计划。当前代码以仓库根目录及后续增强为准。

# Nia Mochi-style Desktop Companion Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Mochi-style Nia desktop companion that persists across macOS apps, uses Codex OAuth for one shared Realtime conversation, saves searchable local transcripts, preserves existing Nia features, and delivers voice review reminders.

**Architecture:** Electron main owns credentials, authoritative lifecycle, persistence, reminders, and window coordination; one persistent transparent companion renderer exclusively owns WebRTC/media transport. The `/nia` page subscribes to that shared runtime and presents the approved black Apple-style control center without creating another peer. Existing REST/CLI agent runs remain an explicitly separate advanced surface.

**Tech Stack:** Electron 43 CommonJS main/preload modules, Next.js 16 App Router, React 19, TypeScript, node:sqlite, WebRTC/OpenAI Realtime, Vitest, Testing Library, CSS canvas/SVG animation.

---

**Command convention:** Run all `npm`, `npx`, and `node --check` commands from `auris/`. Run the shown `git add auris/...` and `git commit` commands from the repository root one directory above `auris/`.

## File map

New Electron modules are kept under `auris/electron/nia/companion/` so credential, persistence, scheduling, windowing, and IPC decisions remain independently testable instead of enlarging `main.cjs`.

- `electron/nia/companion/codex-credential.cjs` — locate/parse Codex auth, classify expiry, exchange the access token, and proxy SDP without exposing secrets.
- `electron/nia/companion/diagnostics-store.cjs` — bounded, redacted passive diagnostics shared by all companion services.
- `electron/nia/companion/companion-settings.cjs` — validated single-persona, voice, shortcut, capability, and reminder preferences.
- `electron/nia/companion/conversation-db.cjs` — node:sqlite schema, secure deletion, list/search/export APIs, and crash recovery.
- `electron/nia/companion/conversation-lifecycle.cjs` — lazy conversation start, ordered user/Nia/tool filing, cut turns, and idempotent end.
- `electron/nia/companion/realtime-coordinator.cjs` — desired state, generation arbitration, config/version queues, reminder queue, and renderer report handling.
- `electron/nia/companion/capability-registry.cjs` — executable, main-process Realtime capabilities backed by existing Nia services.
- `electron/nia/companion/reminder-scheduler.cjs` — daily schedules, DND, snooze, catch-up, wall-clock recomputation, and deduplication.
- `electron/nia/companion/review-snapshot.cjs` — validate the renderer-projected due-review snapshot.
- `electron/nia/companion/companion-position.cjs` — persisted placement and display-safe clamping.
- `electron/nia/companion/companion-window.cjs` — transparent BrowserWindow creation, click-through, drag, all-Spaces behavior, and main-window navigation.
- `electron/nia/companion/companion-ipc.cjs` — role-checked IPC registration for companion and main renderers.
- `electron/nia/companion-preload.cjs` — minimum companion-only bridge.
- `electron/preload.cjs` — add the main-renderer companion client bridge only.
- `electron/main.cjs` — compose the modules, preserve the process when the main window closes, and dispose in quit order.
- `src/app/nia/companion/page.tsx` — transparent companion renderer route.
- `src/components/nia/companion/*` — canvas avatar, bubble, transport owner, and controller hook.
- `src/features/nia/companion-contract.ts` — shared TypeScript snapshot/command/event types and runtime validator.
- `src/features/nia/companion-bridge.ts` — safe main-renderer bridge lookup.
- `src/features/nia/use-nia-companion.ts` — subscribe to snapshots, commands, transcript events, and review actions.
- `src/components/nia/nia-companion-sync-host.tsx` — continuously project confirmed memory, active page context, and capability versions to main.
- `src/components/nia/nia-control-center.tsx` and CSS — approved black `/nia` layout.
- `src/components/nia/nia-history-drawer.tsx` — searchable local companion conversations.
- `src/components/nia/nia-reminder-settings.tsx` — times, DND, snooze, and diagnostics.
- `src/components/nia/nia-companion-settings.tsx` — character/persona, Realtime voice, shortcuts, and capability authorization.
- `src/components/nia/nia-diagnostics.tsx` — user-opened passive failure history and recovery guidance.
- `src/components/desktop/desktop-shell-fixtures.ts` — expose the `assistant` sidebar destination.
- `src/components/desktop/desktop-island-sync-host.tsx` — reuse existing review projection and sync it to the companion runtime.
- `src/app/api/nia/realtime-session/route.ts` — remove the API-key path after all consumers are migrated.
- `docs/third-party/mochi.md` — record the pinned upstream commit and MIT-derived module provenance.
- `AGENTS.md` — append the concise engineering trajectory required by the workspace.

Tests mirror each module under `tests/unit/electron/nia/companion/`, plus component/integration coverage under `tests/component/nia/` and `tests/integration/`.

## Task 1: Pin Mochi provenance and credential broker

**Files:**
- Create: `auris/docs/third-party/mochi.md`
- Create: `auris/electron/nia/companion/codex-credential.cjs`
- Create: `auris/electron/nia/companion/diagnostics-store.cjs`
- Test: `auris/tests/unit/electron/nia/companion/codex-credential.test.ts`
- Test: `auris/tests/unit/electron/nia/companion/diagnostics-store.test.ts`

- [ ] **Step 1: Write failing credential tests**

Cover `$CODEX_HOME/auth.json`, home fallback, missing file, malformed JSON, absent access token, JWT `exp`, expired token, upstream refusal, redacted errors, and successful SDP proxy. Use fake JWT strings and injected file/fetch/clock dependencies; never read the real user auth file. Add diagnostic-store coverage for bounded entries, stable failure codes, timestamps, component names, recovery guidance, subscriptions, clearing, and recursive redaction of tokens, secrets, full SDP, and transcript bodies.

```ts
expect(readCredential({ env: { CODEX_HOME: "/x" }, home: "/h", readFile, now })).toMatchObject({
  ok: true,
  accessToken: token,
  authPath: "/x/auth.json",
});
expect(await proxySdp({ offer: "v=0", accessToken: token, fetchImpl })).toEqual({ answer: "v=0 answer" });
expect(JSON.stringify(result)).not.toContain(token);
```

- [ ] **Step 2: Run the targeted test and verify it fails**

Run: `npm test -- tests/unit/electron/nia/companion/codex-credential.test.ts tests/unit/electron/nia/companion/diagnostics-store.test.ts`  
Expected: FAIL because `codex-credential.cjs` does not exist.

- [ ] **Step 3: Implement the broker with injected dependencies**

Export `resolveAuthPath`, `readCodexCredential`, `exchangeRealtimeSession`, and `proxyRealtimeSdp`. Match the pinned Mochi credential request shapes, apply deadlines with `AbortController`, return discriminated error codes, and keep access tokens out of all public results and log strings. Implement `createDiagnosticsStore({ now, capacity })`; every later companion service receives its `note()` sink through dependency injection rather than logging raw failures independently.

```js
module.exports = {
  exchangeRealtimeSession,
  proxyRealtimeSdp,
  readCodexCredential,
  resolveAuthPath,
};
```

- [ ] **Step 4: Add provenance documentation**

Record Mochi commit `faa334001541fc74093288821df5cfbff96f6797`, repository URL, MIT license, and the exact Auris modules whose behavior/code derives from Mochi.

- [ ] **Step 5: Run tests and static checks**

Run: `npm test -- tests/unit/electron/nia/companion/codex-credential.test.ts tests/unit/electron/nia/companion/diagnostics-store.test.ts && node --check electron/nia/companion/codex-credential.cjs && node --check electron/nia/companion/diagnostics-store.cjs`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add auris/docs/third-party/mochi.md auris/electron/nia/companion/codex-credential.cjs auris/electron/nia/companion/diagnostics-store.cjs auris/tests/unit/electron/nia/companion/codex-credential.test.ts auris/tests/unit/electron/nia/companion/diagnostics-store.test.ts
git commit -m "feat(nia): broker realtime through Codex login"
```

## Task 2: Build the SQLite conversation archive

**Files:**
- Create: `auris/electron/nia/companion/conversation-db.cjs`
- Create: `auris/electron/nia/companion/conversation-lifecycle.cjs`
- Test: `auris/tests/unit/electron/nia/companion/conversation-db.test.ts`
- Test: `auris/tests/unit/electron/nia/companion/conversation-lifecycle.test.ts`

- [ ] **Step 1: Write failing archive tests**

Assert lazy creation, empty-turn omission, ordered timestamps, cut markers, tool arrival recording, idempotent end, open-session recovery, persona scoping, bounded list/search, export, batch delete, and WAL checkpoint reporting. Add an archive assertion that pre-expiry Realtime rotation ends the current conversation and the replacement session creates a new conversation only on its next persistable turn.

```ts
const talk = createConversationLifecycle({ store, keeps: () => true, now });
talk.wear("nia");
expect(store.list("nia")).toEqual([]);
talk.file("user", "开始复习");
expect(store.list("nia")).toHaveLength(1);
talk.file("nia", "我们先看第一个", { cut: true, at: 120 });
talk.end();
```

- [ ] **Step 2: Verify tests fail**

Run: `npm test -- tests/unit/electron/nia/companion/conversation-db.test.ts tests/unit/electron/nia/companion/conversation-lifecycle.test.ts`  
Expected: FAIL for missing modules.

- [ ] **Step 3: Implement schema and repository**

Use `node:sqlite` `DatabaseSync`, `foreign_keys`, `secure_delete`, WAL, transactions, a `conversations` table, ordered `turns`, `tool_uses`, and `conversation_context_refs`. Keep one open connection per resolved database path. Close stale open conversations at startup. Use a consistent Chinese-capable normalized search column or bounded scan fallback; do not ship an FTS tokenizer that cannot match Chinese.

- [ ] **Step 4: Implement lifecycle**

Start only on the first persisted turn, read the keep-history preference on every turn, record tools only after a conversation exists, end before persona change, and allow deleting the live token so the next turn starts a fresh conversation.

- [ ] **Step 5: Run archive tests and syntax checks**

Run: `npm test -- tests/unit/electron/nia/companion/conversation-db.test.ts tests/unit/electron/nia/companion/conversation-lifecycle.test.ts && node --check electron/nia/companion/conversation-db.cjs && node --check electron/nia/companion/conversation-lifecycle.cjs`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add auris/electron/nia/companion/conversation-*.cjs auris/tests/unit/electron/nia/companion/conversation-*.test.ts
git commit -m "feat(nia): persist companion conversations"
```

## Task 3: Define and test coordinator/transport contracts

**Files:**
- Create: `auris/electron/nia/companion/realtime-coordinator.cjs`
- Create: `auris/src/features/nia/companion-contract.ts`
- Test: `auris/tests/unit/electron/nia/companion/realtime-coordinator.test.ts`
- Test: `auris/tests/unit/nia/companion-contract.test.ts`

- [ ] **Step 1: Write failing generation and contract tests**

Cover duplicate wake, stale open confirmation, stale close, renderer crash, config updates during negotiation, close timeout, typed-message queue of one, no REST fallback, reminder queuing while speaking, public snapshot redaction, and pre-expiry rotation. Inject the clock/timer and assert one replacement generation is requested before the announced expiry, stale replacement results lose, and the old transport closes only after the replacement is accepted or its hard deadline arrives.

```ts
const coordinator = createRealtimeCoordinator(deps);
const first = coordinator.wake();
const second = coordinator.wake();
expect(second.generation).toBe(first.generation);
coordinator.report({ type: "opened", generation: first.generation - 1, sessionId: "stale" });
expect(coordinator.snapshot().sessionId).toBeNull();
```

- [ ] **Step 2: Verify tests fail**

Run: `npm test -- tests/unit/electron/nia/companion/realtime-coordinator.test.ts tests/unit/nia/companion-contract.test.ts`  
Expected: FAIL for missing contracts.

- [ ] **Step 3: Implement coordinator state machine**

Use explicit states `resting`, `opening`, `listening`, `attending`, `thinking`, `speaking`, `working`, and `failed`. Coordinator emits commands but never constructs browser media objects. Reports carry generation/session/response/item ids. A renderer crash invalidates the generation and ends the conversation. Hold versioned confirmed-memory, active-context, and capability snapshots; updates received during negotiation are replayed after `session.updated`. Arm pre-expiry rotation from the service-announced expiry with both a safety lead and a hard floor, matching Mochi's long-running-session behavior.

- [ ] **Step 4: Implement runtime validators**

Define bounded commands, transport reports, normalized snapshots, transcript events, reminder intents, history DTOs, and diagnostics. Reject unknown keys where they could carry secrets or unbounded text.

- [ ] **Step 5: Run tests**

Run: `npm test -- tests/unit/electron/nia/companion/realtime-coordinator.test.ts tests/unit/nia/companion-contract.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add auris/electron/nia/companion/realtime-coordinator.cjs auris/src/features/nia/companion-contract.ts auris/tests/unit/electron/nia/companion/realtime-coordinator.test.ts auris/tests/unit/nia/companion-contract.test.ts
git commit -m "feat(nia): coordinate one realtime transport"
```

## Task 4: Create the companion-only IPC bridge

**Files:**
- Create: `auris/electron/nia/companion/companion-ipc.cjs`
- Create: `auris/electron/nia/companion/companion-settings.cjs`
- Create: `auris/electron/nia/companion-preload.cjs`
- Modify: `auris/electron/preload.cjs`
- Create: `auris/src/features/nia/companion-bridge.ts`
- Test: `auris/tests/unit/electron/nia/companion/companion-ipc.test.ts`
- Test: `auris/tests/unit/electron/nia/companion/companion-preload.test.ts`
- Test: `auris/tests/unit/electron/nia/companion/companion-settings.test.ts`
- Test: `auris/tests/unit/nia/companion-bridge.test.ts`

- [ ] **Step 1: Write failing bridge security tests**

Assert role-specific channel allowlists, sender identity checks, bounded payload validation, unsubscribe correctness, no credential/secret getters, and distinct companion versus main renderer capabilities. Test validated/atomic settings for one persona (name, how Nia addresses the user, bounded prompt, accent), offered Realtime voice, wake/show shortcuts, capability grants, keep-history, persisted awake/resting preference, reminder times/DND defaults, corrupt-file recovery, and change subscriptions. Assert startup restores awake/resting independently from power suspend/resume restoration.

- [ ] **Step 2: Verify tests fail**

Run: `npm test -- tests/unit/electron/nia/companion/companion-ipc.test.ts tests/unit/electron/nia/companion/companion-preload.test.ts tests/unit/nia/companion-bridge.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement IPC roles**

Companion bridge may request open/SDP, report transport frames and pointer bounds, receive coordinator commands, drag/drop, copy, and open `/nia`. Main renderer bridge may subscribe, wake/rest/hide/show, send typed companion text, read/update validated settings, manage history, read/clear passive diagnostics, sync review/context snapshots, and open review. Neither bridge returns tokens or Realtime secrets. IPC composes the diagnostics store and settings repository passed from main; it does not open parallel instances.

- [ ] **Step 4: Run bridge and existing IPC contract tests**

Run: `npm test -- tests/unit/electron/nia/companion tests/unit/nia/companion-bridge.test.ts tests/unit/quality/desktop-ipc-contract.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add auris/electron/nia/companion/companion-ipc.cjs auris/electron/nia/companion/companion-settings.cjs auris/electron/nia/companion-preload.cjs auris/electron/preload.cjs auris/src/features/nia/companion-bridge.ts auris/tests/unit/electron/nia/companion auris/tests/unit/nia/companion-bridge.test.ts
git commit -m "feat(nia): expose a constrained companion bridge"
```

## Task 5: Build the transparent window and placement service

**Files:**
- Create: `auris/electron/nia/companion/companion-position.cjs`
- Create: `auris/electron/nia/companion/companion-window.cjs`
- Test: `auris/tests/unit/electron/nia/companion/companion-position.test.ts`
- Test: `auris/tests/unit/electron/nia/companion/companion-window.test.ts`

- [ ] **Step 1: Write failing window-policy tests**

Assert transparent/frameless/non-resizable/skip-taskbar options, screen-saver always-on-top, all-workspaces/full-screen visibility, first-show after fit, initial click-through, pointer-change-only toggles, drag/drop persistence, click-versus-drag threshold, and disconnected-display recovery.

- [ ] **Step 2: Verify tests fail**

Run: `npm test -- tests/unit/electron/nia/companion/companion-position.test.ts tests/unit/electron/nia/companion/companion-window.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement placement and window service**

Inject Electron primitives for tests. Load `/nia/companion` through the existing Next server URL, use the companion preload, and bind show/hide/fit/pointer/grab/drop/open-main methods. Persist placement under `userData/nia/companion-position.json` with atomic write semantics.

- [ ] **Step 4: Run tests and syntax checks**

Run: `npm test -- tests/unit/electron/nia/companion/companion-position.test.ts tests/unit/electron/nia/companion/companion-window.test.ts && node --check electron/nia/companion/companion-window.cjs`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add auris/electron/nia/companion/companion-position.cjs auris/electron/nia/companion/companion-window.cjs auris/tests/unit/electron/nia/companion/companion-position.test.ts auris/tests/unit/electron/nia/companion/companion-window.test.ts
git commit -m "feat(nia): add the macOS desktop companion window"
```

## Task 6: Port the single Realtime transport and interruption accounting

**Files:**
- Create: `auris/src/components/nia/companion/realtime-transport.ts`
- Create: `auris/src/components/nia/companion/pending-utterances.ts`
- Create: `auris/src/components/nia/companion/companion-runtime.tsx`
- Create: `auris/src/app/nia/companion/page.tsx`
- Test: `auris/tests/unit/nia/pending-utterances.test.ts`
- Test: `auris/tests/component/nia/companion-runtime.test.tsx`

- [ ] **Step 1: Write failing transport behavior tests**

Test offer → main SDP proxy → answer, `session.updated` confirmation, data-channel frame parsing, typed `conversation.item.create`, response/item association, actual playback cursor, natural completion, interruption truncation, tool call forwarding, generation cancellation, mute, and complete resource release.

- [ ] **Step 2: Verify tests fail**

Run: `npm test -- tests/unit/nia/pending-utterances.test.ts tests/component/nia/companion-runtime.test.tsx`  
Expected: FAIL.

- [ ] **Step 3: Implement the browser transport**

Port the relevant behavior from Mochi’s `renderer/companion/audio/session.ts` and pending-turn logic into focused TypeScript modules. The companion renderer calls only the main bridge for SDP; it must not call `/api/nia/realtime-session` or send bearer credentials to OpenAI itself.

- [ ] **Step 4: Implement the transparent route**

Render only the companion runtime/avatar root, no Auris desktop frame. Keep it mounted when hidden. Ensure the route server-renders a deterministic empty shell and accesses the bridge only after mount.

- [ ] **Step 5: Run tests and lint**

Run: `npm test -- tests/unit/nia/pending-utterances.test.ts tests/component/nia/companion-runtime.test.tsx && npx eslint src/components/nia/companion src/app/nia/companion/page.tsx`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add auris/src/components/nia/companion auris/src/app/nia/companion auris/tests/unit/nia/pending-utterances.test.ts auris/tests/component/nia/companion-runtime.test.tsx
git commit -m "feat(nia): run one persistent realtime transport"
```

## Task 7: Build Nia’s animated body, bubbles, and controls

**Files:**
- Create: `auris/src/components/nia/companion/nia-avatar-canvas.tsx`
- Create: `auris/src/components/nia/companion/nia-avatar-rig.ts`
- Create: `auris/src/components/nia/companion/nia-bubble.tsx`
- Create: `auris/src/components/nia/companion/nia-companion.css`
- Test: `auris/tests/unit/nia/nia-avatar-rig.test.ts`
- Test: `auris/tests/component/nia/nia-avatar-canvas.test.tsx`

- [ ] **Step 1: Write failing state-to-motion tests**

Assert idle breath/blink, pointer-only eye following, listening halo, attending suppression of ambient motion, thinking, working, audio-driven speaking, resting eyes, reduced motion, per-pixel/geometry hit testing, bubble controls, and hover history chip.

- [ ] **Step 2: Verify tests fail**

Run: `npm test -- tests/unit/nia/nia-avatar-rig.test.ts tests/component/nia/nia-avatar-canvas.test.tsx`  
Expected: FAIL.

- [ ] **Step 3: Implement the Nia light-body rig**

Use deterministic Canvas 2D/SVG geometry, Auris violet/blue tokens, explicit eyes/torso/shoulders, spring interpolation that is interruptible, and an analyser reading actual remote audio. Port Mochi’s state priorities and hit-testing behavior, not its character artwork.

- [ ] **Step 4: Implement bubble and pointer reporting**

Provide close, copy, open-history, review start, and snooze controls. Bubble content stays bounded and scrollable; only body/bubble/control bounds make the window solid.

- [ ] **Step 5: Run visual component tests and lint**

Run: `npm test -- tests/unit/nia/nia-avatar-rig.test.ts tests/component/nia/nia-avatar-canvas.test.tsx && npx eslint src/components/nia/companion`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add auris/src/components/nia/companion auris/tests/unit/nia/nia-avatar-rig.test.ts auris/tests/component/nia/nia-avatar-canvas.test.tsx
git commit -m "feat(nia): animate the desktop light-body"
```

## Task 8: Wire Electron lifecycle, menu, and shortcuts

**Files:**
- Modify: `auris/electron/main.cjs`
- Modify: `auris/electron/menu-template.cjs`
- Create: `auris/electron/nia/companion/companion-shortcuts.cjs`
- Test: `auris/tests/unit/electron/nia/companion/main-wiring.test.ts`
- Test: `auris/tests/unit/electron/nia/companion/companion-shortcuts.test.ts`
- Modify: `auris/tests/unit/platform/desktop-window-behavior.test.ts`

- [ ] **Step 1: Write failing lifecycle tests**

Assert startup order, main-window close hides rather than quits, companion remains, Dock activation recreates/focuses main, body click opens `/nia`, `before-quit` closes transport → conversation → window → database, system suspend closes the microphone/peer immediately, resume restores only when the persisted state was awake, shortcut conflicts are diagnosed, and settings changes atomically unregister/re-register both shortcuts without losing the last working bindings on conflict.

- [ ] **Step 2: Verify tests fail**

Run: `npm test -- tests/unit/electron/nia/companion/main-wiring.test.ts tests/unit/electron/nia/companion/companion-shortcuts.test.ts tests/unit/platform/desktop-window-behavior.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Compose services in main**

Initialize one diagnostics store, one settings repository, one conversation repository, one coordinator, and one IPC service after Next server and IPC are ready. Create the companion independently from the main window, introduce a real `isQuitting` flag, and keep the app resident on macOS. Add wake/rest and show/hide shortcuts and native menus using the same coordinator actions. Subscribe to settings changes so voice/persona/grants update the coordinator and shortcut changes are re-registered safely. Bind Electron `powerMonitor` suspend/lock events to an immediate coordinator rest/transport close; remember whether the user was awake and on resume/unlock re-run credential validation before conditionally waking. Coordinator owns pre-expiry rotation timers from Task 3; main owns process power events.

- [ ] **Step 4: Run syntax and lifecycle tests**

Run: `node --check electron/main.cjs && npm test -- tests/unit/electron/nia/companion tests/unit/platform/desktop-window-behavior.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add auris/electron/main.cjs auris/electron/menu-template.cjs auris/electron/nia/companion/companion-shortcuts.cjs auris/tests/unit/electron/nia/companion auris/tests/unit/platform/desktop-window-behavior.test.ts
git commit -m "feat(nia): keep the companion alive across apps"
```

## Task 9: Replace `/nia` with the approved black control center

**Files:**
- Create: `auris/src/features/nia/use-nia-companion.ts`
- Create: `auris/src/components/nia/nia-control-center.tsx`
- Create: `auris/src/components/nia/nia-control-center.css`
- Create: `auris/src/components/nia/nia-companion-settings.tsx`
- Modify: `auris/src/components/nia/nia-standalone-surface.tsx`
- Modify: `auris/src/app/nia/page.tsx`
- Modify: `auris/src/app/nia/nia.css`
- Modify: `auris/src/components/desktop/desktop-shell-fixtures.ts`
- Test: `auris/tests/component/nia/nia-control-center.test.tsx`
- Test: `auris/tests/component/nia/nia-companion-settings.test.tsx`
- Modify: `auris/tests/component/runtime/desktop-app-sidebar.test.tsx`

- [ ] **Step 1: Write failing page tests**

Assert the sidebar Nia route, deterministic hydration, top status, central avatar stage, review sheet, unified companion composer, wake/rest/mute, right drawer tabs, advanced REST/CLI section, existing context/memory/task/tool controls, and no direct WebRTC construction. Settings tests must change the single persona's name/address/prompt/accent, offered Realtime voice, wake/show shortcuts, keep-history switch, and capability grants through the bridge and show validation/conflict receipts.

- [ ] **Step 2: Verify tests fail**

Run: `npm test -- tests/component/nia/nia-control-center.test.tsx tests/component/runtime/desktop-app-sidebar.test.tsx`  
Expected: FAIL.

- [ ] **Step 3: Implement the subscription hook and page**

Subscribe with snapshot + cursor, keep one pending typed message, retain draft on unavailable Realtime, and send only through the companion bridge. Recompose the existing panels into drawers; do not delete their stores or provider code. Label REST/CLI as a separate advanced agent run. Mount the functional companion settings surface for persona, voice, shortcuts, history retention, and capability authorization. Reserve explicit drawer slots for History, Review reminders, and Diagnostics; they render an honest “not available in this build” state until Tasks 10, 11, and 14 replace each slot, so Task 9 remains buildable without hiding the final integration work.

- [ ] **Step 4: Implement black Apple/Auris styling**

Use pure/near black, one translucent material level, Auris violet-blue accents, central spatial hierarchy, responsive bottom-sheet behavior, focus-visible states, 44px primary controls, reduced motion/transparency, and no light-theme branch.

- [ ] **Step 5: Run page regression and build**

Run: `npm test -- tests/component/nia tests/component/runtime/desktop-app-sidebar.test.tsx tests/unit/nia && npx eslint src/components/nia src/features/nia/use-nia-companion.ts src/app/nia && npm run build`  
Expected: PASS; build includes `/nia` and `/nia/companion`.

- [ ] **Step 6: Commit**

```bash
git add auris/src/app/nia auris/src/components/nia auris/src/features/nia/use-nia-companion.ts auris/src/components/desktop/desktop-shell-fixtures.ts auris/tests/component/nia auris/tests/component/runtime/desktop-app-sidebar.test.tsx
git commit -m "feat(nia): redesign the companion control center"
```

## Task 10: Add searchable history and privacy controls

**Files:**
- Create: `auris/src/components/nia/nia-history-drawer.tsx`
- Create: `auris/src/components/nia/nia-history-drawer.css`
- Modify: `auris/src/components/nia/nia-control-center.tsx`
- Modify: `auris/electron/nia/companion/companion-ipc.cjs`
- Modify: `auris/electron/preload.cjs`
- Test: `auris/tests/component/nia/nia-history-drawer.test.tsx`
- Modify: `auris/tests/unit/electron/nia/companion/companion-ipc.test.ts`

- [ ] **Step 1: Write failing history tests**

Cover list, open turns, search, provenance/time labels, cut-turn rendering, export via main save dialog, select/delete confirmation, delete-live-token restart, retention off taking effect on the next turn, and no cross-persona reads.

- [ ] **Step 2: Verify tests fail**

Run: `npm test -- tests/component/nia/nia-history-drawer.test.tsx tests/unit/electron/nia/companion/companion-ipc.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement history UI and main handlers**

Use text nodes/React escaping only, bounded query/result sizes, main-selected export destination, explicit destructive confirmation, and accurate WAL/scrub diagnostics. Replace the Task 9 History placeholder by mounting `NiaHistoryDrawer` in the control center and assert the drawer is reachable from the visible History action.

- [ ] **Step 4: Run tests and lint**

Run: `npm test -- tests/component/nia/nia-history-drawer.test.tsx tests/unit/electron/nia/companion && npx eslint src/components/nia/nia-history-drawer.tsx`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add auris/src/components/nia/nia-history-drawer* auris/src/components/nia/nia-control-center.tsx auris/electron/nia/companion/companion-ipc.cjs auris/electron/preload.cjs auris/tests/component/nia/nia-history-drawer.test.tsx auris/tests/unit/electron/nia/companion/companion-ipc.test.ts
git commit -m "feat(nia): expose local companion history"
```

## Task 11: Implement review snapshot and reminder scheduling

**Files:**
- Create: `auris/electron/nia/companion/review-snapshot.cjs`
- Create: `auris/electron/nia/companion/reminder-scheduler.cjs`
- Modify: `auris/src/components/desktop/desktop-island-sync-host.tsx`
- Create: `auris/src/features/nia/nia-review-projection.ts`
- Create: `auris/src/components/nia/nia-reminder-settings.tsx`
- Modify: `auris/src/components/nia/nia-control-center.tsx`
- Test: `auris/tests/unit/electron/nia/companion/review-snapshot.test.ts`
- Test: `auris/tests/unit/electron/nia/companion/reminder-scheduler.test.ts`
- Modify: `auris/tests/component/desktop/desktop-island-sync-host.test.tsx`
- Test: `auris/tests/unit/nia/nia-review-projection.test.ts`
- Test: `auris/tests/component/nia/nia-reminder-settings.test.tsx`

- [ ] **Step 1: Write failing scheduler tests**

Cover a separately projected bounded due set (up to 32 items, sorted by urgency), validated due items, multiple daily times, cross-midnight DND, slot dedupe, snooze 15/30/60/next, app-start catch-up once, empty/stale snapshot silence, system time changes, queue while speaking, next-normal-slot retry after auth failure, and no OS wake registration. Assert the existing desktop-island projection remains capped independently and is not widened as a side effect.

- [ ] **Step 2: Verify tests fail**

Run: `npm test -- tests/unit/electron/nia/companion/review-snapshot.test.ts tests/unit/electron/nia/companion/reminder-scheduler.test.ts tests/unit/nia/nia-review-projection.test.ts tests/component/nia/nia-reminder-settings.test.tsx`  
Expected: FAIL.

- [ ] **Step 3: Implement snapshot sync and scheduler**

Extract a dedicated companion review projection that reuses the Review queue/model rules but returns a bounded set of up to 32 due/overdue items; do not reuse the desktop-island payload unchanged because it deliberately carries one item. Sync the companion snapshot alongside the island snapshot on storage change, focus, visibility, and midnight. Store user-authored reminder times and DND only in the shared companion settings repository from Task 4; the scheduler persists only operational slot-dedupe, catch-up, and snooze state under `userData/nia`. Recompute wall-clock timers after sleep/timezone changes and inject clocks/timers in tests.

Compose the scheduler into `electron/main.cjs` in this task, bind its start/dispose to application readiness/quit, and feed coordinator state transitions so queued reminders release only when neither side is speaking. Add lifecycle assertions that `before-quit` now disposes scheduler → transport → conversation → window → database. Power resume and system time changes must call scheduler recomputation rather than create an independent interval.

- [ ] **Step 4: Implement settings UI**

Provide editable time rows, DND range, next reminder summary, silent diagnostic state, and reset. Validate before crossing IPC and again in main.

Replace the Task 9 Review reminder placeholder by mounting `NiaReminderSettings` in the control center and add a visible-path assertion to `nia-control-center.test.tsx`.

- [ ] **Step 5: Run tests**

Run: `npm test -- tests/unit/electron/nia/companion tests/component/desktop/desktop-island-sync-host.test.tsx tests/component/nia/nia-reminder-settings.test.tsx`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add auris/electron/main.cjs auris/electron/nia/companion/review-snapshot.cjs auris/electron/nia/companion/reminder-scheduler.cjs auris/src/features/nia/nia-review-projection.ts auris/src/components/desktop/desktop-island-sync-host.tsx auris/src/components/nia/nia-reminder-settings.tsx auris/src/components/nia/nia-control-center.tsx auris/tests/unit/electron/nia/companion auris/tests/unit/nia/nia-review-projection.test.ts auris/tests/component/desktop/desktop-island-sync-host.test.tsx auris/tests/component/nia/nia-reminder-settings.test.tsx auris/tests/component/nia/nia-control-center.test.tsx
git commit -m "feat(nia): schedule voice review reminders"
```

## Task 12: Close the voice-review loop and tool dispatch

**Files:**
- Modify: `auris/electron/nia/companion/realtime-coordinator.cjs`
- Modify: `auris/electron/nia/companion/companion-ipc.cjs`
- Create: `auris/electron/nia/companion/capability-registry.cjs`
- Modify: `auris/electron/main.cjs`
- Create: `auris/src/components/nia/nia-companion-sync-host.tsx`
- Modify: `auris/src/features/nia/nia-tool-registry.ts`
- Modify: `auris/src/features/nia/nia-memory-service.ts`
- Modify: `auris/src/components/desktop/desktop-app-frame.tsx`
- Modify: `auris/src/components/nia/companion/nia-bubble.tsx`
- Modify: `auris/src/components/review/review-page-client.tsx`
- Test: `auris/tests/integration/nia-review-companion.test.ts`
- Modify: `auris/tests/component/review/output-review-page.test.tsx`

- [ ] **Step 1: Write failing end-to-end state tests**

Assert due trigger → Realtime reuse/wake → brief spoken request → voice/button start → `/review?knowledgePointId=` → existing completion write → refreshed snapshot. Also assert `snooze_review_reminder` for 15/30/60/next-slot, ignore, DND, queued delivery, tool schema validation, and no duplicate Review storage. Add tests proving confirmed memory, active note/browser/reading/video/review context, and capability-version changes reach `session.update`; existing Nia memory/history/browser/workflow capabilities execute in main with their existing approval boundaries. A tool call arriving before the first transcript must be buffered and attached when the first conversation row is lazily created, not dropped.

- [ ] **Step 2: Verify tests fail**

Run: `npm test -- tests/integration/nia-review-companion.test.ts tests/component/review/output-review-page.test.tsx`  
Expected: FAIL.

- [ ] **Step 3: Implement reminder conversation request and tools**

Send bounded due-review context into the current session and expose `list_due_reviews`, `start_review`, `complete_review`, `snooze_review_reminder`, and `dismiss_review_reminder` through the existing approval/tool boundaries. Natural-language delays normalize only to 15/30/60 minutes or next slot in the main scheduler. Route visible navigation through main. Review writes continue through `output-review-storage.ts`; main holds only snapshot/reference data.

Create a main-process executable capability registry instead of treating the renderer-only `nia-tool-registry.ts` descriptor list as executable code. Adapt existing Nia services for confirmed-memory candidate creation, conversation recall, browser tools, and workflow execution; keep their current schema/approval checks. Modify `electron/main.cjs` in this task to instantiate the registry with the already-live provider runtime, browser dispatcher/session service, workflow facade, approval/grant services, memory adapter, conversation repository, reminder scheduler, and main-route opener, then inject it into the coordinator/IPC tool-call path. Add a main-wiring assertion proving there is one registry and that tool calls cannot bypass it.

Mount `NiaCompanionSyncHost` once in the desktop frame to project confirmed memory, the active explicit context card, and capability grants with monotonically increasing versions. Coordinator sends the newest versions after transport configuration is acknowledged. Buffer tool-arrival audit records until lazy conversation creation, then file them in arrival order.

- [ ] **Step 4: Run integration and Review regressions**

Run: `npm test -- tests/integration/nia-review-companion.test.ts tests/component/review tests/unit/output-review`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add auris/electron/main.cjs auris/electron/nia/companion auris/src/components/nia/nia-companion-sync-host.tsx auris/src/components/desktop/desktop-app-frame.tsx auris/src/features/nia/nia-tool-registry.ts auris/src/features/nia/nia-memory-service.ts auris/src/components/nia/companion/nia-bubble.tsx auris/src/components/review/review-page-client.tsx auris/tests/integration/nia-review-companion.test.ts auris/tests/component/review/output-review-page.test.tsx
git commit -m "feat(nia): connect reminders to review sessions"
```

## Task 13: Remove the API-key Live path and prove no fallback remains

**Files:**
- Delete: `auris/src/app/api/nia/realtime-session/route.ts`
- Replace or delete: `auris/src/features/nia/use-nia-live-session.ts`
- Modify: `auris/src/components/nia/nia-live-surface.tsx`
- Modify: `auris/src/features/nia/nia-live-session-config.ts`
- Test: `auris/tests/unit/nia/nia-live-auth-boundary.test.ts`
- Modify: `auris/tests/unit/electron/desktop-packaging.test.ts`

- [ ] **Step 1: Write a failing source-boundary test**

Scan Nia Live sources to assert there is no `OPENAI_API_KEY`, no `/api/nia/realtime-session`, no renderer bearer request to `/v1/realtime/calls`, and exactly one companion transport construction site.

- [ ] **Step 2: Verify the test fails against the old path**

Run: `npm test -- tests/unit/nia/nia-live-auth-boundary.test.ts`  
Expected: FAIL because the existing API-key route and renderer direct call remain.

- [ ] **Step 3: Remove/migrate old consumers**

Delete the server route, replace the old hook with the shared companion hook or remove it, and make `NiaLiveSurface` a compatibility presenter over the coordinator. Keep REST/CLI provider configuration untouched.

- [ ] **Step 4: Run security, packaging, and build checks**

Run: `npm test -- tests/unit/nia/nia-live-auth-boundary.test.ts tests/unit/electron/desktop-packaging.test.ts && npm run security:secrets && npm run build`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A auris/src/app/api/nia/realtime-session auris/src/features/nia/use-nia-live-session.ts auris/src/components/nia/nia-live-surface.tsx auris/src/features/nia/nia-live-session-config.ts auris/tests/unit/nia/nia-live-auth-boundary.test.ts auris/tests/unit/electron/desktop-packaging.test.ts
git commit -m "refactor(nia): remove API-key realtime fallback"
```

## Task 14: Full verification, macOS smoke test, and trajectory

**Files:**
- Create: `auris/tests/electron/nia-companion-macos-smoke.cjs`
- Create: `auris/src/components/nia/nia-diagnostics.tsx`
- Modify: `auris/src/components/nia/nia-control-center.tsx`
- Modify: `auris/electron/nia/companion/companion-ipc.cjs`
- Modify: `auris/electron/preload.cjs`
- Test: `auris/tests/component/nia/nia-diagnostics.test.tsx`
- Modify: `auris/tests/unit/electron/nia/companion/diagnostics-store.test.ts`
- Modify: `auris/package.json`
- Modify: `AGENTS.md`

- [ ] **Step 1: Add a macOS smoke harness**

Launch Electron with fake credential/SDP fixtures and a temporary userData directory. Verify companion BrowserWindow options, all-Spaces visibility calls, click-through toggles, main-window close survival, `/nia` navigation, and quit disposal without reading the real Codex login.

- [ ] **Step 2: Add diagnostic aggregation tests and UI**

Wire the Task 1 diagnostics store through main into credential, transport-report, database, scheduler, shortcut, and coordinator error paths. Expose bounded list/subscribe/clear IPC through the already constrained main-renderer bridge. Cover missing Codex environment, unreadable/malformed auth, no login, expired token, credential refusal, SDP failure, microphone denial, unconfirmed session configuration, database failure, stale Review snapshot, shortcut conflict, transport crash, and scheduler failure. Every diagnostic contains timestamp, component, stable code, redacted detail, and recovery guidance; it contains no token, secret, full SDP, or unnecessary transcript.

Implement the passive user-opened UI, replace the Task 9 Diagnostics placeholder in `NiaControlCenter`, and test that failures never create notifications or speech while remaining visibly inspectable on demand.

- [ ] **Step 3: Run the complete targeted suite**

Run: `npm test -- tests/unit/electron/nia/companion tests/unit/nia tests/component/nia tests/integration/nia-review-companion.test.ts tests/component/review tests/unit/output-review`  
Expected: PASS.

- [ ] **Step 4: Run static and production checks**

Run: `node --check electron/main.cjs && node --check electron/nia/companion-preload.cjs && npx eslint src/app/nia src/components/nia src/features/nia electron/nia/companion && git diff --check && npm run build && npm run quality:desktop-ipc && npm run security:secrets`  
Expected: PASS, allowing only explicitly documented pre-existing repository warnings.

- [ ] **Step 5: Run the Electron/macOS smoke test**

Run: `npm run nia:companion-smoke`  
Expected: PASS; no persistent validation processes remain.

- [ ] **Step 6: Perform manual visual/interaction verification**

At 1440×900 and 1280×720 verify the black `/nia` page, drawer responsiveness, body/eye state changes, reduced motion, desktop click-through, drag persistence, switching to another app, closing the main window, and `Command+Q`. While another application owns focus, verify both global shortcuts. Right-click the companion and verify wake/rest, mute, show/hide, open Nia, settings, and quit actions. Use a test account/session only for the final real Codex OAuth check and do not capture tokens in logs or screenshots.

- [ ] **Step 7: Append the engineering trajectory**

Record interpretation, implementation path, files and responsibilities, commands/results, encountered problems, fixes, remaining OAuth/upstream risk, and the pinned Mochi commit. Do not include private reasoning or tool transcripts.

- [ ] **Step 8: Commit**

```bash
git add auris/tests/electron/nia-companion-macos-smoke.cjs auris/src/components/nia/nia-diagnostics.tsx auris/src/components/nia/nia-control-center.tsx auris/electron/nia/companion/companion-ipc.cjs auris/electron/preload.cjs auris/tests/component/nia/nia-diagnostics.test.tsx auris/tests/unit/electron/nia/companion/diagnostics-store.test.ts auris/package.json AGENTS.md
git commit -m "test(nia): verify the Mochi-style companion"
```

## Completion gate

Do not merge or hand off until all of the following are true:

- one and only one Realtime transport exists;
- no Nia Live API-key path remains;
- companion persists after main-window close and across macOS applications;
- `Command+Q` closes microphone, transport, persistence, and companion window;
- empty wakes create no archive rows and interruptions save only played speech;
- `/nia` preserves existing context, memory, tasks, routing, tools, and workflows;
- scheduled review voice, DND, snooze, catch-up, start, and completion are verified;
- build, targeted tests, IPC contract, secret scan, and macOS smoke test pass;
- unrelated user changes in the original worktree remain untouched.
