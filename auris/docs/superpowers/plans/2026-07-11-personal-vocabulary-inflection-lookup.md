# Personal Vocabulary Inflection Lookup Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve common English grammatical inflections across the entire personal vocabulary so a lookup such as `duties` returns and saves the canonical `duty` entry.

**Architecture:** Add a pure, deterministic morphology module that generates conservative lemma candidates, then let the existing personal-vocabulary service resolve exact keys, built-in irregular forms, and heuristic candidates in that order. Keep the Markdown files, generated JSON schema, API contract, and reading UI unchanged.

**Tech Stack:** TypeScript, Next.js route handlers, Vitest, React Testing Library

---

## File structure

- Create `src/features/dictionary/personal-vocab/english-inflections.ts`: pure normalization-independent candidate generation, irregular mappings, and exception rules.
- Create `tests/unit/dictionary/english-inflections.test.ts`: exhaustive branch, ordering, exception, and boundary tests for the pure module.
- Modify `src/features/dictionary/personal-vocab/personal-vocab.ts`: exact-first resolution against the cached personal index, with an injectable pure resolver for fixtures.
- Modify `tests/unit/api/dictionary-lookup-route.test.ts`: route integration coverage using real indexed words, especially `duties -> duty`.
- Modify `src/components/reading/reading-workbench.tsx`: use the resolved canonical word for saved-state and save/delete keys once lookup succeeds.
- Modify `tests/component/reading/reading-workbench.test.tsx`: verify an inflected right-click lookup displays and saves the canonical lemma without a duplicate surface-form key.

## Dirty-worktree preflight

Before editing, capture `git status --short` and `git diff -- <each planned path>`. `tests/component/reading/reading-workbench.test.tsx` and `src/components/reading/reading-workbench.tsx` may already contain user changes. Preserve their baseline hunks and edit only the smallest relevant lines with `apply_patch`. Do not run ordinary whole-file `git add` or commit steps for any path that was dirty at preflight. At final verification compare those paths against the captured baseline, not merely against `HEAD`. Never stage `word-index.json`; it is outside this implementation and already user-modified.

### Task 1: Pure English inflection candidate generator

**Files:**
- Create: `src/features/dictionary/personal-vocab/english-inflections.ts`
- Test: `tests/unit/dictionary/english-inflections.test.ts`

- [ ] **Step 1: Write failing candidate-generation tests**

Cover mutually exclusive suffix families and exact candidate order:

```ts
expect(getEnglishLemmaCandidates("duties")).toEqual(["duty", "dutie"]);
expect(getEnglishLemmaCandidates("studied")).toEqual(["study"]);
expect(getEnglishLemmaCandidates("boxes")).toEqual(["box", "boxe"]);
expect(getEnglishLemmaCandidates("uses")).toEqual(["use"]);
expect(getEnglishLemmaCandidates("loved")).toEqual(["love", "lov"]);
expect(getEnglishLemmaCandidates("stopped")).toEqual(["stoppe", "stopp", "stop"]);
expect(getEnglishLemmaCandidates("making")).toEqual(["mak", "make"]);
expect(getEnglishLemmaCandidates("running")).toEqual(["runn", "runne", "run"]);
expect(getEnglishLemmaCandidates("happier")).toEqual(["happy"]);
expect(getEnglishLemmaCandidates("largest")).toEqual(["large"]);
```

Also cover irregular precedence data, exception words (`news`, `series`, `species`, `status`), three-letter cutoff, four-letter boundary, deduplication, and no derivational stemming (`worker`, `dutiful`). These expected arrays are the fixed contract. For `-er/-est`, emit only silent-e restoration and guarded consonant-undoubling candidates; do not emit the raw suffix-stripped stem, so `worker` cannot produce `work` while `larger` can produce `large`.

- [ ] **Step 2: Run the focused test and confirm red**

Run: `npx vitest run tests/unit/dictionary/english-inflections.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure module**

Export:

```ts
export function getIrregularEnglishLemma(word: string): string | null;
export function getEnglishLemmaCandidates(word: string): string[];
```

Use a lowercase constant map for irregular forms and a lowercase exception set. Apply only the first matching suffix family, filter candidates shorter than three characters, and remove duplicate/original candidates while preserving order. Do not include derivational suffixes. For `-er/-est`, emit silent-e restoration and guarded consonant undoubling only; never emit the raw suffix-stripped stem. Thus `largest` can produce `large`, while `worker` cannot produce `work`.

- [ ] **Step 4: Run the focused test and confirm green**

Run: `npx vitest run tests/unit/dictionary/english-inflections.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the pure module and tests**

If both paths were clean at preflight, stage exactly these two paths and commit `feat: add English inflection candidates`. Otherwise leave them unstaged and report why.

### Task 2: Exact-first personal vocabulary resolution

**Files:**
- Modify: `src/features/dictionary/personal-vocab/personal-vocab.ts`
- Create: `tests/unit/dictionary/personal-vocab.test.ts`

- [ ] **Step 1: Write failing fixture-based resolver tests**

Create a focused test file with tiny fixture entries and verify:

```ts
expect(resolvePersonalVocabEntry("duties", fixtureEntries)?.lookupKey).toBe("duty");
expect(resolvePersonalVocabEntry("went", fixtureEntries)?.lookupKey).toBe("go");
expect(resolvePersonalVocabEntry("worker", fixtureEntries)?.lookupKey).toBe("worker");
```

Add an exact-wins fixture in which both the surface token and a possible derived lemma exist. Add an irregular-vs-heuristic precedence assertion and an unresolved assertion.

In the same red phase, add the real-index route regression to `tests/unit/api/dictionary-lookup-route.test.ts`: request `/api/dictionary/lookup?word=duties` and assert status 200, canonical `entry.word` of `Duty`, and `entry.personal.fileName` of `2832-duty.md`.

- [ ] **Step 2: Run the resolver test and confirm red**

Run: `npx vitest run tests/unit/dictionary/personal-vocab.test.ts tests/unit/api/dictionary-lookup-route.test.ts`

Expected: FAIL because the injectable resolver is not exported and the route still returns 404 for `duties`.

- [ ] **Step 3: Implement the resolver and production integration**

Export a pure resolver accepting `readonly PersonalVocabEntry[]` or a readonly lookup map. Resolution order must be:

```text
normalized exact key
-> built-in irregular lemma if indexed
-> ordered heuristic candidates if indexed
-> null
```

Keep the existing lazy cached production map and error types. `lookupPersonalVocabDefinition()` calls the resolver and continues returning the canonical entry through `toDictionaryEntry()`.

- [ ] **Step 4: Run resolver and existing dictionary tests**

Run: `npx vitest run tests/unit/dictionary/personal-vocab.test.ts tests/unit/api/dictionary-lookup-route.test.ts`

Expected: resolver tests PASS and existing route tests remain PASS.

- [ ] **Step 5: Commit the service integration**

If both paths were clean at preflight, stage exactly these two paths and commit `feat: resolve inflected personal vocabulary`. Otherwise leave them unstaged and report why.

### Task 3: Route and reading-workbench regression coverage

**Files:**
- Modify: `tests/unit/api/dictionary-lookup-route.test.ts`
- Modify: `src/components/reading/reading-workbench.tsx`
- Modify: `tests/component/reading/reading-workbench.test.tsx`

- [ ] **Step 1: Confirm the route regression added in Task 2 is now green**

Request `/api/dictionary/lookup?word=duties` and assert status 200, `entry.word` is the canonical `Duty`, and `entry.personal.fileName` is `2832-duty.md`.

- [ ] **Step 2: Run the route test after Task 2 and confirm green**

Run: `npx vitest run tests/unit/api/dictionary-lookup-route.test.ts`

Expected: PASS through the new resolver.

- [ ] **Step 3: Before the component fix, add a reading-workbench canonical saved-state test**

Extend the existing right-click word-card test with an inflected selected token and a mocked canonical API response. Pre-seed canonical `duty`, look up `duties`, and assert the card reports the canonical saved state. Verify subsequent save/delete actions address `duty`, and inspect the existing store/callback boundary to assert no `duties` record is created.

- [ ] **Step 4: Run the component test before the fix and confirm red**

Run: `npx vitest run tests/component/reading/reading-workbench.test.tsx`

Expected: FAIL because saved-state currently uses the selected surface key.

- [ ] **Step 5: Implement the canonical consumer key**

Once `wordEntry` resolves, derive the saved-state/action key from `wordEntry.word`; before resolution, retain the normalized selected surface key only for loading behavior. Do not change the API request token or right-click interaction.

- [ ] **Step 6: Rerun route and component tests and confirm green**

Run: `npx vitest run tests/unit/api/dictionary-lookup-route.test.ts tests/component/reading/reading-workbench.test.tsx`

Expected: PASS.

- [ ] **Step 7: Stage only clean-at-preflight paths**

Do not commit the already-dirty reading component or test as whole files. If the API test was clean at preflight, it may be staged exactly and committed separately. Otherwise leave all Task 3 changes unstaged and report the preserved baseline.

### Task 4: Verification

**Files:**
- Verify only; no planned production edits.

- [ ] **Step 1: Run the focused dictionary and reading tests**

Run:

```bash
npx vitest run tests/unit/dictionary/english-inflections.test.ts tests/unit/dictionary/personal-vocab.test.ts tests/unit/api/dictionary-lookup-route.test.ts tests/component/reading/reading-workbench.test.tsx
```

Expected: all focused tests PASS.

- [ ] **Step 2: Run TypeScript**

Run: `npx tsc --noEmit`

Expected: no new TypeScript errors attributable to this change.

- [ ] **Step 3: Run lint on the changed implementation and tests**

Run: `npx eslint src/features/dictionary/personal-vocab/english-inflections.ts src/features/dictionary/personal-vocab/personal-vocab.ts tests/unit/dictionary/english-inflections.test.ts tests/unit/dictionary/personal-vocab.test.ts tests/unit/api/dictionary-lookup-route.test.ts tests/component/reading/reading-workbench.test.tsx`

Expected: 0 errors.

- [ ] **Step 4: Inspect the final diff and API impact**

Confirm `/api/dictionary/lookup` keeps the same request/response schema and desktop-local handling path. Confirm this task did not alter Markdown vocabulary files or add new changes to `word-index.json`. Compare final diffs with the preflight snapshots and confirm unrelated user hunks remain intact and unstaged.

- [ ] **Step 5: Commit any verification-only corrections**

If verification required corrections, commit only the affected dictionary files with a focused `fix:` commit. Otherwise, do not create an empty commit.
