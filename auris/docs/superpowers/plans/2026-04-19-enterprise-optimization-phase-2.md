# Enterprise Optimization Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make desktop module entry in `english-shadowing-web` feel faster and more reliable by removing unnecessary full-page transitions, shrinking fixed click delays, and preheating the heaviest routes without changing any product functionality.

**Architecture:** Keep the current routes and desktop-shell surfaces, but normalize internal jumps onto App Router semantics, centralize bounded route prefetching in a small feature hook, and add explicit loading boundaries for the heaviest desktop pages. Preserve all existing visuals and route targets while changing only how navigation is committed and warmed up.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Vitest, Playwright, Electron desktop bridge

---

## Spec Reference

- Design spec: `docs/superpowers/specs/2026-04-19-enterprise-optimization-phase-2-design.md`

## Ground Rules

- Do not reduce, hide, or silently degrade any functionality.
- Preserve all current route paths and visible entry points.
- Keep modifier-key and non-left-click behavior native.
- Keep burst or motion affordances unless motion preference disables them.
- Prefer minimal, targeted loading and navigation changes over broad rewrites.
- End each task at a testable checkpoint.

## File Map

### Existing Files To Modify

- `src/components/runtime/desktop-app-sidebar.tsx`
- `src/components/runtime/desktop-app-frame.tsx`
- `src/components/home/desktop-home-shell.tsx`
- `src/components/workspace/workspace-shell.tsx`
- `src/app/workspace/page.tsx`
- `src/app/notes/page.tsx`
- `tests/component/runtime/desktop-app-sidebar.test.tsx`
- `tests/component/runtime/desktop-app-frame.test.tsx`
- `tests/component/home/desktop-home-shell.test.tsx`
- `tests/component/home/desktop-home-shell-courses-link.test.tsx`
- `tests/component/workspace/workspace-library.test.tsx`

### New Files To Create

- `src/features/navigation/use-desktop-route-prefetch.ts`
- `src/components/runtime/desktop-module-loading-shell.tsx`
- `tests/unit/navigation/use-desktop-route-prefetch.test.tsx`

## Implementation Order

1. Lock in route-prefetch and navigation timing expectations with tests.
2. Add the desktop route-prefetch helper and wire it into the desktop frame.
3. Normalize home and workspace internal links to client-side navigation.
4. Replace the sidebar fixed delay with adaptive commit timing.
5. Add explicit loading boundaries for `workspace` and `notes`.
6. Run targeted verification, then full lint, tests, and build.

## Task 1: Lock The Navigation Contract

**Files:**
- Create: `tests/unit/navigation/use-desktop-route-prefetch.test.tsx`
- Modify: `tests/component/runtime/desktop-app-sidebar.test.tsx`
- Modify: `tests/component/runtime/desktop-app-frame.test.tsx`
- Modify: `tests/component/home/desktop-home-shell.test.tsx`
- Modify: `tests/component/home/desktop-home-shell-courses-link.test.tsx`
- Modify: `tests/component/workspace/workspace-library.test.tsx`

- [ ] **Step 1: Add a hook test for staggered desktop route prefetch**

Test the expected route order and delay behavior:

```tsx
it("prefetches the desktop priority routes in a staggered sequence", () => {
  vi.useFakeTimers();
  const prefetch = vi.fn();

  renderHook(() => useDesktopRoutePrefetch({ router: { prefetch } }));

  vi.advanceTimersByTime(DESKTOP_ROUTE_PREFETCH_DELAY_MS);
  expect(prefetch).toHaveBeenCalledWith("/workspace");
});
```

- [ ] **Step 2: Add a hook cleanup test**

Run: `npx vitest run tests/unit/navigation/use-desktop-route-prefetch.test.tsx`

Expected: FAIL until the hook exists.

- [ ] **Step 3: Update sidebar tests to reflect adaptive commit timing**

Keep existing assertions for:

- hover prefetch
- native modified clicks
- burst state

Change the click timing expectation so:

- a non-prefetched click still waits a short bounded delay
- an already-prefetched click commits immediately

- [ ] **Step 4: Update desktop frame tests to expect route warmup**

Assert the frame schedules prefetch calls for the bounded desktop route set.

- [ ] **Step 5: Update home-shell tests for client navigation semantics**

Add assertions for:

- the primary action still delays slightly, but far less than before
- the default navigation path uses router navigation
- the internal links still point to the same routes

- [ ] **Step 6: Confirm workspace shortcut links still target notes and assessment**

Run:

```bash
npx vitest run \
  tests/component/runtime/desktop-app-sidebar.test.tsx \
  tests/component/runtime/desktop-app-frame.test.tsx \
  tests/component/home/desktop-home-shell.test.tsx \
  tests/component/home/desktop-home-shell-courses-link.test.tsx \
  tests/component/workspace/workspace-library.test.tsx
```

Expected: PASS after the implementation catches up.

## Task 2: Add Controlled Desktop Route Prefetch

**Files:**
- Create: `src/features/navigation/use-desktop-route-prefetch.ts`
- Modify: `src/components/runtime/desktop-app-frame.tsx`
- Test: `tests/unit/navigation/use-desktop-route-prefetch.test.tsx`
- Test: `tests/component/runtime/desktop-app-frame.test.tsx`

- [ ] **Step 1: Create a focused route-prefetch hook**

The hook should own:

- the desktop route list
- initial warmup delay
- staggered scheduling
- duplicate-prefetch suppression
- a test reset helper

- [ ] **Step 2: Keep the implementation tiny and side-effect focused**

Representative structure:

```ts
const prefetchedRoutes = new Set<string>();

export function useDesktopRoutePrefetch({ router }: Input) {
  useEffect(() => {
    // schedule staggered router.prefetch(route)
  }, [router]);
}
```

- [ ] **Step 3: Wire the hook into `DesktopAppFrame`**

Call it once per desktop frame mount with the App Router instance.

- [ ] **Step 4: Run the hook and frame tests**

Run:

```bash
npx vitest run \
  tests/unit/navigation/use-desktop-route-prefetch.test.tsx \
  tests/component/runtime/desktop-app-frame.test.tsx
```

Expected: PASS.

## Task 3: Normalize Home And Workspace Internal Route Entry

**Files:**
- Modify: `src/components/home/desktop-home-shell.tsx`
- Modify: `src/components/workspace/workspace-shell.tsx`
- Modify: `tests/component/home/desktop-home-shell.test.tsx`
- Modify: `tests/component/home/desktop-home-shell-courses-link.test.tsx`
- Modify: `tests/component/workspace/workspace-library.test.tsx`

- [ ] **Step 1: Replace home internal anchors with `next/link`**

Convert:

- primary action anchor
- secondary actions
- section action links

while preserving the same class names and route targets.

- [ ] **Step 2: Replace default primary navigation from `window.location.assign(...)` to router push**

The default callback should use App Router navigation while preserving the burst interaction.

- [ ] **Step 3: Shrink the default home primary delay to a short bounded transition window**

Keep:

- burst state
- reduced-motion bypass
- duplicate timer cleanup

Change:

- default delay from an MVP-scale wait to a short enterprise-safe transition window

- [ ] **Step 4: Convert workspace notes and assessment shortcuts to `next/link`**

Do not change labels or counts.

- [ ] **Step 5: Run the affected component tests**

Run:

```bash
npx vitest run \
  tests/component/home/desktop-home-shell.test.tsx \
  tests/component/home/desktop-home-shell-courses-link.test.tsx \
  tests/component/workspace/workspace-library.test.tsx
```

Expected: PASS.

## Task 4: Replace Fixed Sidebar Delay With Adaptive Commit Timing

**Files:**
- Modify: `src/components/runtime/desktop-app-sidebar.tsx`
- Modify: `tests/component/runtime/desktop-app-sidebar.test.tsx`

- [ ] **Step 1: Preserve the current burst visual state model**

Keep:

- ripple positioning
- burst particles
- duplicate-click suppression
- cleanup of pending timers

- [ ] **Step 2: Compute commit timing from prefetch state**

Expected behavior:

- already-prefetched routes commit immediately
- not-yet-prefetched routes use only a small fallback delay

- [ ] **Step 3: Keep native browser behavior for modified clicks**

Do not regress:

- middle click
- meta click
- ctrl click
- shift click
- alt click

- [ ] **Step 4: Re-run the sidebar test file**

Run: `npx vitest run tests/component/runtime/desktop-app-sidebar.test.tsx`

Expected: PASS.

## Task 5: Add Explicit Loading Boundaries For Heavy Routes

**Files:**
- Create: `src/components/runtime/desktop-module-loading-shell.tsx`
- Modify: `src/app/workspace/page.tsx`
- Modify: `src/app/notes/page.tsx`

- [ ] **Step 1: Create a lightweight desktop loading shell**

The loading shell should:

- reuse `DesktopAppFrame`
- keep the correct active nav id and workspace context
- show a minimal loading message inside the existing desktop panel language

- [ ] **Step 2: Convert workspace route entry to a dynamic import**

Wrap both:

- `WorkspaceShell`
- `DesktopChatShell`

with route-level loading fallbacks that preserve the correct active navigation surface.

- [ ] **Step 3: Convert notes route entry to a dynamic import**

Wrap `NotesPageClient` with a matching desktop loading shell.

- [ ] **Step 4: Run a production build to confirm route entry still compiles**

Run: `npm run build`

Expected: PASS.

## Task 6: Final Verification

**Files:**
- Verify the changed source files and tests only

- [ ] **Step 1: Run the targeted navigation and desktop-shell suite**

```bash
npx vitest run \
  tests/unit/navigation/use-desktop-route-prefetch.test.tsx \
  tests/component/runtime/desktop-app-sidebar.test.tsx \
  tests/component/runtime/desktop-app-frame.test.tsx \
  tests/component/home/desktop-home-shell.test.tsx \
  tests/component/home/desktop-home-shell-courses-link.test.tsx \
  tests/component/workspace/workspace-library.test.tsx
```

- [ ] **Step 2: Run the full test suite**

```bash
npm run test
```

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

- [ ] **Step 4: Run the production build**

```bash
npm run build
```

## Success Criteria

- [ ] Desktop internal route entry no longer depends on full-page document navigation.
- [ ] Sidebar route transitions commit faster without losing burst or click-safety behavior.
- [ ] Desktop frame prefetches a bounded set of high-value module routes.
- [ ] Workspace and notes route entry use explicit loading boundaries.
- [ ] Targeted tests, full tests, lint, and build all pass.
