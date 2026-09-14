# V10 Product Polish Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a 10-round polish cycle that turns the current local-first shadowing app into a more surprising, comfortable, and product-complete desktop experience.

**Architecture:** Keep the existing local-first shell and functional boundaries intact while upgrading the most visible surfaces: desktop home, training intake, playback dock, and shared shell polish. The implementation should favor focused UI composition, stronger product copy, clearer state summaries, and test-backed incremental changes.

**Tech Stack:** Next.js App Router, React 19, Electron renderer shell, shared global CSS, Vitest, Playwright

---

## File Map

### Create

- `task_plan.md`
- `findings.md`
- `progress.md`
- `docs/superpowers/specs/2026-03-27-v10-polish-design.md`
- `docs/superpowers/plans/2026-03-27-v10-polish-plan.md`

### Modify

- `src/components/home/desktop-home-shell.tsx`
- `src/components/workspace/workspace-shell.tsx`
- `src/components/workspace/source-panel.tsx`
- `src/components/player/playback-dock.tsx`
- `src/components/runtime/desktop-app-frame.tsx`
- `src/app/globals.css`
- `tests/component/home/desktop-home-shell.test.tsx`
- `tests/component/workspace/source-panel.test.tsx`
- `tests/component/player/playback-dock.test.tsx`
- `tests/e2e/app-smoke.spec.ts`

## Task 1: Upgrade The Desktop Home

**Files:**
- Modify: `src/components/home/desktop-home-shell.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/component/home/desktop-home-shell.test.tsx`
- Test: `tests/e2e/app-smoke.spec.ts`

- [ ] Add a stronger hero structure with headline, supporting copy, and rhythm cues
- [ ] Add compact growth/status signals without breaking resume links
- [ ] Make empty states feel intentional instead of blank
- [ ] Keep existing accessibility and resume behavior intact

## Task 2: Turn Training Intake Into A Launchpad

**Files:**
- Modify: `src/components/workspace/source-panel.tsx`
- Modify: `src/components/workspace/workspace-shell.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/component/workspace/source-panel.test.tsx`
- Test: `tests/e2e/app-smoke.spec.ts`

- [ ] Reframe source panel as a guided training launch area
- [ ] Surface voice, rhythm, repetition, and import affordances more clearly
- [ ] Add benefit-oriented copy and stronger visual hierarchy
- [ ] Preserve current POST/prepare/playback request behavior

## Task 3: Enrich Playback And Practice Feedback

**Files:**
- Modify: `src/components/player/playback-dock.tsx`
- Modify: `src/components/workspace/workspace-shell.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/component/player/playback-dock.test.tsx`

- [ ] Add clearer compact-state wording and richer expanded-state summaries
- [ ] Make active practice status feel more alive and less generic
- [ ] Keep control behavior stable while improving feedback density

## Task 4: Shared Shell Polish

**Files:**
- Modify: `src/components/runtime/desktop-app-frame.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/e2e/app-smoke.spec.ts`

- [ ] Improve workspace meta presentation
- [ ] Tighten spacing, section tone, and visual hierarchy
- [ ] Preserve existing navigation and workspace structure

## Task 5: Verification And Iteration Notes

**Files:**
- Modify: `progress.md`
- Modify: `findings.md`
- Modify: `task_plan.md`

- [ ] Record each iteration outcome and reflection
- [ ] Run lint, test, build, and targeted Playwright checks
- [ ] Capture final summary with reusable lessons

