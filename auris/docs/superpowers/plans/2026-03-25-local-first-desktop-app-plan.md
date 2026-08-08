# Local-First Desktop App M3 Resume Hub Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn desktop home into a local resume hub that can restore training sessions, assessment history, and notes directly into their workspaces while remaining offline-first.

**Architecture:** Extend desktop runtime state with a primary resume target, keep recent training and assessment data in the existing main-process local repositories, read recent notes from notes storage, and restore concrete work objects through workspace-specific `resume*Id` parameters. Desktop home remains a composition layer, while each workspace owns its own restore logic.

**Tech Stack:** Electron main process, Node `node:sqlite`, preload IPC bridge, Next.js App Router, React 19, local vault notes storage, Vitest, Playwright

---

## File Map

### Create

- `src/features/app-runtime/home-resume.ts`

### Modify

- `docs/superpowers/specs/2026-03-25-local-first-desktop-app-design.md`
- `docs/superpowers/plans/2026-03-25-local-first-desktop-app-plan.md`
- `electron/main.cjs`
- `electron/preload.cjs`
- `electron/runtime-state-db.cjs`
- `src/app/assessment/page.tsx`
- `src/app/notes/page.tsx`
- `src/app/workspace/page.tsx`
- `src/components/assessment/assessment-shell.tsx`
- `src/components/home/desktop-home-shell.tsx`
- `src/components/notes/notes-shell.tsx`
- `src/components/workspace/workspace-shell.tsx`
- `src/features/app-runtime/app-runtime-storage.ts`
- `src/features/app-runtime/app-runtime.types.ts`
- `src/platform/desktop/desktop-bridge.ts`
- `src/platform/desktop/desktop-runtime.ts`
- `tests/component/assessment/assessment-shell.test.tsx`
- `tests/component/home/desktop-home-shell.test.tsx`
- `tests/component/notes/notes-shell.test.tsx`
- `tests/component/workspace/source-panel.test.tsx`
- `tests/e2e/app-smoke.spec.ts`
- `tests/unit/app-runtime/app-runtime-storage.test.ts`

## Task 1: Extend Desktop Runtime State With a Primary Resume Target

**Files:**
- Modify: `src/features/app-runtime/app-runtime.types.ts`
- Modify: `src/features/app-runtime/app-runtime-storage.ts`
- Modify: `src/platform/desktop/desktop-bridge.ts`
- Modify: `src/platform/desktop/desktop-runtime.ts`
- Modify: `electron/runtime-state-db.cjs`
- Modify: `electron/main.cjs`
- Modify: `electron/preload.cjs`
- Test: `tests/unit/app-runtime/app-runtime-storage.test.ts`

- [ ] **Step 1: Write the failing runtime-state tests**

```ts
it("normalizes a primary resume target from desktop runtime state", async () => {
  const bridge = createBridgeWithResumeTarget({
    primaryResumeId: "session-1",
    primaryResumeType: "training",
  });

  const state = await readDesktopRuntimeState(bridge as DesktopBridge, window.localStorage);

  expect(state.primaryResumeType).toBe("training");
  expect(state.primaryResumeId).toBe("session-1");
});

it("persists a resume target through the desktop bridge", async () => {
  const bridge = createBridge();

  const state = await persistResumeTarget(
    bridge as DesktopBridge,
    window.localStorage,
    "note",
    "page-1",
  );

  expect(state.primaryResumeType).toBe("note");
  expect(state.primaryResumeId).toBe("page-1");
});
```

- [ ] **Step 2: Run the runtime-state unit tests to verify they fail**

Run: `npx vitest run tests/unit/app-runtime/app-runtime-storage.test.ts`
Expected: FAIL because resume-target fields and helpers do not exist yet.

- [ ] **Step 3: Extend runtime-state types, normalization, and SQLite schema**

Add:

- `DesktopResumeTargetType`
- `primaryResumeType`
- `primaryResumeId`
- `persistResumeTarget(...)`
- `buildWorkspaceResumeHref(...)`

SQLite columns:

- `primary_resume_type`
- `primary_resume_id`

Include additive migration logic so existing SQLite databases get the new columns safely.

- [ ] **Step 4: Expose `setResumeTarget` through preload and main-process IPC**

Run channel:
- `shadowing:runtime-state:set-resume-target`

- [ ] **Step 5: Re-run the runtime-state unit tests**

Run: `npx vitest run tests/unit/app-runtime/app-runtime-storage.test.ts`
Expected: PASS

## Task 2: Add a Home Resume Model That Composes Local Lists

**Files:**
- Create: `src/features/app-runtime/home-resume.ts`
- Modify: `src/components/home/desktop-home-shell.tsx`
- Test: `tests/component/home/desktop-home-shell.test.tsx`

- [ ] **Step 1: Write the failing desktop-home component test**

```ts
it("shows primary and recent local resume links for training, assessment, and notes", async () => {
  render(<DesktopHomeShell />);

  expect(await screen.findByRole("link", { name: "Resume Training" })).toHaveAttribute(
    "href",
    "/workspace?resumeSessionId=local-session-1",
  );
  expect(screen.getByRole("link", { name: /Desktop Quick Review/i })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Desktop pronunciation feedback/i })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Desktop Study Log/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the home component test to verify it fails**

Run: `npx vitest run tests/component/home/desktop-home-shell.test.tsx`
Expected: FAIL because desktop home still renders only static workspace cards and local status.

- [ ] **Step 3: Implement a focused home-resume helper**

```ts
export async function loadDesktopHomeResumeSnapshot(input: {
  bridge: DesktopBridge | null;
  notesStorage: NotesStorage | null;
}) {
  return {
    primaryResume,
    recentAssessments,
    recentNotes,
    recentTraining,
    statusCards,
  };
}
```

Keep the helper small and compositional. It should reuse:

- desktop runtime state
- `trainingHistory.listRecent()`
- `assessmentHistory.list()`
- `notesStorage.listPages()`

- [ ] **Step 4: Update desktop home to render the new resume sections**

Render:

- primary continue-working action
- recent training section
- recent assessment section
- recent notes section

- [ ] **Step 5: Re-run the home component test**

Run: `npx vitest run tests/component/home/desktop-home-shell.test.tsx`
Expected: PASS

## Task 3: Restore Concrete Work Objects Inside Each Workspace

**Files:**
- Modify: `src/app/workspace/page.tsx`
- Modify: `src/app/assessment/page.tsx`
- Modify: `src/app/notes/page.tsx`
- Modify: `src/components/workspace/workspace-shell.tsx`
- Modify: `src/components/assessment/assessment-shell.tsx`
- Modify: `src/components/notes/notes-shell.tsx`
- Test: `tests/component/workspace/source-panel.test.tsx`
- Test: `tests/component/assessment/assessment-shell.test.tsx`
- Test: `tests/component/notes/notes-shell.test.tsx`

- [ ] **Step 1: Add failing workspace restore tests**

```ts
it("restores local playback from a resumeSessionId prop", async () => {
  render(<WorkspaceShell resumeSessionId="local-session-1" />);

  expect(await screen.findByLabelText("跟读舞台")).toBeInTheDocument();
});

it("expands a local assessment from a resumeAssessmentId prop", async () => {
  render(<AssessmentShell resumeAssessmentId="desktop-assessment-1" />);

  expect(await screen.findByText("Desktop pronunciation feedback")).toBeInTheDocument();
  expect(screen.getByText("词级反馈")).toBeInTheDocument();
});

it("opens the requested local note from a resumeNoteId prop", async () => {
  render(<NotesShell resumeNoteId="page-2" storage={createStorageWithTwoPages()} />);

  expect(await screen.findByDisplayValue("Review Note")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused workspace tests to verify they fail**

Run: `npx vitest run tests/component/workspace/source-panel.test.tsx tests/component/assessment/assessment-shell.test.tsx tests/component/notes/notes-shell.test.tsx`
Expected: FAIL because the shells do not yet accept or honor resume ids.

- [ ] **Step 3: Pass search params from route pages into the shells**

Use App Router page props:

- `resumeSessionId`
- `resumeAssessmentId`
- `resumeNoteId`

- [ ] **Step 4: Implement workspace-specific restore behavior**

Rules:

- training workspace loads playback from local history when `resumeSessionId` exists
- assessment workspace expands the requested record when `resumeAssessmentId` exists
- notes workspace selects the requested page when `resumeNoteId` exists

- [ ] **Step 5: Persist active restore targets from each workspace**

Rules:

- training writes `("training", sessionId)` after playback loads
- assessment writes `("assessment", assessmentId)` after a record becomes expanded
- notes writes `("note", pageId)` after selection changes

- [ ] **Step 6: Re-run the focused workspace tests**

Run: `npx vitest run tests/component/workspace/source-panel.test.tsx tests/component/assessment/assessment-shell.test.tsx tests/component/notes/notes-shell.test.tsx`
Expected: PASS

## Task 4: Add End-to-End Coverage for Home-Driven Restore Flows

**Files:**
- Modify: `tests/e2e/app-smoke.spec.ts`

- [ ] **Step 1: Add failing E2E coverage for home-driven resume links**

```ts
test("desktop home restores a prepared training session from the continue-working card", async ({ page }) => {
  await installDesktopBridge(page);
  await page.goto("/");
  await page.getByRole("link", { name: "Resume Training" }).click();
  await expect(page.getByLabel("跟读舞台")).toBeVisible();
});

test("desktop home opens a recent assessment and note from local resume links", async ({ page }) => {
  await installDesktopBridge(page);
  await page.goto("/");
  await page.getByRole("link", { name: /Desktop pronunciation feedback/i }).click();
  await expect(page).toHaveURL(/resumeAssessmentId=/);
  await page.goto("/");
  await page.getByRole("link", { name: /Desktop Study Log/i }).click();
  await expect(page).toHaveURL(/resumeNoteId=/);
});
```

- [ ] **Step 2: Run the targeted Playwright suite**

Run: `npx playwright test "tests/e2e/app-smoke.spec.ts"`
Expected: PASS

## Final Verification

- [ ] **Step 1: Run focused M3 tests**

Run: `npx vitest run tests/unit/app-runtime/app-runtime-storage.test.ts tests/component/home/desktop-home-shell.test.tsx tests/component/workspace/source-panel.test.tsx tests/component/assessment/assessment-shell.test.tsx tests/component/notes/notes-shell.test.tsx`
Expected: PASS

- [ ] **Step 2: Run the full test suite**

Run: `npm run test`
Expected: PASS

- [ ] **Step 3: Run desktop E2E coverage**

Run: `npx playwright test "tests/e2e/app-smoke.spec.ts" "tests/e2e/notes-localization.spec.ts"`
Expected: PASS

- [ ] **Step 4: Run lint and production build**

Run: `npm run lint`
Expected: PASS

Run: `npm run build`
Expected: PASS

## Inline Review Notes

- This workspace is not currently a Git repository, so commit checkpoints remain reference steps only.
- This session still does not have explicit permission for delegated subagent work, so the plan was reviewed inline instead of through a plan-review subagent.
- The scope is intentionally the first M3 slice only. It improves restore behavior and home utility without adding dashboard analytics or sync complexity.
