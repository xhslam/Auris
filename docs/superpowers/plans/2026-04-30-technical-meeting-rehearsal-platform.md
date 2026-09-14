# Technical Meeting Rehearsal Platform Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reposition and rebuild `english-shadowing-web` into an enterprise-grade technical meeting English rehearsal platform for engineers preparing code review, design review, incident review, and architecture review meetings.

**Architecture:** Add a new `meeting-drill` domain beside the existing session, audio, assessment, notes, and desktop layers. Keep `/workspace` as the primary product route, but replace its generic shadowing workflow with a material-to-Q&A rehearsal workbench. Reuse existing recording, pronunciation, playback, local fallback, Supabase, and Electron capabilities through explicit adapters instead of mixing new product logic into old session abstractions.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Zod, Supabase, Vitest, Playwright, Electron desktop bridge, local JSON persistence, OpenAI-compatible server-side generation.

---

## Spec Reference

- Design spec: `docs/superpowers/specs/2026-04-30-technical-meeting-rehearsal-platform-design.md`

## Ground Rules

- Follow TDD for production behavior changes: write failing tests, verify red, implement, verify green.
- Keep files focused. New domain files should stay small and cohesive.
- Keep all AI-facing input and output schema-validated.
- Do not log raw PRs, diffs, issue text, incident text, or design docs.
- Preserve useful existing functionality while changing product identity and workflow.
- Do not hardcode model keys, API keys, service URLs, tokens, or private workspace paths.
- Use local fallback when Supabase is unavailable, matching the current repository style.
- Keep commits as logical checkpoints. If the workspace has no usable commit history, treat commit steps as handoff boundaries.

## File Map

### Existing Files To Modify

- `README.md`
  - Update product description and setup notes.
- `src/app/page.tsx`
  - Continues to render the home shell.
- `src/app/workspace/page.tsx`
  - Keep route entry, update loading copy if needed.
- `src/app/api/sessions/route.ts`
  - Leave intact for legacy session flows.
- `src/components/home/desktop-home-shell.tsx`
  - Replace generic learning copy with technical meeting rehearsal dashboard copy.
- `src/components/runtime/desktop-shell-fixtures.ts`
  - Update navigation labels, descriptions, and home card fixtures.
- `src/components/workspace/workspace-shell.tsx`
  - Convert from generic shadowing composition to meeting rehearsal workbench composition.
- `src/components/workspace/source-panel.tsx`
  - Either retire behind compatibility or replace usages with meeting material components.
- `src/features/app-runtime/home-resume.ts`
  - Update resume labels from training to drill/rehearsal where user-visible.
- `src/server/repositories/local-persistence.ts`
  - Do not overload if possible; create a separate meeting-drill persistence module instead.
- `supabase/migrations/README.md`
  - Add migration note for meeting drill schema.
- `supabase/seed.sql`
  - Replace or supplement starter templates with technical review examples.

### New Source Files

- `src/features/meeting-drill/meeting-drill.types.ts`
  - Domain types for materials, runs, questions, attempts, phrase bank, audit events.
- `src/features/meeting-drill/meeting-drill-schemas.ts`
  - Zod schemas for user input, generated AI output, and persisted DTOs.
- `src/features/meeting-drill/meeting-drill-validation.ts`
  - Pure validation helpers for generated output invariants.
- `src/features/meeting-drill/meeting-material-normalization.ts`
  - Normalizes pasted or imported material without losing the raw source.
- `src/features/meeting-drill/meeting-drill-prompt.ts`
  - Builds model prompts from normalized material and user options.
- `src/features/meeting-drill/meeting-drill-generator.ts`
  - Server-side generation service with injectable provider.
- `src/features/meeting-drill/meeting-drill-readiness.ts`
  - Pure readiness scoring helpers for attempts and question confidence.
- `src/features/meeting-drill/use-meeting-drill-workbench.ts`
  - Client orchestration hook for material, generation, selected question, attempts, and phrase saving.
- `src/server/repositories/meeting-drill-repository.ts`
  - Supabase or local fallback repository facade.
- `src/server/repositories/meeting-drill-local-persistence.ts`
  - Local JSON store for materials, runs, questions, attempts, phrases, audit events.
- `src/app/api/meeting-drill/materials/route.ts`
  - Create/list meeting materials.
- `src/app/api/meeting-drill/generate/route.ts`
  - Generate a validated drill run.
- `src/app/api/meeting-drill/runs/route.ts`
  - List recent drill runs.
- `src/app/api/meeting-drill/runs/[runId]/route.ts`
  - Get one run with questions and attempts.
- `src/app/api/meeting-drill/attempts/route.ts`
  - Save answer attempts.
- `src/app/api/meeting-drill/phrase-bank/route.ts`
  - Save phrase bank entries.
- `src/components/meeting-drill/meeting-material-panel.tsx`
  - Material type, source input, generation options, and generate action.
- `src/components/meeting-drill/rehearsal-stage.tsx`
  - 15-minute question-by-question rehearsal runtime.
- `src/components/meeting-drill/question-card.tsx`
  - Reviewer role, question, intent, difficulty, answer reveal.
- `src/components/meeting-drill/recommended-answer-panel.tsx`
  - Recommended answer, alternate answer, risk, and phrases.
- `src/components/meeting-drill/readiness-panel.tsx`
  - Confidence, risks, phrase bank, and attempt summary.
- `src/components/meeting-drill/phrase-bank-panel.tsx`
  - Save and display reusable phrases.
- `src/components/meeting-drill/rehearsal-timeline.tsx`
  - 15-minute timeline display.
- `src/components/meeting-drill/meeting-drill-empty-state.tsx`
  - Empty, loading, and failed-generation states.
- `supabase/migrations/20260430_000004_meeting_drill_schema.sql`
  - Cloud schema, indexes, and RLS.
- `supabase/migrations/20260430_000004_meeting_drill_schema_rollback.sql`
  - Rollback for new schema.

### New Test Files

- `tests/unit/meeting-drill/meeting-drill-schemas.test.ts`
- `tests/unit/meeting-drill/meeting-drill-validation.test.ts`
- `tests/unit/meeting-drill/meeting-material-normalization.test.ts`
- `tests/unit/meeting-drill/meeting-drill-prompt.test.ts`
- `tests/unit/meeting-drill/meeting-drill-generator.test.ts`
- `tests/unit/meeting-drill/meeting-drill-readiness.test.ts`
- `tests/unit/meeting-drill/meeting-drill-local-persistence.test.ts`
- `tests/unit/meeting-drill/meeting-drill-repository.test.ts`
- `tests/unit/api/meeting-drill-materials-route.test.ts`
- `tests/unit/api/meeting-drill-generate-route.test.ts`
- `tests/unit/api/meeting-drill-runs-route.test.ts`
- `tests/unit/api/meeting-drill-attempts-route.test.ts`
- `tests/unit/api/meeting-drill-phrase-bank-route.test.ts`
- `tests/component/meeting-drill/meeting-material-panel.test.tsx`
- `tests/component/meeting-drill/rehearsal-stage.test.tsx`
- `tests/component/meeting-drill/readiness-panel.test.tsx`
- `tests/component/workspace/meeting-drill-workspace.test.tsx`
- `tests/e2e/meeting-drill-smoke.spec.ts`

## Implementation Order

1. Lock product direction with tests for schemas, product copy, and route contracts.
2. Build the meeting-drill domain model and validation layer.
3. Add local persistence and Supabase schema with RLS.
4. Add API routes with mocked generation.
5. Add generation service and prompt builder.
6. Reposition home and navigation surfaces.
7. Replace workspace composition with meeting rehearsal workbench components.
8. Add attempts, phrase bank, and readiness review.
9. Integrate recording and pronunciation assessment links.
10. Run full verification and update docs.

## Task 1: Lock The Product Pivot With Characterization Tests

**Files:**
- Modify: `tests/component/home/desktop-home-shell.test.tsx`
- Modify: `tests/component/runtime/desktop-app-sidebar.test.tsx`
- Create: `tests/component/workspace/meeting-drill-workspace.test.tsx`
- Test target: `src/components/home/desktop-home-shell.tsx`
- Test target: `src/components/runtime/desktop-shell-fixtures.ts`
- Test target: `src/components/workspace/workspace-shell.tsx`

- [ ] **Step 1: Add failing home copy expectations**

Add assertions that the home shell presents the new product promise:

```tsx
expect(screen.getByText(/technical meeting rehearsal/i)).toBeInTheDocument();
expect(screen.getByText(/code review/i)).toBeInTheDocument();
expect(screen.getByText(/design review/i)).toBeInTheDocument();
expect(screen.getByRole("link", { name: /start rehearsal/i })).toHaveAttribute("href", "/workspace");
```

- [ ] **Step 2: Run the home test and verify RED**

Run:

```bash
npx vitest run tests/component/home/desktop-home-shell.test.tsx
```

Expected: FAIL because the current home surface still describes generic English learning and training.

- [ ] **Step 3: Add failing navigation expectations**

In the sidebar test, assert product navigation labels and route targets:

```tsx
expect(screen.getByLabelText(/rehearsal workspace/i)).toHaveAttribute("href", "/workspace");
expect(screen.getByLabelText(/phrase bank/i)).toHaveAttribute("href", "/wordbook");
```

- [ ] **Step 4: Run the sidebar test and verify RED**

Run:

```bash
npx vitest run tests/component/runtime/desktop-app-sidebar.test.tsx
```

Expected: FAIL because labels still reflect the older product surface.

- [ ] **Step 5: Add a workspace characterization test for the future workbench**

Create `tests/component/workspace/meeting-drill-workspace.test.tsx` with expectations for:

- material input region
- 10-question rehearsal region placeholder
- readiness panel
- phrase bank entry point

- [ ] **Step 6: Run the workspace test and verify RED**

Run:

```bash
npx vitest run tests/component/workspace/meeting-drill-workspace.test.tsx
```

Expected: FAIL because the workspace still renders generic source and reader panels.

## Task 2: Build Meeting-Drill Domain Types And Schemas

**Files:**
- Create: `src/features/meeting-drill/meeting-drill.types.ts`
- Create: `src/features/meeting-drill/meeting-drill-schemas.ts`
- Create: `src/features/meeting-drill/meeting-drill-validation.ts`
- Create: `src/features/meeting-drill/meeting-material-normalization.ts`
- Test: `tests/unit/meeting-drill/meeting-drill-schemas.test.ts`
- Test: `tests/unit/meeting-drill/meeting-drill-validation.test.ts`
- Test: `tests/unit/meeting-drill/meeting-material-normalization.test.ts`

- [ ] **Step 1: Write schema tests first**

Test valid material input, invalid empty text, unsupported source type, valid generated output, wrong question count, empty answer, and invalid timeline coverage.

Run:

```bash
npx vitest run tests/unit/meeting-drill/meeting-drill-schemas.test.ts
```

Expected: FAIL because files do not exist.

- [ ] **Step 2: Implement domain types**

Create union types:

- `MeetingMaterialSourceType`
- `MeetingType`
- `ReviewerRole`
- `QuestionDifficulty`
- `PhraseCategory`
- `AnswerConfidence`
- `DrillRunStatus`

Create records:

- `MeetingMaterialRecord`
- `DrillRunRecord`
- `DrillQuestionRecord`
- `AnswerAttemptRecord`
- `PhraseBankItemRecord`
- `AuditEventRecord`

- [ ] **Step 3: Implement Zod schemas**

Schemas must include:

- `createMeetingMaterialSchema`
- `generateMeetingDrillSchema`
- `generatedMeetingDrillSchema`
- `saveAnswerAttemptSchema`
- `savePhraseBankItemSchema`

- [ ] **Step 4: Implement validation helpers**

Add pure helpers:

- `validateGeneratedQuestionCount`
- `validateTimelineCoverage`
- `validateGeneratedMeetingDrill`

They should return typed results instead of throwing where useful for API error handling.

- [ ] **Step 5: Implement material normalization**

Normalize line endings, trim excessive whitespace, preserve raw text separately, and derive fallback titles.

- [ ] **Step 6: Run schema and normalization tests**

Run:

```bash
npx vitest run \
  tests/unit/meeting-drill/meeting-drill-schemas.test.ts \
  tests/unit/meeting-drill/meeting-drill-validation.test.ts \
  tests/unit/meeting-drill/meeting-material-normalization.test.ts
```

Expected: PASS.

## Task 3: Add Local Persistence And Repository Facade

**Files:**
- Create: `src/server/repositories/meeting-drill-local-persistence.ts`
- Create: `src/server/repositories/meeting-drill-repository.ts`
- Test: `tests/unit/meeting-drill/meeting-drill-local-persistence.test.ts`
- Test: `tests/unit/meeting-drill/meeting-drill-repository.test.ts`

- [ ] **Step 1: Write local persistence tests**

Cover:

- empty store fallback
- creating material
- saving generated run with questions
- listing recent runs
- saving an attempt immutably
- saving phrase bank item
- deleting material cascades dependent local records

Run:

```bash
npx vitest run tests/unit/meeting-drill/meeting-drill-local-persistence.test.ts
```

Expected: FAIL because persistence module does not exist.

- [ ] **Step 2: Implement local store**

Use `.shadowing-data/meeting-drill-store.json` by default.

The store shape should include:

- `materials`
- `runs`
- `questions`
- `attempts`
- `phraseBankItems`
- `auditEvents`

All writes must create new arrays and new store objects.

- [ ] **Step 3: Write repository facade tests**

Mock Supabase as unavailable and assert fallback behavior.

Run:

```bash
npx vitest run tests/unit/meeting-drill/meeting-drill-repository.test.ts
```

Expected: FAIL because repository facade does not exist.

- [ ] **Step 4: Implement repository facade**

Add functions:

- `createMeetingMaterial`
- `listMeetingMaterialsByUser`
- `getMeetingMaterialById`
- `saveGeneratedDrillRun`
- `listRecentDrillRunsByUser`
- `getDrillRunById`
- `saveAnswerAttempt`
- `savePhraseBankItem`
- `appendAuditEvent`

- [ ] **Step 5: Run repository tests**

Run:

```bash
npx vitest run \
  tests/unit/meeting-drill/meeting-drill-local-persistence.test.ts \
  tests/unit/meeting-drill/meeting-drill-repository.test.ts
```

Expected: PASS.

## Task 4: Add Supabase Schema And RLS

**Files:**
- Create: `supabase/migrations/20260430_000004_meeting_drill_schema.sql`
- Create: `supabase/migrations/20260430_000004_meeting_drill_schema_rollback.sql`
- Modify: `supabase/migrations/README.md`
- Test: `tests/unit/supabase/meeting-drill-rls-migration.test.ts`

- [ ] **Step 1: Write migration test**

Follow the pattern in `tests/unit/supabase/rls-migration.test.ts`.

Assert the migration contains:

- all required tables
- indexes for user and parent IDs
- RLS enablement
- ownership helper functions or policies
- rollback drops policies and tables safely

Run:

```bash
npx vitest run tests/unit/supabase/meeting-drill-rls-migration.test.ts
```

Expected: FAIL because migration files do not exist.

- [ ] **Step 2: Create schema migration**

Tables:

- `projects`
- `meeting_materials`
- `drill_runs`
- `drill_questions`
- `answer_attempts`
- `phrase_bank_items`
- `audit_events`

Use `jsonb` for generated summaries, timelines, risk maps, tags, and metadata where the structure is nested but schema-validated in app code.

- [ ] **Step 3: Add RLS policies**

Policies:

- users can CRUD their own materials, runs, attempts, phrase items
- questions are accessible through owned runs
- audit events are readable by owner and append-only through server-side inserts

- [ ] **Step 4: Add rollback**

Rollback should drop policies, helper functions if added, and tables in dependency order.

- [ ] **Step 5: Run migration test**

Run:

```bash
npx vitest run tests/unit/supabase/meeting-drill-rls-migration.test.ts
```

Expected: PASS.

## Task 5: Add API Routes With Mockable Generation Boundary

**Files:**
- Create: `src/app/api/meeting-drill/materials/route.ts`
- Create: `src/app/api/meeting-drill/generate/route.ts`
- Create: `src/app/api/meeting-drill/runs/route.ts`
- Create: `src/app/api/meeting-drill/runs/[runId]/route.ts`
- Create: `src/app/api/meeting-drill/attempts/route.ts`
- Create: `src/app/api/meeting-drill/phrase-bank/route.ts`
- Test: `tests/unit/api/meeting-drill-materials-route.test.ts`
- Test: `tests/unit/api/meeting-drill-generate-route.test.ts`
- Test: `tests/unit/api/meeting-drill-runs-route.test.ts`
- Test: `tests/unit/api/meeting-drill-attempts-route.test.ts`
- Test: `tests/unit/api/meeting-drill-phrase-bank-route.test.ts`

- [ ] **Step 1: Write materials route tests**

Cover auth required, invalid input, and successful material creation.

Run:

```bash
npx vitest run tests/unit/api/meeting-drill-materials-route.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Implement materials route**

Use:

- `getSessionActor`
- `createMeetingMaterialSchema`
- `createMeetingMaterial`

Return user-friendly Chinese error messages, but do not include raw material text in error payloads.

- [ ] **Step 3: Write generate route tests**

Cover:

- auth required
- material missing
- forbidden material
- generator invalid output
- successful generated run

Run:

```bash
npx vitest run tests/unit/api/meeting-drill-generate-route.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement generate route with injectable generator**

The route should:

- validate request
- load material
- check owner
- call `generateMeetingDrill`
- validate output
- persist run and questions
- append audit event

- [ ] **Step 5: Implement runs, attempts, and phrase routes with tests**

Each route must require auth and ownership checks.

- [ ] **Step 6: Run API tests**

Run:

```bash
npx vitest run \
  tests/unit/api/meeting-drill-materials-route.test.ts \
  tests/unit/api/meeting-drill-generate-route.test.ts \
  tests/unit/api/meeting-drill-runs-route.test.ts \
  tests/unit/api/meeting-drill-attempts-route.test.ts \
  tests/unit/api/meeting-drill-phrase-bank-route.test.ts
```

Expected: PASS.

## Task 6: Implement Generation Prompt And Service

**Files:**
- Create: `src/features/meeting-drill/meeting-drill-prompt.ts`
- Create: `src/features/meeting-drill/meeting-drill-generator.ts`
- Test: `tests/unit/meeting-drill/meeting-drill-prompt.test.ts`
- Test: `tests/unit/meeting-drill/meeting-drill-generator.test.ts`

- [ ] **Step 1: Write prompt builder tests**

Assert the prompt includes:

- meeting type
- reviewer role set
- exact requirement for 10 questions
- exact 15-minute timeline requirement
- privacy instruction to avoid inventing private context

Run:

```bash
npx vitest run tests/unit/meeting-drill/meeting-drill-prompt.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Implement prompt builder**

Export:

- `MEETING_DRILL_PROMPT_VERSION`
- `buildMeetingDrillPrompt`

Keep prompt builder pure.

- [ ] **Step 3: Write generator tests**

Use a fake provider that returns:

- valid JSON
- malformed JSON
- schema-invalid JSON
- valid JSON with wrong question count

Run:

```bash
npx vitest run tests/unit/meeting-drill/meeting-drill-generator.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement generator service**

Expose:

- `generateMeetingDrill`
- `__setMeetingDrillGeneratorProviderForTests`

Provider should be server-side only. Use environment configuration from existing server env patterns before wiring a real provider.

- [ ] **Step 5: Run generation tests**

Run:

```bash
npx vitest run \
  tests/unit/meeting-drill/meeting-drill-prompt.test.ts \
  tests/unit/meeting-drill/meeting-drill-generator.test.ts
```

Expected: PASS.

## Task 7: Reposition Home And Navigation

**Files:**
- Modify: `src/components/home/desktop-home-shell.tsx`
- Modify: `src/components/runtime/desktop-shell-fixtures.ts`
- Modify: `src/features/app-runtime/home-resume.ts`
- Modify: `README.md`
- Test: `tests/component/home/desktop-home-shell.test.tsx`
- Test: `tests/component/runtime/desktop-app-sidebar.test.tsx`
- Test: `tests/unit/app-runtime/app-runtime-storage.test.ts`

- [ ] **Step 1: Implement minimal home copy changes to pass RED tests**

Replace generic English learning copy with:

- technical meeting rehearsal
- PR, issue, design doc, code diff
- 15-minute Q&A practice
- code review and design review

- [ ] **Step 2: Update navigation fixtures**

Suggested labels:

- Home: `Dashboard`
- Chat: `AI Coach`
- Assistant/workspace: `Rehearsal`
- Wordbook: `Phrase Bank`
- Assessment: `Readiness`
- Documents: `Materials`

Keep route targets stable.

- [ ] **Step 3: Update resume copy**

Where user-visible labels say training, switch to drill or rehearsal if the target is meeting-drill.

- [ ] **Step 4: Run product surface tests**

Run:

```bash
npx vitest run \
  tests/component/home/desktop-home-shell.test.tsx \
  tests/component/runtime/desktop-app-sidebar.test.tsx \
  tests/unit/app-runtime/app-runtime-storage.test.ts
```

Expected: PASS.

## Task 8: Build Meeting Drill UI Components

**Files:**
- Create: `src/components/meeting-drill/meeting-material-panel.tsx`
- Create: `src/components/meeting-drill/rehearsal-stage.tsx`
- Create: `src/components/meeting-drill/question-card.tsx`
- Create: `src/components/meeting-drill/recommended-answer-panel.tsx`
- Create: `src/components/meeting-drill/readiness-panel.tsx`
- Create: `src/components/meeting-drill/phrase-bank-panel.tsx`
- Create: `src/components/meeting-drill/rehearsal-timeline.tsx`
- Create: `src/components/meeting-drill/meeting-drill-empty-state.tsx`
- Test: `tests/component/meeting-drill/meeting-material-panel.test.tsx`
- Test: `tests/component/meeting-drill/rehearsal-stage.test.tsx`
- Test: `tests/component/meeting-drill/readiness-panel.test.tsx`

- [ ] **Step 1: Write material panel tests**

Cover:

- material type selection
- title input
- text input
- generate button disabled for empty material
- error message display
- loading state

Run:

```bash
npx vitest run tests/component/meeting-drill/meeting-material-panel.test.tsx
```

Expected: FAIL.

- [ ] **Step 2: Implement material panel**

Props should be controlled and testable:

- `draft`
- `status`
- `message`
- `onDraftChange`
- `onGenerate`

- [ ] **Step 3: Write rehearsal stage tests**

Cover:

- renders 10 questions
- starts on opening summary
- advances to next question
- reveals recommended answer
- marks confidence
- displays 15-minute timeline

- [ ] **Step 4: Implement rehearsal stage and question card**

Keep timers deterministic by allowing a `nowMs` or timer control abstraction in tests if needed.

- [ ] **Step 5: Write readiness panel tests**

Cover:

- risk map display
- phrase bank save button
- attempt summary
- confidence counts

- [ ] **Step 6: Implement readiness and phrase panels**

Do not call APIs directly from small presentational panels. Pass callbacks from the workbench hook.

- [ ] **Step 7: Run component tests**

Run:

```bash
npx vitest run \
  tests/component/meeting-drill/meeting-material-panel.test.tsx \
  tests/component/meeting-drill/rehearsal-stage.test.tsx \
  tests/component/meeting-drill/readiness-panel.test.tsx
```

Expected: PASS.

## Task 9: Wire Meeting Drill Workbench Into `/workspace`

**Files:**
- Create: `src/features/meeting-drill/use-meeting-drill-workbench.ts`
- Modify: `src/components/workspace/workspace-shell.tsx`
- Test: `tests/component/workspace/meeting-drill-workspace.test.tsx`
- Test: `tests/component/workspace/workspace-shell.test.tsx`

- [ ] **Step 1: Write hook behavior tests if needed**

If the hook includes non-trivial state transitions, add unit coverage for:

- material draft update
- generation success
- generation failure
- question selection
- confidence update
- phrase save

- [ ] **Step 2: Implement workbench hook**

The hook should own:

- draft material state
- current run
- selected question index
- generation status
- route/API calls
- answer confidence state
- phrase save state

- [ ] **Step 3: Replace workspace composition**

Use:

- `MeetingMaterialPanel`
- `RehearsalStage`
- `ReadinessPanel`
- existing `VoiceRecorderPanel` where answer attempts need recording

Keep `DesktopAppFrame` and route entry stable.

- [ ] **Step 4: Run workspace tests**

Run:

```bash
npx vitest run \
  tests/component/workspace/meeting-drill-workspace.test.tsx \
  tests/component/workspace/workspace-shell.test.tsx
```

Expected: PASS.

## Task 10: Add Answer Attempts, Readiness, And Phrase Bank

**Files:**
- Create: `src/features/meeting-drill/meeting-drill-readiness.ts`
- Modify: `src/features/meeting-drill/use-meeting-drill-workbench.ts`
- Modify: `src/components/meeting-drill/readiness-panel.tsx`
- Modify: `src/components/meeting-drill/phrase-bank-panel.tsx`
- Test: `tests/unit/meeting-drill/meeting-drill-readiness.test.ts`
- Test: `tests/component/meeting-drill/readiness-panel.test.tsx`

- [ ] **Step 1: Write readiness tests**

Cover:

- no attempts returns neutral state
- confidence counts affect readiness
- unanswered challenge questions lower readiness
- saved attempts produce summary

Run:

```bash
npx vitest run tests/unit/meeting-drill/meeting-drill-readiness.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Implement readiness helpers**

Use deterministic pure functions. Avoid pretending to measure things not yet captured.

- [ ] **Step 3: Wire attempts and phrase saving**

Persist:

- confidence mark
- optional transcript
- optional recording URL
- saved phrase entries

- [ ] **Step 4: Run readiness tests**

Run:

```bash
npx vitest run \
  tests/unit/meeting-drill/meeting-drill-readiness.test.ts \
  tests/component/meeting-drill/readiness-panel.test.tsx
```

Expected: PASS.

## Task 11: Integrate Recording And Pronunciation Assessment

**Files:**
- Modify: `src/components/workspace/workspace-shell.tsx`
- Modify: `src/components/workspace/voice-recorder-panel.tsx` only if required
- Modify: `src/components/assessment/assessment-shell.tsx` only if linking from attempts requires it
- Modify: `src/features/assessment/pronunciation-assessment.types.ts` only if a reference link is needed
- Test: `tests/component/workspace/voice-recorder-panel.test.tsx`
- Test: `tests/component/assessment/assessment-shell.test.tsx`
- Test: `tests/component/workspace/meeting-drill-workspace.test.tsx`

- [ ] **Step 1: Add tests for recording availability in rehearsal**

Assert the workspace exposes recording controls while a question is selected.

- [ ] **Step 2: Link saved recordings to answer attempts**

Prefer a small adapter rather than making `VoiceRecorderPanel` know about meeting drills.

- [ ] **Step 3: Link pronunciation assessment to selected answer text**

If a full integration is too broad for the first pass, add a clear route handoff with selected question text as the reference.

- [ ] **Step 4: Run recording and assessment tests**

Run:

```bash
npx vitest run \
  tests/component/workspace/voice-recorder-panel.test.tsx \
  tests/component/assessment/assessment-shell.test.tsx \
  tests/component/workspace/meeting-drill-workspace.test.tsx
```

Expected: PASS.

## Task 12: Add E2E Smoke And Full Verification

**Files:**
- Create: `tests/e2e/meeting-drill-smoke.spec.ts`
- Modify: `playwright.config.ts` only if route mocking support is needed

- [ ] **Step 1: Add smoke test**

Flow:

- open `/workspace`
- paste material
- mock generation response
- generate drill
- see 10 questions
- open recommended answer
- mark one answer as shaky
- save one phrase
- see readiness panel update

- [ ] **Step 2: Run smoke test**

Run:

```bash
npx playwright test tests/e2e/meeting-drill-smoke.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Run targeted meeting-drill test suite**

Run:

```bash
npx vitest run \
  tests/unit/meeting-drill \
  tests/unit/api/meeting-drill-materials-route.test.ts \
  tests/unit/api/meeting-drill-generate-route.test.ts \
  tests/unit/api/meeting-drill-runs-route.test.ts \
  tests/unit/api/meeting-drill-attempts-route.test.ts \
  tests/unit/api/meeting-drill-phrase-bank-route.test.ts \
  tests/component/meeting-drill \
  tests/component/workspace/meeting-drill-workspace.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 5: Run full tests**

Run:

```bash
npm run test
```

Expected: PASS.

- [ ] **Step 6: Run production build**

Run:

```bash
npm run build
```

Expected: PASS.

## Success Checklist

- [ ] Product copy targets engineers preparing English technical meetings.
- [ ] `/workspace` is a technical meeting rehearsal workbench.
- [ ] Meeting-drill domain schemas validate inputs and AI output.
- [ ] Repository supports Supabase and local fallback.
- [ ] Supabase migration includes RLS and rollback.
- [ ] API routes enforce auth, validation, and ownership.
- [ ] Generation service returns validated 10-question drill packages.
- [ ] Rehearsal stage supports 15-minute Q&A flow.
- [ ] Answer attempts and phrase bank can be saved.
- [ ] Recording and assessment are connected or have a clear route handoff.
- [ ] E2E smoke covers the primary flow.
- [ ] `npm run lint` passes.
- [ ] `npm run test` passes.
- [ ] `npm run build` passes.

## Review Notes

- This plan deliberately exceeds a minimal MVP and treats the work as a product/domain pivot.
- The first implementation should still land in stable, testable slices.
- The required subagent plan-review loop was not run because delegated subagent work was not explicitly requested in this thread.
- If the current root repository remains uncommitted/untracked, use the commit steps as logical checkpoints rather than blocking progress.
