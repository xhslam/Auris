# Enterprise Optimization Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the phase-one enterprise-optimization hotspots in `english-shadowing-web` into clearer, test-protected module boundaries without removing or changing any existing functionality.

**Architecture:** Keep the current public entry files in place, but convert them into thin facades over new feature-layer hooks and focused view modules. Separate UI composition, workflow orchestration, platform integration, and storage or repository access so later quality, state, and performance phases can build on stable seams.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Vitest, Playwright, Electron desktop bridge, local-first notes and workspace services

---

## Spec Reference

- Design spec: `docs/superpowers/specs/2026-04-19-enterprise-optimization-phase-1-design.md`

## Ground Rules

- Do not reduce, hide, or silently degrade any existing functionality.
- Preserve route entry points and current user-visible controls.
- Preserve desktop, browser, and native fallback behavior.
- Prefer extraction and redirection over broad rewrites.
- Keep existing top-level files as facades until the end of the phase.
- Use TDD or characterization-style tests before moving behavior.
- End every task at a stable verification point.

## Phase-One File Map

### Existing Files To Modify

- `src/components/workspace/workspace-shell.tsx`
  - Current all-in-one workspace training container
- `src/components/notes-v2/use-notes-workbench.ts`
  - Current all-in-one notes runtime and orchestration hook
- `src/components/notes-v2/notes-workbench.tsx`
  - Current all-in-one notes workbench composition component
- `src/components/ai-dock/ai-dock-shell.tsx`
  - Current all-in-one AI dock runtime shell

### Existing Files Likely To Reference Or Reuse

- `src/components/workspace/workspace-layout-resize.ts`
- `src/components/workspace/workspace-sidebar.tsx`
- `src/components/workspace/recent-templates-panel.tsx`
- `src/features/ai-dock/ai-dock-layout.ts`
- `src/features/ai-dock/ai-dock-storage.ts`
- `src/features/ai-dock/ai-dock-types.ts`
- `src/features/notes/workspace/workspace-store.ts`
- `src/features/notes/workspace/workspace-selectors.ts`
- `src/features/notes/workspace/workbench-documents.ts`

### New Files To Create

#### Workspace Feature Layer

- `src/features/workspace/use-workspace-session-runtime.ts`
- `src/features/workspace/use-workspace-library-runtime.ts`
- `src/features/workspace/use-workspace-reference-audio.ts`
- `src/features/workspace/use-workspace-layout.ts`
- `src/features/workspace/workspace-shell.types.ts`
- `src/features/workspace/workspace-shell.view-model.ts`

#### Notes Workbench Feature Layer

- `src/features/notes/workbench/use-notes-runtime.ts`
- `src/features/notes/workbench/use-notes-documents.ts`
- `src/features/notes/workbench/use-notes-actions.ts`
- `src/features/notes/workbench/use-notes-sidebar-state.ts`
- `src/features/notes/workbench/build-notes-command-palette.ts`
- `src/features/notes/workbench/notes-workbench.facade.ts`

#### Notes View Composition

- `src/components/notes-v2/notes-workbench-header.tsx`
- `src/components/notes-v2/notes-workbench-left-sidebar.tsx`
- `src/components/notes-v2/notes-workbench-center.tsx`
- `src/components/notes-v2/notes-workbench-right-sidebar.tsx`

#### AI Dock Feature Layer

- `src/features/ai-dock/use-ai-dock-visibility.ts`
- `src/features/ai-dock/use-ai-dock-layout-sync.ts`
- `src/features/ai-dock/use-ai-dock-prompts.ts`
- `src/features/ai-dock/use-ai-dock-history.ts`
- `src/components/ai-dock/ai-dock-header.tsx`
- `src/components/ai-dock/ai-dock-provider-surface.tsx`

### Tests To Create Or Modify

- Create: `tests/component/workspace/workspace-shell.test.tsx`
- Modify: `tests/component/workspace/workspace-library.test.tsx`
- Modify: `tests/component/notes/notes-workbench.test.tsx`
- Modify: `tests/component/runtime/desktop-ai-dock.test.tsx`
- Create: `tests/unit/workspace/use-workspace-layout.test.ts`
- Create: `tests/unit/workspace/workspace-shell-view-model.test.ts`
- Create: `tests/unit/notes/notes-workbench-command-palette.test.ts`
- Create: `tests/unit/ai-dock/use-ai-dock-visibility.test.ts`
- Create: `tests/unit/ai-dock/use-ai-dock-layout-sync.test.ts`

## Implementation Order

1. Add baseline characterization coverage for the current behavior.
2. Extract workspace orchestration into feature hooks.
3. Extract notes orchestration into a facade plus sub-hooks.
4. Split notes workbench view composition.
5. Extract AI dock runtime and content hooks.
6. Consolidate exports, remove duplication, and run full verification.

## Task 1: Lock The Baseline With Characterization Tests

**Files:**
- Create: `tests/component/workspace/workspace-shell.test.tsx`
- Create: `tests/unit/workspace/use-workspace-layout.test.ts`
- Create: `tests/unit/workspace/workspace-shell-view-model.test.ts`
- Create: `tests/unit/notes/notes-workbench-command-palette.test.ts`
- Create: `tests/unit/ai-dock/use-ai-dock-visibility.test.ts`
- Create: `tests/unit/ai-dock/use-ai-dock-layout-sync.test.ts`
- Modify: `tests/component/notes/notes-workbench.test.tsx`
- Modify: `tests/component/runtime/desktop-ai-dock.test.tsx`

- [ ] **Step 1: Add a workspace-shell characterization test file**

Test the existing contract instead of the future implementation:

```tsx
it("hydrates a resume session and keeps workspace controls mounted", async () => {
  render(<WorkspaceShell resumeSessionId="session-1" />);

  expect(loadPlaybackMock).toHaveBeenCalledWith("session-1");
  expect(screen.getByRole("separator", { name: "Resize workspace panels" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the new workspace-shell test to verify the gap**

Run: `npx vitest run tests/component/workspace/workspace-shell.test.tsx`

Expected: FAIL because the new test file does not exist yet or because required mocking is incomplete.

- [ ] **Step 3: Add the minimal mocks and assertions needed to make the workspace-shell test pass**

Focus on current behaviors only:

- resume-session hydration entry
- recent or template wiring
- library button availability
- settings and resize affordances remaining mounted

- [ ] **Step 4: Add unit tests for the first extracted pure helpers**

Use the future extraction seams as characterization targets:

- `workspace-shell.view-model.ts`
- `use-workspace-layout.ts`
- notes command-palette building
- AI dock visibility and layout sync helpers

Example:

```ts
it("clamps the workspace left panel width to the allowed range", () => {
  expect(clampWorkspaceLeftPanelWidth(0, 1200)).toBeGreaterThan(0);
});
```

- [ ] **Step 5: Extend notes-workbench component coverage before splitting**

Add assertions for:

- header actions still render
- left sidebar mode switching still works
- right sidebar mode switching still works
- command palette mount path still exists

- [ ] **Step 6: Extend desktop-ai-dock coverage before extraction**

Add assertions for:

- view switching between provider, prompts, and history
- dock reveal or hide behavior
- width reservation behavior when open

- [ ] **Step 7: Run the targeted baseline test set**

Run:

```bash
npx vitest run \
  tests/component/workspace/workspace-shell.test.tsx \
  tests/component/notes/notes-workbench.test.tsx \
  tests/component/runtime/desktop-ai-dock.test.tsx \
  tests/unit/workspace/use-workspace-layout.test.ts \
  tests/unit/workspace/workspace-shell-view-model.test.ts \
  tests/unit/notes/notes-workbench-command-palette.test.ts \
  tests/unit/ai-dock/use-ai-dock-visibility.test.ts \
  tests/unit/ai-dock/use-ai-dock-layout-sync.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the baseline-protection task**

```bash
git add tests/component/workspace/workspace-shell.test.tsx \
  tests/component/notes/notes-workbench.test.tsx \
  tests/component/runtime/desktop-ai-dock.test.tsx \
  tests/unit/workspace/use-workspace-layout.test.ts \
  tests/unit/workspace/workspace-shell-view-model.test.ts \
  tests/unit/notes/notes-workbench-command-palette.test.ts \
  tests/unit/ai-dock/use-ai-dock-visibility.test.ts \
  tests/unit/ai-dock/use-ai-dock-layout-sync.test.ts
git commit -m "test: add phase-one refactor characterization coverage"
```

## Task 2: Extract Workspace Shell Runtime And Layout Concerns

**Files:**
- Create: `src/features/workspace/use-workspace-session-runtime.ts`
- Create: `src/features/workspace/use-workspace-library-runtime.ts`
- Create: `src/features/workspace/use-workspace-reference-audio.ts`
- Create: `src/features/workspace/use-workspace-layout.ts`
- Create: `src/features/workspace/workspace-shell.types.ts`
- Create: `src/features/workspace/workspace-shell.view-model.ts`
- Modify: `src/components/workspace/workspace-shell.tsx`
- Test: `tests/component/workspace/workspace-shell.test.tsx`
- Test: `tests/component/workspace/workspace-library.test.tsx`
- Test: `tests/unit/workspace/use-workspace-layout.test.ts`
- Test: `tests/unit/workspace/workspace-shell-view-model.test.ts`

- [ ] **Step 1: Move workspace-local type declarations into `workspace-shell.types.ts`**

Extract:

- route response types
- local item shapes
- local helper types now declared inline in `workspace-shell.tsx`

- [ ] **Step 2: Extract pure derived-state helpers into `workspace-shell.view-model.ts`**

Move logic such as:

- source word count
- practice insights
- practice narrative
- active sentence lookup helpers that are purely derived

- [ ] **Step 3: Extract board-width and splitter logic into `use-workspace-layout.ts`**

The hook should own:

- board width tracking
- left-panel width state
- resize drag state
- splitter keyboard behavior

- [ ] **Step 4: Extract reference-audio lifecycle into `use-workspace-reference-audio.ts`**

The hook should own:

- selected recording resolution
- reference object URL creation and revocation
- reference playback state
- reference playback toggling

- [ ] **Step 5: Extract session orchestration into `use-workspace-session-runtime.ts`**

The hook should own:

- recent-session refresh
- template loading
- playback loading
- resume-session handling
- delete-recent behavior
- resume-target persistence

- [ ] **Step 6: Extract wordbook, sentencebook, notes-count, and export flows into `use-workspace-library-runtime.ts`**

The hook should own:

- library data refresh
- sentence save and delete
- word delete
- export flows via platform services and fallbacks

- [ ] **Step 7: Convert `workspace-shell.tsx` into a composition container**

After extraction, the container should mostly:

- call the extracted hooks
- pass data to presentational components
- wire callbacks together

- [ ] **Step 8: Run the workspace-focused verification set**

Run:

```bash
npx vitest run \
  tests/component/workspace/workspace-shell.test.tsx \
  tests/component/workspace/workspace-library.test.tsx \
  tests/component/workspace/source-panel.test.tsx \
  tests/component/workspace/source-panel-customize.test.tsx \
  tests/component/workspace/voice-recorder-panel.test.tsx \
  tests/unit/workspace/use-workspace-layout.test.ts \
  tests/unit/workspace/workspace-shell-view-model.test.ts
```

Expected: PASS.

- [ ] **Step 9: Lint only the workspace surface touched by this task**

Run:

```bash
npx eslint \
  src/components/workspace/workspace-shell.tsx \
  src/features/workspace/*.ts \
  tests/component/workspace/workspace-shell.test.tsx \
  tests/unit/workspace/use-workspace-layout.test.ts \
  tests/unit/workspace/workspace-shell-view-model.test.ts
```

Expected: 0 errors.

- [ ] **Step 10: Commit the workspace extraction**

```bash
git add src/components/workspace/workspace-shell.tsx \
  src/features/workspace \
  tests/component/workspace/workspace-shell.test.tsx \
  tests/component/workspace/workspace-library.test.tsx \
  tests/unit/workspace/use-workspace-layout.test.ts \
  tests/unit/workspace/workspace-shell-view-model.test.ts
git commit -m "refactor: extract workspace shell runtime hooks"
```

## Task 3: Extract Notes Workbench Runtime Into A Facade Plus Focused Hooks

**Files:**
- Create: `src/features/notes/workbench/use-notes-runtime.ts`
- Create: `src/features/notes/workbench/use-notes-documents.ts`
- Create: `src/features/notes/workbench/use-notes-actions.ts`
- Create: `src/features/notes/workbench/use-notes-sidebar-state.ts`
- Create: `src/features/notes/workbench/build-notes-command-palette.ts`
- Create: `src/features/notes/workbench/notes-workbench.facade.ts`
- Modify: `src/components/notes-v2/use-notes-workbench.ts`
- Test: `tests/component/notes/notes-workbench.test.tsx`
- Test: `tests/unit/notes/workspace-store.test.ts`
- Test: `tests/unit/notes/workbench-documents.test.ts`
- Test: `tests/unit/notes/notes-workbench-command-palette.test.ts`

- [ ] **Step 1: Extract runtime and vault-client selection into `use-notes-runtime.ts`**

This hook should own:

- runtime detection
- desktop-bridge resolution
- vault-client selection
- vault-store initialization

- [ ] **Step 2: Extract snapshot, live-document, autosave, and backlinks behavior into `use-notes-documents.ts`**

This hook should own:

- snapshot refresh
- live document drafts
- dirty paths
- autosave timers
- derived backlinks refresh

- [ ] **Step 3: Extract CRUD and bridge-backed actions into `use-notes-actions.ts`**

This hook should own:

- create note
- rename note
- delete note
- open and close path
- pick directory
- run desktop command

- [ ] **Step 4: Extract workbench UI state into `use-notes-sidebar-state.ts`**

This hook should own:

- left sidebar collapsed and mode helpers
- right sidebar collapsed and mode helpers
- search query
- learning query
- view mode
- editor active line

- [ ] **Step 5: Move command-palette item construction into `build-notes-command-palette.ts`**

Make it pure enough to unit test with fixtures.

Example:

```ts
const items = buildNotesCommandPalette({
  documents,
  recentFiles,
  actions,
});
expect(items.some((item) => item.id === "new-note")).toBe(true);
```

- [ ] **Step 6: Create `notes-workbench.facade.ts` and slim `use-notes-workbench.ts`**

After this step:

- the public hook still exists
- it delegates to the new focused hooks
- downstream consumers should not need to change behavior

- [ ] **Step 7: Run the notes-hook verification set**

Run:

```bash
npx vitest run \
  tests/component/notes/notes-workbench.test.tsx \
  tests/component/notes/notes-shell.test.tsx \
  tests/component/notes/notes-page-client.test.tsx \
  tests/unit/notes/workbench-documents.test.ts \
  tests/unit/notes/workspace-store.test.ts \
  tests/unit/notes/notes-workbench-command-palette.test.ts \
  tests/unit/notes/rename-note-plan.test.ts
```

Expected: PASS.

- [ ] **Step 8: Lint the extracted notes workbench surface**

Run:

```bash
npx eslint \
  src/components/notes-v2/use-notes-workbench.ts \
  src/features/notes/workbench/*.ts \
  tests/component/notes/notes-workbench.test.tsx \
  tests/unit/notes/notes-workbench-command-palette.test.ts
```

Expected: 0 errors.

- [ ] **Step 9: Commit the notes-facade extraction**

```bash
git add src/components/notes-v2/use-notes-workbench.ts \
  src/features/notes/workbench \
  tests/component/notes/notes-workbench.test.tsx \
  tests/unit/notes/notes-workbench-command-palette.test.ts
git commit -m "refactor: split notes workbench runtime facade"
```

## Task 4: Split Notes Workbench View Composition

**Files:**
- Create: `src/components/notes-v2/notes-workbench-header.tsx`
- Create: `src/components/notes-v2/notes-workbench-left-sidebar.tsx`
- Create: `src/components/notes-v2/notes-workbench-center.tsx`
- Create: `src/components/notes-v2/notes-workbench-right-sidebar.tsx`
- Modify: `src/components/notes-v2/notes-workbench.tsx`
- Test: `tests/component/notes/notes-workbench.test.tsx`
- Test: `tests/component/notes/notes-panels.test.tsx`
- Test: `tests/component/notes/notes-terminal-panel.test.tsx`

- [ ] **Step 1: Extract the workbench header into `notes-workbench-header.tsx`**

Move:

- workspace copy
- action buttons
- source and reading mode toggles

- [ ] **Step 2: Extract the left rail and left sidebar composition into `notes-workbench-left-sidebar.tsx`**

Move:

- files, outline, and search mode wiring
- recent-documents list section
- directory-picker and create-note action wiring

- [ ] **Step 3: Extract the center stack into `notes-workbench-center.tsx`**

Move:

- tabs
- right-toolbar shortcuts
- banner rendering
- editor or reading-pane switch

- [ ] **Step 4: Extract the right sidebar into `notes-workbench-right-sidebar.tsx`**

Move:

- properties
- backlinks
- learning
- terminal panel rendering

- [ ] **Step 5: Reduce `notes-workbench.tsx` to layout composition plus palette wiring**

After this step, the file should mostly:

- assemble subcomponents
- pass props
- mount `NotesLayout` and `NotesCommandPalette`

- [ ] **Step 6: Re-run notes component coverage**

Run:

```bash
npx vitest run \
  tests/component/notes/notes-workbench.test.tsx \
  tests/component/notes/notes-panels.test.tsx \
  tests/component/notes/notes-terminal-panel.test.tsx \
  tests/component/notes/notes-reading-pane.test.tsx \
  tests/component/notes/notes-file-tree.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Lint the split notes-view surface**

Run:

```bash
npx eslint \
  src/components/notes-v2/notes-workbench.tsx \
  src/components/notes-v2/notes-workbench-*.tsx \
  tests/component/notes/notes-workbench.test.tsx \
  tests/component/notes/notes-panels.test.tsx
```

Expected: 0 errors.

- [ ] **Step 8: Commit the notes view split**

```bash
git add src/components/notes-v2/notes-workbench.tsx \
  src/components/notes-v2/notes-workbench-*.tsx \
  tests/component/notes/notes-workbench.test.tsx \
  tests/component/notes/notes-panels.test.tsx
git commit -m "refactor: split notes workbench view composition"
```

## Task 5: Extract AI Dock Visibility, Layout, Prompt, And History Hooks

**Files:**
- Create: `src/features/ai-dock/use-ai-dock-visibility.ts`
- Create: `src/features/ai-dock/use-ai-dock-layout-sync.ts`
- Create: `src/features/ai-dock/use-ai-dock-prompts.ts`
- Create: `src/features/ai-dock/use-ai-dock-history.ts`
- Create: `src/components/ai-dock/ai-dock-header.tsx`
- Create: `src/components/ai-dock/ai-dock-provider-surface.tsx`
- Modify: `src/components/ai-dock/ai-dock-shell.tsx`
- Test: `tests/component/runtime/desktop-ai-dock.test.tsx`
- Test: `tests/unit/ai-dock/ai-dock-layout.test.ts`
- Test: `tests/unit/ai-dock/use-ai-dock-visibility.test.ts`
- Test: `tests/unit/ai-dock/use-ai-dock-layout-sync.test.ts`

- [ ] **Step 1: Extract reveal and hide logic into `use-ai-dock-visibility.ts`**

The hook should own:

- dock reveal state
- focus lock
- reveal-zone timing
- hide scheduling and cleanup

- [ ] **Step 2: Extract width, reservation, and bridge sync behavior into `use-ai-dock-layout-sync.ts`**

The hook should own:

- layout width tracking
- panel width resolution
- shell width and reserved width derivation
- drag resize state
- bridge layout sync calls

- [ ] **Step 3: Extract prompt-library runtime into `use-ai-dock-prompts.ts`**

The hook should own:

- prompt query state
- prompt loading
- favorite toggling
- import defaults
- export
- copy prompt

- [ ] **Step 4: Extract chat-history runtime into `use-ai-dock-history.ts`**

The hook should own:

- history query state
- history loading
- selection state
- favorite toggling
- export
- capture current conversation

- [ ] **Step 5: Extract structural subcomponents**

Create:

- `ai-dock-header.tsx`
- `ai-dock-provider-surface.tsx`

Keep their responsibilities narrowly visual.

- [ ] **Step 6: Reduce `ai-dock-shell.tsx` to a structural shell**

After extraction, it should mostly:

- invoke hooks
- choose which panels render
- wire the dock layout and surface structure

- [ ] **Step 7: Run the AI dock verification set**

Run:

```bash
npx vitest run \
  tests/component/runtime/desktop-ai-dock.test.tsx \
  tests/unit/ai-dock/ai-dock-layout.test.ts \
  tests/unit/ai-dock/use-ai-dock-visibility.test.ts \
  tests/unit/ai-dock/use-ai-dock-layout-sync.test.ts
```

Expected: PASS.

- [ ] **Step 8: Lint the AI dock surface**

Run:

```bash
npx eslint \
  src/components/ai-dock/ai-dock-shell.tsx \
  src/components/ai-dock/ai-dock-header.tsx \
  src/components/ai-dock/ai-dock-provider-surface.tsx \
  src/features/ai-dock/*.ts \
  tests/component/runtime/desktop-ai-dock.test.tsx \
  tests/unit/ai-dock/use-ai-dock-visibility.test.ts \
  tests/unit/ai-dock/use-ai-dock-layout-sync.test.ts
```

Expected: 0 errors.

- [ ] **Step 9: Commit the AI dock extraction**

```bash
git add src/components/ai-dock \
  src/features/ai-dock \
  tests/component/runtime/desktop-ai-dock.test.tsx \
  tests/unit/ai-dock/use-ai-dock-visibility.test.ts \
  tests/unit/ai-dock/use-ai-dock-layout-sync.test.ts
git commit -m "refactor: split ai dock runtime hooks"
```

## Task 6: Consolidate The Phase And Run Full Verification

**Files:**
- Modify: touched files across workspace, notes, and ai-dock surfaces
- Modify: `docs/superpowers/plans/2026-04-19-enterprise-optimization-phase-1.md` only if implementation reveals plan updates
- Optional docs update: `progress.md` or task-tracking docs if the team is using them for status handoff

- [ ] **Step 1: Remove obvious duplication introduced during extraction**

Focus only on cleanup revealed by the finished refactor, not opportunistic redesign.

- [ ] **Step 2: Normalize exports and internal type imports**

Check:

- feature hook imports
- local helper imports
- circular dependencies
- duplicate local type declarations

- [ ] **Step 3: Re-read the phase-one spec and confirm acceptance coverage**

Confirm each acceptance point from:

- `docs/superpowers/specs/2026-04-19-enterprise-optimization-phase-1-design.md`

- [ ] **Step 4: Run the full lint suite**

Run: `npm run lint`

Expected: PASS.

- [ ] **Step 5: Run the full test suite**

Run: `npm run test`

Expected: PASS.

- [ ] **Step 6: Run the production build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 7: If the refactor touched a fragile end-to-end path, run the smallest smoke set**

Run only if necessary:

```bash
npx playwright test tests/e2e/app-smoke.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the consolidation pass**

```bash
git add src tests docs/superpowers/plans/2026-04-19-enterprise-optimization-phase-1.md
git commit -m "refactor: complete enterprise optimization phase one"
```

## Success Checklist

- [ ] `workspace-shell.tsx` is materially smaller and structurally focused
- [ ] `use-notes-workbench.ts` is now a facade over focused notes workbench hooks
- [ ] `notes-workbench.tsx` is primarily a composition file
- [ ] `ai-dock-shell.tsx` is mostly structural
- [ ] Existing user-facing functionality remains intact
- [ ] Characterization or regression coverage protects the touched core flows
- [ ] `npm run lint` passes
- [ ] `npm run test` passes
- [ ] `npm run build` passes

## Review Notes

- This plan follows the approved phase-one design and keeps functionality preservation as the top constraint.
- The recommended subagent plan-review loop was not used here because this session does not include explicit user permission for delegated subagents.
- If repository commit flow is unavailable in the current workspace state, keep the commit boundaries as logical checkpoints and do not block implementation on git metadata.
