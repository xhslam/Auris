# Notes Mixed Line Editing Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the notes center-pane `reading/source` split with a single mixed Markdown editor that shows source only for the active editing lines while rendering surrounding lines normally.

**Architecture:** Keep CodeMirror as the source-of-truth editing surface, extract the existing Markdown reading renderer into a shared module, and add a mixed-rendering editor extension that decorates inactive lines. Remove `viewMode` from the notes workbench path so the product only exposes one center-pane editing experience.

**Tech Stack:** Next.js App Router, React 19, TypeScript, CodeMirror 6, Vitest

---

## Spec Reference

- Design spec: `docs/superpowers/specs/2026-04-20-notes-mixed-line-editing-design.md`

## Ground Rules

- Do not stop using Markdown as the stored source format.
- Do not remove autosave, outline navigation, backlinks, properties, learning insertion, or command palette note actions.
- Do not replace CodeMirror with a new editor.
- Prefer extracting shared rendering logic over duplicating the reading renderer.
- Write tests for the mixed editing behavior before implementation.
- End each task at a fresh verification checkpoint.

## File Map

### Existing Files To Modify

- `src/components/notes-v2/notes-editor-pane.tsx`
- `src/components/notes-v2/notes-reading-pane.tsx`
- `src/components/notes-v2/notes-workbench-center.tsx`
- `src/components/notes-v2/notes-workbench-header.tsx`
- `src/components/notes-v2/notes-workbench.tsx`
- `src/components/notes-v2/notes-page-client.tsx`
- `src/features/notes/editor/editor-extensions.ts`
- `src/features/notes/editor/editor-state-bridge.ts`
- `src/features/notes/workbench/build-notes-command-palette.ts`
- `src/features/notes/workbench/notes-workbench.facade.ts`
- `src/features/notes/workbench/use-notes-sidebar-state.ts`
- `tests/component/notes/notes-workbench.test.tsx`
- `tests/component/notes/notes-page-client.test.tsx`
- `tests/component/notes/notes-panels.test.tsx`
- `tests/component/notes/notes-reading-pane.test.tsx`
- `tests/unit/notes/notes-workbench-command-palette.test.ts`

### New Files To Create

- `src/features/notes/rendering/notes-reading-blocks.tsx`
- `src/features/notes/editor/editor-mixed-rendering.ts`
- `tests/unit/notes/editor-mixed-rendering.test.tsx`

## Implementation Order

1. Lock in the new single-surface contract with tests.
2. Extract shared Markdown reading blocks from `NotesReadingPane`.
3. Add a mixed-rendering CodeMirror extension for active-line source editing.
4. Remove `viewMode` and old reading/source entry points from the workbench flow.
5. Verify targeted notes tests, then full `test`, `lint`, and `build`.

## Task 1: Lock The New Notes Contract

**Files:**
- Create: `tests/unit/notes/editor-mixed-rendering.test.tsx`
- Modify: `tests/component/notes/notes-workbench.test.tsx`
- Modify: `tests/component/notes/notes-page-client.test.tsx`
- Modify: `tests/component/notes/notes-panels.test.tsx`
- Modify: `tests/component/notes/notes-reading-pane.test.tsx`
- Modify: `tests/unit/notes/notes-workbench-command-palette.test.ts`

- [ ] **Step 1: Add a failing unit test for the mixed editor extension**

Cover at least:

- one active line stays as raw Markdown
- a non-active heading line renders as heading content
- a multi-line selection keeps the selected range in source mode

- [ ] **Step 2: Update workbench tests to expect a single center editing surface**

Replace reading/source toggle assertions with:

- no dedicated reading/source mode buttons
- center pane still renders the editor host
- line-aware mixed editing remains available

- [ ] **Step 3: Update command palette tests**

Remove the expectation for `toggle-reading` and assert the built-in commands list no longer includes it.

- [ ] **Step 4: Keep renderer-only tests focused on shared Markdown output**

Preserve the existing callout/list/line-break expectations, but point them at the shared renderer or the thin reading consumer.

- [ ] **Step 5: Run the targeted notes tests and confirm they fail for the expected reasons**

Run:

```bash
npx vitest run \
  tests/unit/notes/editor-mixed-rendering.test.tsx \
  tests/component/notes/notes-workbench.test.tsx \
  tests/component/notes/notes-panels.test.tsx \
  tests/component/notes/notes-reading-pane.test.tsx \
  tests/unit/notes/notes-workbench-command-palette.test.ts
```

Expected: FAIL until the implementation lands.

## Task 2: Extract Shared Markdown Reading Blocks

**Files:**
- Create: `src/features/notes/rendering/notes-reading-blocks.tsx`
- Modify: `src/components/notes-v2/notes-reading-pane.tsx`
- Modify: `tests/component/notes/notes-panels.test.tsx`
- Modify: `tests/component/notes/notes-reading-pane.test.tsx`

- [ ] **Step 1: Move `buildReadingBlocks` and `renderReadingBlocks` into a shared module**

The shared module should export:

- Markdown block parsing
- block rendering helpers
- one lightweight component or render function for consumers

- [ ] **Step 2: Keep `NotesReadingPane` as a thin wrapper**

It should simply render the shared output for a full document and keep the empty state behavior.

- [ ] **Step 3: Run the renderer tests**

Run:

```bash
npx vitest run \
  tests/component/notes/notes-panels.test.tsx \
  tests/component/notes/notes-reading-pane.test.tsx
```

Expected: PASS.

## Task 3: Add Mixed Rendering To The Editor

**Files:**
- Create: `src/features/notes/editor/editor-mixed-rendering.ts`
- Modify: `src/features/notes/editor/editor-extensions.ts`
- Modify: `src/components/notes-v2/notes-editor-pane.tsx`
- Modify: `src/features/notes/editor/editor-state-bridge.ts`
- Test: `tests/unit/notes/editor-mixed-rendering.test.tsx`
- Test: `tests/component/notes/notes-workbench.test.tsx`

- [ ] **Step 1: Build a CodeMirror decoration extension for inactive-line rendering**

The extension should:

- inspect the current selection
- derive an active editable line range
- replace inactive lines with rendered widgets based on the shared reading renderer

- [ ] **Step 2: Keep source editing intact for the active range**

Do not mutate the underlying document. Only decorate the visual output.

- [ ] **Step 3: Wire the extension through `createNotesEditorExtensions`**

Pass the current document source and selection changes through the new extension without breaking:

- line numbers
- active line reporting
- snippet insertion
- reveal-line behavior

- [ ] **Step 4: Preserve host lifecycle behavior in `NotesEditorPane`**

The editor instance should still survive in-place document updates and bridge callback changes.

- [ ] **Step 5: Run mixed-editor tests**

Run:

```bash
npx vitest run \
  tests/unit/notes/editor-mixed-rendering.test.tsx \
  tests/component/notes/notes-workbench.test.tsx
```

Expected: PASS.

## Task 4: Remove The Old Reading/Source Mode State

**Files:**
- Modify: `src/components/notes-v2/notes-workbench-center.tsx`
- Modify: `src/components/notes-v2/notes-workbench-header.tsx`
- Modify: `src/components/notes-v2/notes-workbench.tsx`
- Modify: `src/components/notes-v2/notes-page-client.tsx`
- Modify: `src/features/notes/workbench/build-notes-command-palette.ts`
- Modify: `src/features/notes/workbench/notes-workbench.facade.ts`
- Modify: `src/features/notes/workbench/use-notes-sidebar-state.ts`
- Modify: `tests/component/notes/notes-page-client.test.tsx`
- Modify: `tests/unit/notes/notes-workbench-command-palette.test.ts`

- [ ] **Step 1: Remove `viewMode` from sidebar state and facade output**

Delete:

- `viewMode`
- `setViewMode`
- toggle-reading callback plumbing

- [ ] **Step 2: Remove header mode buttons and center-pane branching**

The header should keep note actions such as:

- new
- rename
- delete
- refresh
- command palette

but no longer show reading/source buttons.

- [ ] **Step 3: Remove command palette `toggle-reading`**

Keep the other workbench commands and recent-file shortcuts stable.

- [ ] **Step 4: Run workbench integration tests**

Run:

```bash
npx vitest run \
  tests/component/notes/notes-workbench.test.tsx \
  tests/component/notes/notes-page-client.test.tsx \
  tests/unit/notes/notes-workbench-command-palette.test.ts
```

Expected: PASS.

## Task 5: Full Notes Verification

**Files:**
- No new files

- [ ] **Step 1: Run the targeted notes suite**

Run:

```bash
npx vitest run tests/component/notes tests/unit/notes
```

Expected: PASS.

- [ ] **Step 2: Run the full project test suite**

Run:

```bash
npm run test
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Run production build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Summarize residual risk**

If anything cannot be verified, explicitly document:

- what was not verified
- why it was not verified
- what the remaining risk is
