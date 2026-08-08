# Persistent Sidebar Insights Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the expanded home-side rail with a 248px actionable insights panel that reflects foreground app time and actual recently edited notes.

**Architecture:** Keep `DesktopAppFrame` as the lifecycle and data owner. A framework-free activity ledger stores per-day foreground time in local storage; a hook bridges browser visibility/focus lifecycle events to that ledger. `DesktopSidebarInsights` stays display-focused, while `DesktopAppSidebar` swaps its collapsed navigation sections for the panel only in the existing expanded persistent-home state.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest + Testing Library, Playwright, browser localStorage.

---

## File structure

- Create: `src/features/app-activity/usage-tracker.ts` — versioned local-storage ledger, interval safety, day grouping, heatmap buckets.
- Create: `src/features/app-activity/use-app-usage-tracker.ts` — focus/visibility/pagehide listeners and live usage summary hook.
- Create: `src/components/desktop/desktop-sidebar-insights.tsx` — presentational 248px insight content and intent callbacks.
- Modify: `src/components/desktop/desktop-app-frame.tsx` — own the tracker and recent-note loading, close-before-panel-navigation callback, prop plumbing.
- Modify: `src/components/desktop/desktop-app-sidebar.tsx` — replace expanded persistent-home empty state with `DesktopSidebarInsights`.
- Modify: `src/styles/auris-theme.css` and `src/styles/auris-redesign.css` — remove stale unused expanded-panel rules and add scoped dark/brass panel layout without changing rail/wide variables.
- Create: `tests/unit/app-activity/usage-tracker.test.ts` — deterministic ledger and heatmap tests.
- Create: `tests/component/runtime/desktop-sidebar-insights.test.tsx` — presentational actions, recent-note, loading, and empty-state tests.
- Modify: `tests/component/runtime/desktop-app-sidebar.test.tsx`, `tests/component/runtime/desktop-app-frame.test.tsx`, and `tests/e2e/desktop-sidebar-hover.spec.ts` — integration and hover/navigation regression coverage.

### Task 1: Activity ledger

**Files:**
- Create: `src/features/app-activity/usage-tracker.ts`
- Create: `tests/unit/app-activity/usage-tracker.test.ts`

- [ ] **Step 1: Write failing unit tests for elapsed foreground time and durable totals**

```ts
it("adds only positive, bounded active time to the local calendar day", () => {
  const result = recordActiveElapsed({ now: at("2026-06-20T10:00:30"), startedAt: at("2026-06-20T10:00:00"), totals: {} });
  expect(result["2026-06-20"]).toBe(30_000);
});

it("does not count a single inactive or sleep-sized gap", () => {
  expect(recordActiveElapsed({ now: at("2026-06-20T12:00:00"), startedAt: at("2026-06-20T10:00:00"), totals: {} })).toEqual({});
});
```

- [ ] **Step 2: Run the new test file and verify it fails because the activity module does not exist**

Run: `npm test -- tests/unit/app-activity/usage-tracker.test.ts`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the minimal pure ledger API**

Implement `readUsageTotals`, `writeUsageTotals`, `recordActiveElapsed`, `buildUsageHeatmap`, and `usageToneForMilliseconds`. Use a versioned storage key, local `YYYY-MM-DD` keys, a 30-second maximum single segment, and an explicit day-boundary split.

- [ ] **Step 4: Re-run the unit test and verify it passes**

Run: `npm test -- tests/unit/app-activity/usage-tracker.test.ts`

Expected: PASS.

- [ ] **Step 5: Add the day-boundary and color-bucket tests, then make them green**

Run: `npm test -- tests/unit/app-activity/usage-tracker.test.ts`

Expected: PASS with coverage for zero, 1–15, 16–45, 46–90, and 90+ minute tones.

### Task 2: Browser lifecycle hook

**Files:**
- Create: `src/features/app-activity/use-app-usage-tracker.ts`
- Modify: `tests/unit/app-activity/usage-tracker.test.ts`

- [ ] **Step 1: Write a failing hook test for focus/visibility lifecycle**

```tsx
renderHook(() => useAppUsageTracker({ storage: window.localStorage }));
act(() => window.dispatchEvent(new Event("blur")));
// advancing the clock while unfocused does not change today.totalMilliseconds
```

- [ ] **Step 2: Run the activity tests and verify the hook import fails**

Run: `npm test -- tests/unit/app-activity/usage-tracker.test.ts`

Expected: FAIL with module-not-found for the hook.

- [ ] **Step 3: Implement active-segment lifecycle handling**

Start segments only when `document.visibilityState === "visible"` and `document.hasFocus()` are true. Flush on `blur`, hidden `visibilitychange`, and `pagehide`; resume on `focus` and visible `visibilitychange`; refresh the exposed summary at a bounded interval; clean listeners and interval on unmount.

- [ ] **Step 4: Re-run the activity tests and verify focus-loss is not counted**

Run: `npm test -- tests/unit/app-activity/usage-tracker.test.ts`

Expected: PASS.

### Task 3: Display-focused insights panel

**Files:**
- Create: `src/components/desktop/desktop-sidebar-insights.tsx`
- Create: `tests/component/runtime/desktop-sidebar-insights.test.tsx`

- [ ] **Step 1: Write failing panel tests**

Cover three supplied recent notes, empty notes, compact loading state, heatmap cells with accessible duration labels, and callbacks for the individual note, all-notes, and review actions.

- [ ] **Step 2: Run the panel test and verify it fails because the component does not exist**

Run: `npm test -- tests/component/runtime/desktop-sidebar-insights.test.tsx`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the presentational panel**

Render only data passed by props. Use buttons for each recent note, `查看全部`, and `今日回顾 →`; no direct router, storage, or timer ownership. Limit rows to three in the caller or component contract.

- [ ] **Step 4: Re-run the panel test and verify all actions pass through**

Run: `npm test -- tests/component/runtime/desktop-sidebar-insights.test.tsx`

Expected: PASS.

### Task 4: Frame and sidebar wiring

**Files:**
- Modify: `src/components/desktop/desktop-app-frame.tsx`
- Modify: `src/components/desktop/desktop-app-sidebar.tsx`
- Modify: `tests/component/runtime/desktop-app-frame.test.tsx`
- Modify: `tests/component/runtime/desktop-app-sidebar.test.tsx`

- [ ] **Step 1: Write failing integration tests**

Assert that an expanded persistent-home sidebar renders the insights panel rather than nav links; loading a memory `NotesStorage` produces the three newest `updatedAt` summaries; and every panel action invokes the frame's close-before-router navigation path.

- [ ] **Step 2: Run the focused component tests and verify the new expectations fail**

Run: `npm test -- tests/component/runtime/desktop-app-frame.test.tsx tests/component/runtime/desktop-app-sidebar.test.tsx`

Expected: FAIL because expanded home has no rendered insight content.

- [ ] **Step 3: Implement minimal data and navigation ownership**

When the persistent-home sidebar opens, load `getNotesStorage()?.listPages()` and retain the first three sorted summaries. Pass the app-usage summary plus callbacks into `DesktopAppSidebar`. Each callback calls `hideSidebarImmediately()` before `router.push()`. Do not change non-home hover behavior or the collapsed navigation rail.

- [ ] **Step 4: Re-run focused component tests**

Run: `npm test -- tests/component/runtime/desktop-app-frame.test.tsx tests/component/runtime/desktop-app-sidebar.test.tsx tests/component/runtime/desktop-sidebar-insights.test.tsx`

Expected: PASS.

### Task 5: Scoped visual implementation

**Files:**
- Modify: `src/styles/auris-theme.css`
- Modify: `src/styles/auris-redesign.css`

- [ ] **Step 1: Add only sidebar-insight scoped styles**

Keep `--auris-sidebar-rail: 76px` and `--auris-sidebar-wide: 248px`. Make the insight area use a single-column matte ink panel, 12×7 compact heatmap, brass duration tones, low-contrast separators, and independently scrollable body. Remove or neutralize stale `.auris-sidebar-extra` declarations that refer to markup no longer rendered.

- [ ] **Step 2: Run the focused component tests to confirm style selectors did not change semantics**

Run: `npm test -- tests/component/runtime/desktop-app-frame.test.tsx tests/component/runtime/desktop-app-sidebar.test.tsx tests/component/runtime/desktop-sidebar-insights.test.tsx`

Expected: PASS.

### Task 6: Browser regression coverage and verification

**Files:**
- Modify: `tests/e2e/desktop-sidebar-hover.spec.ts`

- [ ] **Step 1: Extend the existing home-hover test with a failing content assertion**

Assert the existing middle expand zone opens the insight panel at 248px, omits lower nav icons, and exposes recent-note / review controls.

- [ ] **Step 2: Run the single Playwright spec and verify the new assertion fails**

Run: `npm run playwright:test -- tests/e2e/desktop-sidebar-hover.spec.ts`

Expected: FAIL before integration implementation, then PASS afterward.

- [ ] **Step 3: Add action coverage**

Click a recent note and `今日回顾 →`; verify client-side navigation and closed-panel state. Retain the short-height viewport assertion.

- [ ] **Step 4: Run final checks**

Run:

```bash
npm test -- tests/unit/app-activity/usage-tracker.test.ts tests/component/runtime/desktop-sidebar-insights.test.tsx tests/component/runtime/desktop-app-frame.test.tsx tests/component/runtime/desktop-app-sidebar.test.tsx
npm run playwright:test -- tests/e2e/desktop-sidebar-hover.spec.ts
npm run lint
```

Expected: all pass.

- [ ] **Step 5: Commit the implementation**

```bash
git add src/features/app-activity src/components/desktop src/styles/auris-theme.css src/styles/auris-redesign.css tests/unit/app-activity tests/component/runtime tests/e2e/desktop-sidebar-hover.spec.ts docs/superpowers/plans/2026-06-20-persistent-sidebar-insights.md
git commit -m "feat: populate persistent sidebar insights"
```
