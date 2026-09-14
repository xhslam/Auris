# Technical Meeting Rehearsal Platform Design

- Date: 2026-04-30
- Project: `english-shadowing-web`
- Status: Approved in chat as enterprise-level product direction

## Summary

This design turns `english-shadowing-web` from a general English shadowing product into an enterprise-grade technical meeting rehearsal platform.

The product should help engineers who often attend English code reviews, design reviews, incident reviews, architecture discussions, and sprint demos prepare from their real work materials. A user provides a PR, issue, code diff, technical design, or meeting note, and the app generates a structured rehearsal package:

- context summary
- technical risk map
- 10 likely English follow-up questions
- recommended answers and alternate answer angles
- role-based reviewer challenges
- 15-minute oral rehearsal flow
- recording, playback, pronunciation feedback, and meeting-readiness review

The existing shadowing, recording, wordbook, sentencebook, pronunciation, notes, Electron, and Supabase capabilities remain valuable, but their role changes. They become underlying engines for a new professional workflow rather than the primary product identity.

## Goal, Context, Constraints, Done When

### Goal

Build an enterprise-ready product direction and implementation structure for:

> Turn technical work materials into a 15-minute English meeting rehearsal that reduces the risk of getting stuck, speaking out of order, or failing to handle follow-up questions.

### Context

The current project already contains:

- Next.js App Router routes for home, workspace, notes, assessment, audio, video, documents, settings, and auth.
- A workspace flow that creates training sessions from pasted text, files, URLs, and templates.
- Audio generation, word-level timestamp mapping, reader playback, sentence saving, wordbook saving, and recording.
- Azure pronunciation assessment and local assessment history.
- Supabase-backed sessions, templates, sentences, word tokens, RLS, and private audio storage.
- Electron desktop bridge capabilities for local history, prompt library, AI dock, notes vault, terminal, downloads, and local voice engine.
- Existing architectural refactor work that already split workspace runtime hooks and improved desktop module entry.

### Constraints

- Treat this as a product pivot, not a small feature add-on.
- Preserve useful existing capabilities while changing the primary information architecture.
- Avoid scattering new logic into the already heavy workspace component layer.
- Keep domain logic in `src/features/meeting-drill/` and persistence in `src/server/repositories/`.
- Validate all AI inputs and outputs with schemas.
- Keep sensitive work materials private by default, with explicit local and cloud boundaries.
- Support both Supabase persistence and local fallback where the current app already follows that pattern.
- Do not hardcode secrets or private service URLs.

### Done When

The platform direction is materially implemented when:

- The first-run product surface clearly communicates technical meeting rehearsal, not generic shadowing.
- A user can create a rehearsal from technical material.
- The app generates a structured drill with 10 questions, recommended answers, risk notes, useful phrases, and a 15-minute timeline.
- The user can rehearse question by question, record answers, replay attempts, and save useful phrases.
- The user can review readiness signals after rehearsal.
- The system stores materials, drill runs, questions, answer attempts, and phrase bank entries with ownership boundaries.
- Lint, tests, and build pass for the changed surface.

## Product Positioning

### One-Sentence Product

For engineers who need to speak in English technical meetings, the product turns PRs, issues, code diffs, and design docs into a focused 15-minute Q&A rehearsal.

### Primary User

The primary user is a software engineer who can read technical English but becomes slower or less structured when speaking live in English review meetings.

Typical scenarios:

- Defending a PR in English code review.
- Presenting a design proposal to international teammates.
- Joining an architecture review with senior engineers.
- Explaining an incident or bug triage update.
- Demoing implementation progress in sprint review.

### Core Promise

The product should help the user enter the meeting with:

- a crisp opening summary
- prepared answers for the most likely follow-ups
- phrases for trade-offs, uncertainty, risk, rollout, and next steps
- enough spoken rehearsal to reduce hesitation
- awareness of weak points before the real meeting

## Non-Goals

- Do not build a broad language-learning marketplace in this phase.
- Do not prioritize courses, community, generic audio, or generic video as first-class product surfaces.
- Do not add GitHub, Jira, Linear, or Slack OAuth integrations before the internal rehearsal workflow is stable.
- Do not make the AI score system pretend to be objective beyond the evidence it can inspect.
- Do not expose private materials to browser-side public keys or logs.
- Do not remove existing shadowing functionality before the replacement flows can reuse or supersede it safely.

## Enterprise Product Pillars

### 1. Material Intelligence

The app must understand work materials as meeting inputs, not as plain reading passages.

Supported material types:

- PR summary
- code diff
- issue
- design doc
- incident note
- sprint demo note
- freeform meeting material

Each material should keep:

- source type
- title
- raw text
- normalized text
- optional source URL or file name
- version metadata
- creation and update timestamps
- owner

### 2. Drill Generation Engine

Generation should return structured output, not loose markdown.

The engine should produce:

- material summary
- agenda framing
- technical risk list
- assumptions and unknowns
- 10 likely questions
- recommended answer for each question
- stronger alternate answer where useful
- follow-up trap or risk for each question
- useful phrases for the user to reuse
- 15-minute rehearsal timeline

Every generated result should record:

- prompt version
- model/provider metadata where safe
- generation status
- retry count
- validation errors if any

### 3. Role-Based Review Simulation

Questions should be generated from realistic meeting roles:

- code reviewer
- staff engineer or architect
- product manager
- SRE or operations reviewer
- security reviewer
- tech lead

The UI should show which role asked a question and why that question is likely.

### 4. Rehearsal Runtime

The rehearsal flow should be time-bound and operational:

- 2 minutes: opening summary
- 8 minutes: 10 likely Q&A prompts
- 3 minutes: challenge round with harder follow-ups
- 2 minutes: recap, risks, and action items

The user should be able to:

- start, pause, and reset the rehearsal
- answer a question aloud
- record an attempt
- replay their own answer
- compare with the recommended answer
- mark a question as confident, shaky, or unresolved
- save useful phrases

### 5. Assessment Layer

Existing pronunciation assessment should be expanded into meeting-readiness feedback.

Readiness dimensions:

- clarity
- structure
- technical completeness
- risk handling
- answer concision
- pronunciation and fluency
- ability to handle follow-up pressure

The first implementation can compute some dimensions heuristically, but the model should leave room for deeper AI review later.

### 6. Knowledge Layer

The product should build durable professional assets:

- phrase bank
- project glossary
- recurring weak questions
- saved recommended answers
- meeting preparation history
- personal improvement notes

Existing wordbook and sentencebook can be evolved into this layer.

### 7. Enterprise Trust Surface

Because inputs may contain private work material:

- validate inputs at API boundaries
- keep user ownership checks explicit
- use RLS for cloud persistence
- support local fallback for desktop use
- avoid logging raw materials
- add audit events for generation, export, deletion, and assessment operations
- make deletion semantics clear

## Information Architecture

The primary desktop structure should shift to:

- Home: meeting rehearsal dashboard
- Rehearsal Workspace: main technical material to Q&A flow
- Materials: saved PRs, docs, issues, diffs
- Drill History: previous rehearsal runs and answer attempts
- Phrase Bank: saved phrases and answers
- Assessment: pronunciation and readiness feedback
- Notes: local knowledge workspace
- Settings: providers, privacy, storage, export

Existing routes can be migrated gradually:

- `/workspace` becomes the main rehearsal workspace.
- `/assessment` stays as the assessment surface, then gains meeting-readiness context.
- `/notes` remains the local-first knowledge surface.
- `/audio`, `/video`, `/courses`, and `/community` become secondary or legacy surfaces until a later product cleanup.

## Workspace Redesign

The new `/workspace` should be a three-zone workbench.

### Left: Material Panel

Responsibilities:

- choose material type
- paste or import source material
- display source metadata
- show privacy/storage mode
- trigger drill generation
- show generation status and validation errors

Possible component names:

- `MeetingMaterialPanel`
- `MaterialSourceTabs`
- `MaterialMetadataForm`
- `GenerateDrillButton`

### Center: Rehearsal Stage

Responsibilities:

- display opening summary task
- present one question at a time
- show reviewer role and question intent
- reveal recommended answer
- run timer and progress
- record answer attempts
- mark confidence

Possible component names:

- `RehearsalStage`
- `QuestionCard`
- `AnswerRecorder`
- `RecommendedAnswerPanel`
- `RehearsalTimeline`

### Right: Readiness And Knowledge Panel

Responsibilities:

- show risk map
- show useful phrases
- save phrase bank entries
- show attempt history
- show readiness snapshot
- link to pronunciation assessment and notes

Possible component names:

- `ReadinessPanel`
- `RiskMapPanel`
- `PhraseBankPanel`
- `AttemptHistoryPanel`

## Domain Model

### MeetingMaterial

Represents a source artifact used to prepare a meeting.

Fields:

- `id`
- `userId`
- `projectId`
- `sourceType`
- `title`
- `rawText`
- `normalizedText`
- `sourceUrl`
- `sourceFileName`
- `language`
- `sensitivity`
- `createdAt`
- `updatedAt`

### DrillRun

Represents one generated rehearsal package.

Fields:

- `id`
- `userId`
- `materialId`
- `title`
- `status`
- `promptVersion`
- `modelProvider`
- `modelName`
- `summary`
- `timeline`
- `riskMap`
- `createdAt`
- `updatedAt`

### DrillQuestion

Represents one likely question.

Fields:

- `id`
- `runId`
- `orderIndex`
- `reviewerRole`
- `question`
- `questionIntent`
- `recommendedAnswer`
- `alternateAnswer`
- `followUpRisk`
- `difficulty`
- `tags`

### AnswerAttempt

Represents one user rehearsal attempt.

Fields:

- `id`
- `runId`
- `questionId`
- `recordingUrl`
- `transcript`
- `durationMs`
- `confidence`
- `readinessScore`
- `pronunciationAssessmentId`
- `createdAt`

### PhraseBankItem

Represents reusable professional phrasing.

Fields:

- `id`
- `userId`
- `projectId`
- `sourceRunId`
- `text`
- `category`
- `usageNote`
- `tags`
- `createdAt`

### AuditEvent

Represents sensitive operations.

Fields:

- `id`
- `userId`
- `entityType`
- `entityId`
- `action`
- `metadata`
- `createdAt`

## API Design

### `POST /api/meeting-drill/materials`

Creates or updates a meeting material.

Input:

- source type
- title
- text
- optional source URL or filename
- sensitivity

Output:

- material record

### `POST /api/meeting-drill/generate`

Generates a drill run from a material.

Input:

- material ID
- meeting type
- target role
- optional focus areas
- optional difficulty

Output:

- drill run
- questions
- phrases
- risk map

### `GET /api/meeting-drill/runs`

Lists recent drill runs for the current user.

### `GET /api/meeting-drill/runs/[runId]`

Returns one drill run with questions and attempts.

### `POST /api/meeting-drill/attempts`

Saves an answer attempt and optional assessment link.

### `POST /api/meeting-drill/phrase-bank`

Saves a phrase bank entry.

## AI Output Contract

The generated drill should validate against a Zod schema equivalent to:

```ts
type GeneratedMeetingDrill = {
  summary: {
    meetingContext: string;
    openingSummary: string;
    keyRisks: string[];
    assumptions: string[];
  };
  questions: Array<{
    reviewerRole: "code_reviewer" | "architect" | "pm" | "sre" | "security" | "tech_lead";
    question: string;
    intent: string;
    recommendedAnswer: string;
    alternateAnswer?: string;
    followUpRisk: string;
    difficulty: "warmup" | "standard" | "challenge";
    tags: string[];
  }>;
  timeline: Array<{
    minuteStart: number;
    minuteEnd: number;
    activity: string;
    instruction: string;
  }>;
  phraseBank: Array<{
    text: string;
    category: "opening" | "tradeoff" | "risk" | "uncertainty" | "next_step" | "clarification";
    usageNote: string;
  }>;
};
```

Validation rules:

- exactly 10 primary questions
- at least one challenge question
- timeline must cover 15 minutes
- answers must be concise enough to speak aloud
- no empty strings
- no raw prompt leakage

## Persistence Strategy

### Supabase

Add migrations for:

- `projects`
- `meeting_materials`
- `drill_runs`
- `drill_questions`
- `answer_attempts`
- `phrase_bank_items`
- `audit_events`

Add RLS policies:

- users can only read, insert, update, and delete their own records
- child records are accessible only through owned parent records
- audit events are append-only from server-side operations

### Local Fallback

Extend local persistence with a new store file or a typed section:

- prefer a separate `meeting-drill-store.json` to avoid overloading the existing session store
- keep immutable writes
- preserve current `.shadowing-data` convention unless desktop-specific storage is later centralized

## Security And Privacy

Sensitive materials may contain proprietary code, architecture decisions, or incident details.

Required rules:

- Do not log raw material text in API handlers.
- Validate request size and content type.
- Reject unsupported source types.
- Keep provider calls server-side.
- Store model/provider metadata without leaking secrets.
- Support deletion of material and dependent drill runs.
- Add audit events for generation, export, delete, and assessment save.
- Use explicit privacy copy in the material panel.

## Testing Strategy

### Unit Tests

Add tests for:

- meeting material normalization
- generated drill schema validation
- timeline validation
- question count and difficulty validation
- repository local fallback
- prompt payload construction without raw logging

### API Tests

Add tests for:

- auth required
- invalid material input
- invalid generated output handling
- successful generate flow with mocked AI provider
- forbidden access to another user's run

### Component Tests

Add tests for:

- material input and generation button states
- generated question rendering
- rehearsal timer flow
- recommended answer reveal
- confidence marking
- phrase saving
- empty and failed generation states

### E2E Or Smoke Tests

Add one smoke path:

- open workspace
- paste material
- generate mocked drill
- answer or mark one question
- see readiness panel update

## Implementation Phases

### Phase 1: Product Surface And Domain Foundation

Actions:

- Update home and navigation copy to technical meeting rehearsal.
- Introduce meeting-drill domain types and schemas.
- Add repository interfaces and local fallback.
- Add Supabase migration with RLS.
- Add API route scaffolding.

Done when:

- product identity is no longer generic shadowing
- domain model exists with tests
- persistence layer is covered

### Phase 2: Generation Engine

Actions:

- Add server-side generation service.
- Add AI prompt builder and response parser.
- Validate model output with Zod.
- Save generated run, questions, risk map, timeline, and phrases.
- Add failure states and retry-safe behavior.

Done when:

- a mocked provider can generate and persist a valid drill run
- invalid output fails clearly without corrupting state

### Phase 3: Rehearsal Workspace

Actions:

- Replace the current generic source panel with material-oriented input.
- Add rehearsal stage.
- Add readiness and phrase panels.
- Keep existing playback and recording capabilities where useful.
- Keep old reader behavior only where it supports the rehearsal flow.

Done when:

- a user can move from material to 10-question rehearsal in the UI
- core interactions are component-tested

### Phase 4: Recording And Assessment Integration

Actions:

- Connect answer attempts to the existing recording flow.
- Link pronunciation assessment to answer attempts.
- Add readiness score model.
- Add attempt history and weak-point review.

Done when:

- a recorded answer attempt can be saved and reviewed
- pronunciation feedback can be tied to a question

### Phase 5: Knowledge Layer And Enterprise Polish

Actions:

- Add phrase bank persistence and UI.
- Add saved answer patterns.
- Add drill history and material history.
- Add export paths with audit events.
- Add loading, empty, and error polish.

Done when:

- repeated use creates durable professional preparation assets
- sensitive operations are auditable

### Phase 6: Full Verification And Product Cleanup

Actions:

- Run lint, tests, and build.
- Run a workspace smoke test.
- Decide which legacy routes remain visible.
- Update README and user-facing product wording.

Done when:

- the product can be evaluated as a coherent technical meeting rehearsal platform

## Risks And Mitigations

### Risk: Scope becomes too broad

Mitigation:

- Build around the single primary workflow: material to 15-minute Q&A rehearsal.
- Let all other capabilities serve that workflow.

### Risk: AI output is inconsistent

Mitigation:

- Use strict schemas.
- Save validation errors.
- Keep provider calls behind a service layer.
- Add fixtures and mocked provider tests.

### Risk: Existing shadowing code becomes a drag

Mitigation:

- Reuse only the valuable engines: audio, recording, assessment, word and sentence saving.
- Move new product logic into `meeting-drill` instead of bending old `sessions` further.

### Risk: Sensitive technical material leaks

Mitigation:

- Keep AI generation server-side.
- Avoid raw text logs.
- Add RLS and ownership checks.
- Add audit events.
- Make local-first storage mode explicit on desktop.

### Risk: Workspace becomes another large component

Mitigation:

- Use small components and feature hooks.
- Keep material, rehearsal, readiness, and knowledge concerns separate.
- Put derived state in pure helpers.

## Acceptance Criteria

- The product surface clearly targets technical meeting rehearsal for engineers.
- `/workspace` becomes the main rehearsal workspace.
- Meeting material, drill run, question, attempt, and phrase bank models exist.
- AI generation produces validated 10-question drill packages.
- Rehearsal UI supports the 15-minute flow.
- Recording and assessment are integrated into answer attempts.
- Sensitive materials have ownership, validation, and audit boundaries.
- Tests cover schemas, repositories, APIs, and the primary UI flow.
- `npm run lint`, `npm run test`, and `npm run build` pass before completion is claimed.

## Review Notes

- This design intentionally exceeds a minimal MVP.
- The goal is not a landing-page repositioning; it is a domain pivot.
- The existing product should be refactored into this shape incrementally so useful capabilities are preserved.
- The subagent spec-review loop was not run because this session has not explicitly requested delegated agent work.
- The workspace root currently has no normal committed history, so this design is written as a durable doc without assuming commit availability.
