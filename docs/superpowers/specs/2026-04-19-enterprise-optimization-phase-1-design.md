# Enterprise Optimization Phase 1 Design

- Date: 2026-04-19
- Project: `english-shadowing-web`
- Status: Approved in chat, written to file

## Summary

This design defines the first phase of enterprise-level optimization for `english-shadowing-web`.

The phase does **not** change product scope or user-facing functionality. Its purpose is to convert several MVP-era "god components" and mixed-responsibility hooks into a maintainable architecture with clearer module boundaries, safer refactoring surfaces, and better regression protection.

The approved strategy is:

- optimize in phases instead of rewriting everything at once
- start with `architecture and module-boundary governance`
- preserve all existing functionality
- keep behavior equivalent while restructuring internals
- add regression guards before and during refactoring

This phase establishes the structural foundation required for later phases:

1. quality-system governance
2. local-first state and storage governance
3. performance and loading optimization

## Product Decisions Confirmed In Chat

The user approved the following decisions:

- the project needs `enterprise-level optimization`
- optimization should happen `one area at a time`
- all four directions matter:
  - architecture and module boundaries
  - quality and verification systems
  - local-first state and storage consistency
  - performance and loading behavior
- the first phase should prioritize `architecture and module-boundary governance`
- `functionality must not be reduced`

## Goals

- Preserve all existing functionality while improving internal structure.
- Reduce maintenance risk in the most complex desktop and workbench modules.
- Separate UI composition, workflow orchestration, platform integration, and storage access into clearer layers.
- Turn current high-risk large files into smaller, focused modules with explicit responsibilities.
- Create enough regression protection that later refactors can proceed safely.
- Prepare the codebase for later enterprise-grade improvements without forcing a broad rewrite.

## Non-Goals

- Do not add new product features in this phase.
- Do not redesign user flows or change existing interaction semantics.
- Do not change storage ownership rules yet unless a structural seam is required for this phase.
- Do not perform broad styling or visual redesign unrelated to structural cleanup.
- Do not attempt a one-pass rewrite of notes, workspace, or AI dock.
- Do not reduce functionality under the excuse of refactoring.

## Hard Invariants

The following are mandatory for this phase.

### 1. Zero Feature Loss

Everything that currently works must remain available after the refactor.

This includes:

- workspace preparation and playback flows
- resume and recovery flows
- recent sessions and templates
- notes open, create, rename, delete, autosave, search, outline, backlinks, learning, and terminal flows
- AI dock provider, prompts, and history flows
- desktop runtime and fallback behavior
- export, notification, and desktop bridge integrations

### 2. Behavior Equivalence First

Internal implementation may change, but the following must remain equivalent:

- route entry points
- visible controls
- action semantics
- fallback behavior
- restore and resume behavior
- platform-specific behavior splits

### 3. Facade Preservation

Existing top-level entry files should stay in place during this phase. They may become thin facades, but they should not disappear immediately.

This reduces migration shock and limits the blast radius of import-path changes.

### 4. Small, Stable Refactor Slices

Each refactor step must end in a stable state with passing verification. No phase should leave the product in a half-structured, partially broken condition.

### 5. Evidence Before Claims

Functionality preservation must be verified with tests and fresh command output, not assumed from reading code.

## Why This Phase Is Needed Now

The current project already has a real product surface and multiple prior desktop/local-first iterations. The problem is not lack of functionality. The problem is that several core areas still carry MVP-style structural debt.

Current hotspots include:

- `src/components/workspace/workspace-shell.tsx`
- `src/components/notes-v2/notes-workbench.tsx`
- `src/components/notes-v2/use-notes-workbench.ts`
- `src/components/ai-dock/ai-dock-shell.tsx`

At the time of design review, these files are approximately:

- `workspace-shell.tsx`: 857 lines
- `notes-workbench.tsx`: 548 lines
- `use-notes-workbench.ts`: 800 lines
- `ai-dock-shell.tsx`: 537 lines

The risk pattern is consistent:

- UI components also orchestrate workflows
- UI code reaches into platform and storage concerns directly
- hook modules combine runtime selection, derived state, autosave, CRUD, and command construction
- changing one concern often requires opening and reasoning about many unrelated concerns in the same file

This is normal for MVP growth, but it is not a good long-term operating model.

## Chosen Architectural Direction

The approved architectural rule for this phase is:

`page or container -> facade hook -> feature/runtime orchestration -> platform adapter or repository`

This means:

- display components should render and delegate
- orchestration should live in feature-layer hooks and helpers
- platform-specific capabilities should remain behind adapters
- storage and repository details should not leak through large UI containers

The target is not a textbook "clean architecture" rewrite. The target is a practical boundary cleanup that fits the current codebase and can be executed incrementally.

## Scope

This phase covers four related refactor slices.

### Slice A: Workspace Shell

Refactor:

- `src/components/workspace/workspace-shell.tsx`

Primary issues:

- playback hydration and recovery logic mixed with layout rendering
- local library and export logic mixed with UI composition
- resize logic mixed with business orchestration
- desktop bridge, notifications, and export behaviors mixed directly into the same large component

### Slice B: Notes Workbench Hook

Refactor:

- `src/components/notes-v2/use-notes-workbench.ts`

Primary issues:

- runtime detection and vault client selection mixed with workbench state
- autosave, live document derivation, backlinks, CRUD, desktop commands, command palette, and sidebar state all in one hook
- difficult to change any one notes behavior without reading the entire file

### Slice C: Notes Workbench View Composition

Refactor:

- `src/components/notes-v2/notes-workbench.tsx`

Primary issues:

- header, sidebars, center pane wiring, toolbar actions, and command palette wiring all composed in one large component
- too much JSX and layout decision-making in one file

### Slice D: AI Dock Shell

Refactor:

- `src/components/ai-dock/ai-dock-shell.tsx`

Primary issues:

- reveal and hide behavior
- resize behavior
- bridge layout sync
- prompt-library actions
- history actions
- provider host rendering

All exist in one component with a large local state surface.

## Module Blueprint

### A. Workspace Refactor Blueprint

Create a new feature layer:

- `src/features/workspace/`

Recommended modules:

- `use-workspace-session-runtime.ts`
  - recent sessions
  - template loading
  - playback loading
  - resume session handling
  - recent session deletion

- `use-workspace-library-runtime.ts`
  - wordbook
  - sentencebook
  - note counts
  - export flows
  - library dialog state helpers where appropriate

- `use-workspace-reference-audio.ts`
  - own-voice recording selection
  - reference audio URL lifecycle
  - reference playback state

- `use-workspace-layout.ts`
  - board width
  - left panel width
  - pointer drag resizing
  - keyboard resizing

- `workspace-shell.types.ts`
  - response payloads
  - local shell-specific DTOs
  - shared phase-one types

- `workspace-shell.view-model.ts`
  - non-trivial derived values currently built inline in the container

Expected end state:

- `workspace-shell.tsx` becomes a thin composition container
- orchestration logic moves into dedicated feature hooks
- future performance or storage work can target smaller modules without reopening the whole shell

### B. Notes Hook Refactor Blueprint

Create a new notes workbench feature layer:

- `src/features/notes/workbench/`

Recommended modules:

- `use-notes-runtime.ts`
  - runtime detection
  - desktop bridge resolution
  - vault client selection
  - vault store initialization

- `use-notes-documents.ts`
  - snapshot refresh
  - live document drafts
  - dirty paths
  - autosave
  - derived backlinks refresh

- `use-notes-actions.ts`
  - create
  - rename
  - delete
  - open and close
  - pick directory
  - desktop command execution

- `use-notes-sidebar-state.ts`
  - left and right sidebars
  - search query
  - learning query
  - view mode
  - active editor line

- `build-notes-command-palette.ts`
  - pure command item construction from state and handlers

- `notes-workbench.facade.ts`
  - compatibility-oriented aggregator for the existing public hook contract

Expected end state:

- `use-notes-workbench.ts` remains as the public facade or compatibility layer
- the current giant hook becomes a coordinator instead of a god object
- testing can target smaller responsibilities directly

### C. Notes View Refactor Blueprint

Recommended new component slices under `src/components/notes-v2/`:

- `notes-workbench-header.tsx`
- `notes-workbench-left-sidebar.tsx`
- `notes-workbench-center.tsx`
- `notes-workbench-right-sidebar.tsx`
- optional focused toolbar/helper components where needed

Expected end state:

- `notes-workbench.tsx` becomes layout composition plus prop wiring
- feature logic stays out of presentational component files
- notes UI can be changed in smaller, safer pieces

### D. AI Dock Refactor Blueprint

Continue using `src/features/ai-dock/` and expand it with runtime-oriented hooks.

Recommended modules:

- `use-ai-dock-visibility.ts`
  - reveal and hide
  - focus lock
  - reveal-zone timing

- `use-ai-dock-layout-sync.ts`
  - width logic
  - resizing logic
  - layout reservation
  - bridge sync layout calls

- `use-ai-dock-prompts.ts`
  - prompt loading
  - prompt query
  - favorite toggle
  - import and export flows

- `use-ai-dock-history.ts`
  - history loading
  - history query
  - capture current conversation
  - favorite toggle
  - history export

- `ai-dock-header.tsx`
- `ai-dock-provider-surface.tsx`

Expected end state:

- `ai-dock-shell.tsx` becomes mostly structural
- data-fetching and action logic become independently maintainable

## Data Flow Rules For This Phase

The following data-flow rules are approved.

### Rule 1

Presentation components may receive state and callbacks, but they should not decide storage ownership.

### Rule 2

Feature hooks may orchestrate multiple actions, but platform-specific details should be isolated behind clear helpers or services.

### Rule 3

Fallback behavior must remain explicit. Desktop, browser, and native branches may still exist, but branch selection should happen in fewer places.

### Rule 4

Derived state should be moved out of large JSX containers when it is reused or semantically meaningful.

## Error Handling Strategy

This phase does not fully redesign the app's error system, but it does establish a consistent error-handling boundary model.

### 1. User-Recoverable Errors

Examples:

- save failure
- delete failure
- export failure
- refresh failure

Rules:

- keep the user in the current workspace
- degrade only the failed action
- show clear user-level feedback

### 2. Workspace-Level Degradation

Examples:

- recent sessions unavailable
- prompt library unavailable
- chat history unavailable
- desktop command list unavailable

Rules:

- the workspace still opens
- only the affected panel degrades
- empty or disabled states are acceptable

### 3. Platform Capability Missing

Examples:

- no desktop bridge
- no export service
- no notification support

Rules:

- use fallback behavior where it already exists
- fallback selection should be concentrated in adapter or feature layers
- presentational components should not own fallback policy

### 4. Structural or Programming Errors

Examples:

- impossible state combinations
- broken assumptions in derived data
- missed branch handling during refactor

Rules:

- avoid silent swallowing
- keep developer visibility high
- do not leak internal implementation details directly to end users

## Regression Protection Strategy

The phase will use `characterization-style protection` before and during refactor.

This means:

- test the behavior that already exists
- refactor behind those checks
- confirm that the same user-visible contract still holds

### Workspace Functional Contract

Must remain true:

- recent sessions still load
- templates still load
- prepared playback still hydrates into the reading and playback experience
- `resumeSessionId` still restores a session
- recent sessions can still be deleted
- own-voice reference behavior still works
- library actions still work
- settings and layout controls still work

### Notes Functional Contract

Must remain true:

- notes still open correctly
- note creation still works
- note rename still works
- note deletion still works
- autosave still works
- command palette still triggers key actions
- search, backlinks, outline, learning, and terminal flows still exist
- `resumeNoteId` behavior still works
- runtime-specific vault client selection still works

### AI Dock Functional Contract

Must remain true:

- reveal and hide behavior still works
- resize behavior still works
- provider, prompts, and history views still switch correctly
- prompt query and favorite actions still work
- prompt import and export still work
- history query, favorite, capture, and export still work
- provider-host bridge layout sync still works

## Implementation Phases

This phase is intentionally broken into stable sub-phases.

### Phase 1: Workspace Shell Slimming

Primary target:

- `src/components/workspace/workspace-shell.tsx`

Actions:

- create the workspace feature runtime hooks
- move orchestration logic out of the component
- preserve the current public container behavior

Done when:

- `workspace-shell.tsx` is materially smaller
- session, library, reference audio, and layout concerns are split
- workspace regression checks stay green

### Phase 2: Notes Facade Hook Refactor

Primary target:

- `src/components/notes-v2/use-notes-workbench.ts`

Actions:

- create `src/features/notes/workbench/`
- split runtime, documents, actions, sidebar state, and command-palette building
- keep a compatibility-oriented facade

Done when:

- the current god-hook shape is broken into focused modules
- the public notes workbench contract still works
- notes flow tests stay green

### Phase 3: Notes View Composition Split

Primary target:

- `src/components/notes-v2/notes-workbench.tsx`

Actions:

- split header, left sidebar, center stack, and right sidebar structure
- keep the visible notes workbench behavior unchanged

Done when:

- `notes-workbench.tsx` is primarily a composition file
- presentational slices are easier to test and reason about

### Phase 4: AI Dock Runtime and Content Split

Primary target:

- `src/components/ai-dock/ai-dock-shell.tsx`

Actions:

- extract visibility, layout, prompts, and history logic
- retain current provider host behavior and bridge sync behavior

Done when:

- `ai-dock-shell.tsx` is mostly structural
- prompt and history behaviors are split into dedicated feature hooks

### Phase 5: Phase-One Consolidation

Actions:

- remove obvious duplication introduced during extraction
- normalize exports and internal type usage
- confirm all facade boundaries are stable
- run the full first-phase verification set

Done when:

- the new structure is internally consistent
- the first-phase acceptance criteria are satisfied

## Verification Plan

Each sub-phase must end with fresh verification evidence.

### Per-Phase Minimum

- targeted tests for the changed area
- lint on touched files or affected surface

### Phase-One Completion Verification

- `npm run lint`
- `npm run test`
- `npm run build`
- targeted Playwright smoke only if the refactor changes a critical user journey that unit or component tests do not cover safely

## Risks And Mitigations

### Risk: Refactor accidentally removes fallback behavior

Mitigation:

- explicitly list desktop, browser, and native branches before extraction
- preserve fallback logic behind adapters or feature hooks

### Risk: Public contracts drift while internals are being split

Mitigation:

- keep facade entry files
- add characterization checks before large moves

### Risk: Notes workbench refactor becomes too broad

Mitigation:

- split hook refactor and view refactor into separate phases
- do not combine state-layer and view-layer extraction in one pass

### Risk: AI dock structural changes break bridge sync

Mitigation:

- keep layout-sync behavior in a dedicated hook
- preserve explicit sync calls and provider-host measurement paths

### Risk: Workspace refactor mixes structural cleanup with behavior cleanup

Mitigation:

- phase one must prefer behavior equivalence
- defer behavior redesign or performance tuning to later phases

## Acceptance Criteria

This first enterprise-optimization phase is complete when:

1. `workspace-shell.tsx`, `notes-workbench.tsx`, `use-notes-workbench.ts`, and `ai-dock-shell.tsx` have each been materially slimmed or structurally decomposed
2. UI composition, workflow orchestration, platform integration, and storage concerns are more clearly separated
3. existing user-facing functionality is preserved
4. characterization or regression coverage exists for the core flows touched by the refactor
5. the phase completes with fresh green verification for lint, tests, and build

## Review Notes

- This design intentionally scopes phase one to structural enterprise optimization only.
- Later phases for quality governance, state and storage governance, and performance governance are explicitly deferred.
- The usual subagent spec-review loop was not used here because this session does not include explicit user permission for delegated subagent work.
- The workspace git history is not in a normal committed state, so this design file was written to the repository documentation area without attempting a commit.
