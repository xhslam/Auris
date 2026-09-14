# Learning Memory Loop Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable learning-memory loop: imported material recalls related notes/words/sentences, can generate a Markdown learning note, and can hand off a structured prompt for the AI Dock.

**Architecture:** Add a pure `src/features/learning-memory/` domain layer, then integrate it into the existing workspace through a focused hook and panel. Keep notes-v2 and AI Dock internals intact; use existing `NotesStorage`, wordbook, and sentencebook APIs.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Markdown vault storage, Vitest, Testing Library.

---

## Spec Reference

- `docs/superpowers/specs/2026-05-03-learning-memory-loop-design.md`

## Scope Notes

- Worktree creation is unavailable because the repository has no `HEAD` commit; implement in the current workspace.
- Use TDD for production behavior.
- Do not edit notes-v2 internals unless an integration bug requires it.
- Do not edit AI Dock internals in this first slice.

## File Map

### Create

- `src/features/learning-memory/learning-memory-types.ts`
- `src/features/learning-memory/memory-recall-engine.ts`
- `src/features/learning-memory/learning-note-template.ts`
- `src/features/learning-memory/learning-ai-context.ts`
- `src/features/learning-memory/use-workspace-learning-memory.ts`
- `src/components/workspace/related-memory-panel.tsx`
- `tests/unit/learning-memory/memory-recall-engine.test.ts`
- `tests/unit/learning-memory/learning-note-template.test.ts`
- `tests/unit/learning-memory/learning-ai-context.test.ts`
- `tests/component/workspace/related-memory-panel.test.tsx`

### Modify

- `src/components/workspace/workspace-shell.tsx`
- `src/app/globals.css`

## Task 1: Pure Recall Domain

**Files:**
- Create: `src/features/learning-memory/learning-memory-types.ts`
- Create: `src/features/learning-memory/memory-recall-engine.ts`
- Test: `tests/unit/learning-memory/memory-recall-engine.test.ts`

- [ ] **Step 1: Write failing recall tests**

Cover:

- saved word found in imported material
- saved sentence phrase overlap
- note title/tag/body overlap
- empty material returns no results
- results include human-readable reasons

Run:

```bash
npx vitest run tests/unit/learning-memory/memory-recall-engine.test.ts
```

Expected: fail because module does not exist.

- [ ] **Step 2: Implement minimal recall engine**

Implement token normalization, recall record types, simple score calculation, and sorted `RecallItem[]` output.

- [ ] **Step 3: Verify recall tests**

Run:

```bash
npx vitest run tests/unit/learning-memory/memory-recall-engine.test.ts
```

Expected: pass.

## Task 2: Learning Note Template

**Files:**
- Create: `src/features/learning-memory/learning-note-template.ts`
- Test: `tests/unit/learning-memory/learning-note-template.test.ts`

- [ ] **Step 1: Write failing note-template tests**

Cover:

- generated Markdown has `learning-session` frontmatter
- source material appears under `## Source`
- saved words and saved sentences render as Markdown
- related notes render as wiki links or readable recall bullets

Run:

```bash
npx vitest run tests/unit/learning-memory/learning-note-template.test.ts
```

Expected: fail because module does not exist.

- [ ] **Step 2: Implement deterministic Markdown template**

Keep this pure and AI-free.

- [ ] **Step 3: Verify template tests**

Run:

```bash
npx vitest run tests/unit/learning-memory/learning-note-template.test.ts
```

Expected: pass.

## Task 3: AI Context Prompt Builder

**Files:**
- Create: `src/features/learning-memory/learning-ai-context.ts`
- Test: `tests/unit/learning-memory/learning-ai-context.test.ts`

- [ ] **Step 1: Write failing prompt tests**

Cover:

- prompt includes current material
- prompt includes recall reasons
- prompt includes saved words/sentences
- prompt remains bounded when inputs are long

Run:

```bash
npx vitest run tests/unit/learning-memory/learning-ai-context.test.ts
```

Expected: fail because module does not exist.

- [ ] **Step 2: Implement structured prompt builder**

Return a string suitable for clipboard handoff to the AI Dock.

- [ ] **Step 3: Verify prompt tests**

Run:

```bash
npx vitest run tests/unit/learning-memory/learning-ai-context.test.ts
```

Expected: pass.

## Task 4: Related Memory Panel Component

**Files:**
- Create: `src/components/workspace/related-memory-panel.tsx`
- Test: `tests/component/workspace/related-memory-panel.test.tsx`

- [ ] **Step 1: Write failing component tests**

Cover:

- empty state
- populated recall list with reasons
- create note button callback
- copy AI context callback

Run:

```bash
npx vitest run tests/component/workspace/related-memory-panel.test.tsx
```

Expected: fail because component does not exist.

- [ ] **Step 2: Implement panel component**

Keep it controlled and presentational.

- [ ] **Step 3: Verify component tests**

Run:

```bash
npx vitest run tests/component/workspace/related-memory-panel.test.tsx
```

Expected: pass.

## Task 5: Workspace Integration Hook

**Files:**
- Create: `src/features/learning-memory/use-workspace-learning-memory.ts`
- Modify: `src/components/workspace/workspace-shell.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/component/workspace/workspace-shell.test.tsx`

- [ ] **Step 1: Add workspace test expectations**

Extend workspace tests so seeded localStorage words/sentences and notes produce a visible `Related Memory` result after the workspace renders.

Run:

```bash
npx vitest run tests/component/workspace/workspace-shell.test.tsx
```

Expected: fail because the panel is not integrated.

- [ ] **Step 2: Implement integration hook**

Load notes through `NotesStorage`, saved words through wordbook state, saved sentences through sentencebook state, derive recall items from current `sourceText`, generate notes through `NotesStorage`, and copy AI prompt through `navigator.clipboard`.

- [ ] **Step 3: Render panel in workspace**

Place the panel beneath the source input in the material intake column so recall is tied to imported material.

- [ ] **Step 4: Add minimal responsive styles**

Use existing workspace/source-panel visual language. Do not introduce a new palette.

- [ ] **Step 5: Verify workspace test**

Run:

```bash
npx vitest run tests/component/workspace/workspace-shell.test.tsx
```

Expected: pass.

## Task 6: Targeted Verification

**Files:**
- No new files

- [ ] **Step 1: Run learning-memory unit suite**

```bash
npx vitest run tests/unit/learning-memory
```

- [ ] **Step 2: Run related workspace component tests**

```bash
npx vitest run tests/component/workspace/related-memory-panel.test.tsx tests/component/workspace/workspace-shell.test.tsx tests/component/workspace/workspace-library.test.tsx
```

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

- [ ] **Step 4: Run build if lint and tests are green**

```bash
npm run build
```

## Success Criteria

- [ ] Imported/source material shows related memory when saved words, sentences, or notes match.
- [ ] Related memory displays reasons for matches.
- [ ] User can create a deterministic Markdown learning note through existing notes storage.
- [ ] User can copy a structured AI prompt containing current material and related memory.
- [ ] Existing notes workbench and AI Dock internals remain untouched.
