# Enterprise Optimization Phase 2 Design

- Date: 2026-04-19
- Project: `english-shadowing-web`
- Status: Approved in chat as approach A, written to file

## Summary

This design defines the second phase of enterprise-level optimization for `english-shadowing-web`.

Phase 1 established cleaner module boundaries. Phase 2 focuses on the next user-visible problem: desktop module entry and cross-module navigation feel slower than they should.

The approved direction is:

- keep all existing product functionality
- improve module-entry responsiveness without introducing unstable "instant-switch" behavior
- convert internal full-page jumps into safe client-side navigation
- replace fixed transition waits with adaptive, bounded commit timing
- preheat high-value desktop module routes in a controlled way
- keep heavy module loading behind explicit route boundaries instead of eager page-level work

## Product Decisions Confirmed In Chat

The user approved the following:

- continue optimization phase by phase
- prioritize the real "click into another module feels slow" problem
- preserve all existing functionality
- avoid making navigation so aggressive that it causes unstable behavior
- execute the recommended approach A:
  - normalize internal navigation to client-side routing
  - reduce fixed delays into safe adaptive delays
  - add bounded route prefetching
  - improve heavy desktop module entry behavior

## Goals

- Reduce perceived delay when entering other desktop modules.
- Keep desktop navigation visually polished while removing unnecessary waiting.
- Eliminate avoidable full document reloads for internal module jumps.
- Improve first entry into heavy modules such as `workspace` and `notes`.
- Keep the optimization bounded, testable, and behavior-preserving.

## Non-Goals

- Do not redesign page visuals or interaction patterns.
- Do not remove burst, ripple, or desktop-shell motion affordances entirely.
- Do not rewrite route architecture or add a shared app layout in this phase.
- Do not change business logic in workspace, notes, assessment, or video flows.
- Do not introduce aggressive caching or keep-alive behavior that is hard to reason about.

## Hard Invariants

### 1. Zero Feature Loss

Every existing module entry point must remain reachable with the same route targets and visible controls.

This includes:

- desktop sidebar navigation
- desktop home primary and secondary actions
- workspace shortcuts into assessment and notes
- notes, workspace, assessment, video, audio, documents, community, and chat route entry

### 2. Behavior Safety Over Raw Speed

Navigation should feel faster, but must still guard against:

- duplicate click commits
- broken modifier-key navigation
- motion preference violations
- unstable route churn during burst animations

### 3. Client Navigation For Internal Routes

Internal route transitions should use App Router semantics where possible.

Internal navigation should not fall back to:

- `window.location.assign(...)`
- plain internal `<a href="/...">` usage that causes full-page reload behavior

unless a route explicitly requires native browser behavior.

### 4. Controlled Prefetching

Prefetching must be:

- limited to a small route set
- staggered instead of all-at-once
- safe to repeat across remounts
- easy to reset or test

### 5. Evidence Before Claims

Speed improvements must be grounded in code-path evidence and verification, not intuition alone.

## Findings That Motivated This Phase

### A. Sidebar Navigation Has A Hard-Coded Delay

In `src/components/runtime/desktop-app-sidebar.tsx`, the navigation flow currently delays route commit behind a fixed timeout:

- `NAVIGATION_BURST_DELAY_MS = 96`
- `router.push(item.href)` happens inside a delayed timeout

This means the UI intentionally waits before committing the route, even when the route is already prefetched.

### B. Home Module Entry Uses Full-Page Navigation

In `src/components/home/desktop-home-shell.tsx`, the primary action defaults to `window.location.assign(...)`, and the home page still renders several internal module jumps as plain anchors.

That creates avoidable full-page navigation behavior for routes that should be cheap client transitions.

### C. Workspace Still Uses Plain Internal Anchors

In `src/components/workspace/workspace-shell.tsx`, the top-right library shortcuts into assessment and notes are plain internal anchors instead of App Router links.

### D. Heavy Routes Are Real, Not Imagined

Production build artifacts show materially larger client route chunks for:

- `/workspace`: about `79.3 KB`
- `/notes`: about `70.1 KB`

compared with lighter module pages such as:

- `/audio`: about `3.6 KB`
- `/documents`: about `3.6 KB`

This means a user can feel both:

- unnecessary navigation waiting
- real route-bundle load cost on first entry

## Chosen Design

The approved phase-two rule is:

`desktop route entry -> client navigation -> bounded commit delay -> controlled route warmup`

This phase has four concrete slices.

### Slice A: Normalize Internal Navigation Semantics

Convert internal desktop module jumps from native document navigation to App Router navigation where appropriate.

Target surfaces:

- desktop home primary action
- desktop home secondary actions
- desktop home section action links
- workspace shortcuts into assessment and notes

Primary outcome:

- internal desktop route changes stop paying the cost of full document navigation

### Slice B: Replace Fixed Sidebar Delay With Adaptive Commit Timing

Keep the sidebar burst interaction, but stop treating every click as equally expensive.

Approved behavior:

- if a route was already prefetched before click, commit navigation immediately
- if the route was not prefetched, allow only a small bounded delay before commit
- keep modified-click behavior native
- keep duplicate click suppression

Primary outcome:

- the sidebar still feels intentional, but no longer artificially slow

### Slice C: Add Controlled Desktop Route Prefetch

Introduce a small feature-layer route-prefetch helper that:

- prefetches only a bounded set of desktop routes
- staggers requests after mount
- avoids repeatedly prefetching the same route every time the frame remounts
- remains easy to verify in tests

Initial route set:

- `/workspace`
- `/workspace?view=chat`
- `/notes`
- `/assessment`
- `/video`

This route set intentionally favors the modules most likely to be entered from the desktop shell and the routes with the largest current chunks.

### Slice D: Keep Heavy Module Entry Behind Explicit Loading Boundaries

Heavy route entry should remain lazy at the page boundary instead of being treated like a synchronous page swap.

Approved approach:

- use route-level dynamic imports for the heaviest desktop entry modules first
- provide lightweight desktop-shell loading fallbacks
- keep visible route targets and route semantics unchanged

Initial heavy entry targets:

- `src/app/workspace/page.tsx`
- `src/app/notes/page.tsx`

## File Blueprint

### Existing Files To Modify

- `src/components/runtime/desktop-app-sidebar.tsx`
- `src/components/runtime/desktop-app-frame.tsx`
- `src/components/home/desktop-home-shell.tsx`
- `src/components/workspace/workspace-shell.tsx`
- `src/app/workspace/page.tsx`
- `src/app/notes/page.tsx`

### New Files To Create

- `src/features/navigation/use-desktop-route-prefetch.ts`
  - staggered desktop route warmup
  - duplicate-prefetch suppression
  - test reset helper

- `src/components/runtime/desktop-module-loading-shell.tsx`
  - lightweight loading shell for heavy desktop route entry

### Tests To Create Or Modify

- modify `tests/component/runtime/desktop-app-sidebar.test.tsx`
- modify `tests/component/runtime/desktop-app-frame.test.tsx`
- modify `tests/component/home/desktop-home-shell.test.tsx`
- modify `tests/component/home/desktop-home-shell-courses-link.test.tsx`
- modify `tests/component/workspace/workspace-library.test.tsx`
- create `tests/unit/navigation/use-desktop-route-prefetch.test.tsx`

## Why This Design Is The Right Size

This phase deliberately avoids riskier options such as:

- persistent keep-alive module caches
- shared mutable cross-route shells
- hidden preloading of every desktop route
- broad route architecture rewrites

Those options can improve speed further, but they also add complexity and regression surface. The selected design improves the current bottlenecks while keeping the system understandable and testable.

## Testing Strategy

Verification should cover both behavior preservation and the new loading model.

### Unit Or Hook-Level Checks

- controlled desktop route prefetch is staggered and deduplicated
- cleanup cancels scheduled prefetch work

### Component Checks

- sidebar still prefetches on hover or focus
- sidebar now commits navigation immediately when already prefetched
- home primary action still shows burst behavior, but commits far sooner by default
- home internal links still target the same routes
- workspace shortcut links still target the same routes
- desktop frame triggers bounded route warmup

### Whole-Project Verification

- `npm run lint`
- `npm run test`
- `npm run build`

If route-entry behavior looks suspicious after code changes, add or run Playwright coverage for the sidebar and desktop module-entry flows.

## Success Criteria

- Internal desktop module navigation no longer relies on full-page document transitions.
- Sidebar route switches feel noticeably faster while preserving duplicate-click and modifier-key safety.
- The desktop frame warms important module routes in a bounded way.
- Workspace and notes route entry retain clear loading boundaries.
- All relevant tests, lint, and build pass.
