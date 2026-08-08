# Desktop Surface Unification Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the desktop UI shell so the app feels like one integrated local product with left-side product navigation, cleaner buttons, and workspace regions separated by structure instead of stacked web cards.

**Architecture:** Move global navigation into a persistent left product column, make the workspace viewport a single shared shell, and restyle notes, training, and assessment so each workspace uses the same visual grammar: one unified surface, subtle sectional tone shifts, restrained borders, and aligned row-based interactions.

**Tech Stack:** Next.js App Router, React 19, Electron renderer shell, shared global CSS, Vitest, Playwright

---

## File Map

### Create

- `docs/superpowers/plans/2026-03-26-desktop-surface-unification-plan.md`

### Modify

- `docs/superpowers/specs/2026-03-25-local-first-desktop-app-design.md`
- `src/components/runtime/desktop-app-frame.tsx`
- `src/components/runtime/desktop-app-sidebar.tsx`
- `src/components/home/desktop-home-shell.tsx`
- `src/components/workspace/workspace-shell.tsx`
- `src/components/workspace/workspace-sidebar.tsx`
- `src/components/assessment/assessment-shell.tsx`
- `src/components/notes/notes-shell.tsx`
- `src/components/notes/notes-sidebar.tsx`
- `src/app/globals.css`
- `tests/component/home/desktop-home-shell.test.tsx`
- `tests/component/notes/notes-shell.test.tsx`
- `tests/component/workspace/source-panel.test.tsx`
- `tests/component/assessment/assessment-shell.test.tsx`
- `tests/e2e/app-smoke.spec.ts`

## Task 1: Convert The Global Desktop Shell To A Left Product Navigation

**Files:**
- Modify: `src/components/runtime/desktop-app-frame.tsx`
- Modify: `src/components/runtime/desktop-app-sidebar.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/component/home/desktop-home-shell.test.tsx`
- Test: `tests/e2e/app-smoke.spec.ts`

- [ ] **Step 1: Update frame and navigation tests for the new shell orientation**
- [ ] **Step 2: Move global navigation from the top chip row into a left product column**
- [ ] **Step 3: Keep workspace titles and per-workspace actions in the main column header**
- [ ] **Step 4: Restyle the shared shell so the whole app reads as one continuous surface**
- [ ] **Step 5: Re-run focused home and smoke coverage**

## Task 2: Rebuild Notes Into An Editor-Like Integrated Workbench

**Files:**
- Modify: `src/components/notes/notes-shell.tsx`
- Modify: `src/components/notes/notes-sidebar.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/component/notes/notes-shell.test.tsx`
- Test: `tests/e2e/app-smoke.spec.ts`

- [ ] **Step 1: Keep notes layout inside one shared workbench surface instead of nested floating cards**
- [ ] **Step 2: Align note tree rows so title, metadata, and delete action share one row grid**
- [ ] **Step 3: Simplify notes action buttons and tab chrome**
- [ ] **Step 4: Keep context rail visually subordinate and integrated into the same shell**
- [ ] **Step 5: Re-run notes component and E2E coverage**

## Task 3: Make Training Read Like A Product Workspace Instead Of Card Stacks

**Files:**
- Modify: `src/components/workspace/workspace-shell.tsx`
- Modify: `src/components/workspace/workspace-sidebar.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/component/workspace/source-panel.test.tsx`
- Test: `tests/e2e/app-smoke.spec.ts`

- [ ] **Step 1: Embed recent and template navigation into the unified shell language**
- [ ] **Step 2: Reduce stacked-card feeling in source, article, and reader regions**
- [ ] **Step 3: Make primary training actions visually obvious without oversized decorative UI**
- [ ] **Step 4: Keep auxiliary controls separate but visually quieter than the main action path**
- [ ] **Step 5: Re-run training-focused component and E2E coverage**

## Task 4: Bring Assessment Into The Same Surface Grammar

**Files:**
- Modify: `src/components/assessment/assessment-shell.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/component/assessment/assessment-shell.test.tsx`
- Test: `tests/e2e/app-smoke.spec.ts`

- [ ] **Step 1: Remove detached card feeling from the assessment sidebar and content shell**
- [ ] **Step 2: Tighten result list density while preserving readability**
- [ ] **Step 3: Simplify assessment actions and shared button language**
- [ ] **Step 4: Make detail expansion feel like an integrated product panel instead of a stacked web card**
- [ ] **Step 5: Re-run assessment-focused coverage**

## Final Verification

- [ ] **Step 1: Run focused component suites**

Run:
`npx vitest run tests/component/home/desktop-home-shell.test.tsx tests/component/notes/notes-shell.test.tsx tests/component/workspace/source-panel.test.tsx tests/component/assessment/assessment-shell.test.tsx`

Expected: PASS

- [ ] **Step 2: Run the full unit/component test suite**

Run:
`npm run test`

Expected: PASS

- [ ] **Step 3: Run smoke and notes desktop E2E coverage**

Run:
`npx playwright test "tests/e2e/app-smoke.spec.ts" "tests/e2e/notes-localization.spec.ts"`

Expected: PASS

- [ ] **Step 4: Run lint and production build**

Run:
`npm run lint`

Expected: PASS

Run:
`npm run build`

Expected: PASS

## Inline Review Notes

- This workspace is not currently a Git repository, so the normal commit checkpoints from the planning workflow remain reference steps only.
- This session still does not have explicit permission for delegated subagent review, so plan review is handled inline.
- Scope is intentionally centered on structural product feel, not new business capabilities.
