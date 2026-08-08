# Local-First Desktop App Design

- Date: 2026-03-25
- Project: `english-shadowing-web`
- Status: Approved in chat, written to file

## Summary

Convert the current product from a web-first Electron shell into a local-first desktop application. The desktop app becomes the primary product surface. Web delivery may still exist later, but it is no longer the architectural center.

The chosen product shape is:

- unified desktop home
- dashboard-style default landing screen
- local-first notes, training, and assessment workspaces
- local data loaded first on startup
- login deferred until cloud-enhanced features are needed
- core offline workflows remain usable without network connectivity

The chosen cloud boundary is:

- local core features must work offline
- cloud services enhance the product instead of gating local usage
- membership continues to matter, but it should only control network-backed capabilities and optional sync

## Product Decisions Confirmed In Chat

The user approved the following product decisions:

- the product should become a `fully local-first app`
- architecture target is `local-first + cloud capability optional`
- default app entry is a `unified desktop home`
- the home should be a `dashboard`
- startup should read `local data first`
- offline mode must preserve:
  - notes
  - local file access
  - local search
  - recording
  - training history
  - assessment history viewing
- first launch should be `usable before login`

## Goals

- Make the desktop app the primary product form.
- Preserve the current training, notes, and assessment value while reorganizing them into a coherent local app.
- Establish a durable local data architecture instead of relying on browser-centric persistence.
- Keep local notes as real filesystem-owned content.
- Keep the app useful before login and while offline.
- Let cloud services add value without becoming a hard runtime dependency for local workflows.
- Maintain a path for membership, sync, online assessment, and online TTS without breaking local-first behavior.

## Non-Goals

- Do not keep treating Electron as only a wrapper around route-based web pages.
- Do not require login before local usage.
- Do not move notes into a cloud-owned source of truth.
- Do not make online assessment or TTS mandatory for the app to feel complete.
- Do not rewrite every business feature at once if an adapter or local service boundary is sufficient.

## Recommended Architecture

### Chosen Architecture

Use `Electron + React` with desktop-owned runtime boundaries and local-first service ownership.

The app should be organized into five layers:

1. `Desktop Shell`
2. `App Runtime`
3. `Local Data Layer`
4. `Domain Services`
5. `Cloud Connectors`

### 1. Desktop Shell

Responsibilities:

- native window lifecycle
- native menu
- shortcuts
- file dialogs
- notifications
- downloads directory
- update entry
- crash/log capture

This layer owns desktop affordances only. It should not contain business-specific state transitions.

### 2. App Runtime

Responsibilities:

- unified desktop home
- workspace switching
- local app navigation state
- window/session restoration
- panel orchestration

This is the user-facing application shell. Notes, training, and assessment become workspaces inside one desktop app instead of feeling like unrelated web pages.

### 3. Local Data Layer

Responsibilities:

- SQLite for structured local state
- filesystem vault for markdown and local assets
- recording directory ownership
- search indexing
- file watching
- session restoration metadata

This layer must be local-first and must load before optional network data.

### 4. Domain Services

Responsibilities:

- notes service
- training service
- assessment service
- auth and entitlement service
- search service
- session recovery service

This layer defines business rules and contracts. UI should consume domain services instead of composing raw storage calls directly.

### 5. Cloud Connectors

Responsibilities:

- membership lookup
- online assessment
- TTS or training generation
- optional sync
- remote resources

Cloud connectors must be additive. They may fail or be unavailable without making the desktop app unusable.

## State Ownership

### Filesystem-Owned Content

The following should remain readable, portable local files:

- markdown notes
- note attachments
- exported assets
- local audio recordings where appropriate

### SQLite-Owned Structured State

The following should move into SQLite-backed local state:

- current workspace
- dashboard cards and recents metadata
- session restore state
- training history
- assessment history
- wordbook and sentencebook records if kept locally
- membership cache metadata
- sync metadata
- local settings and preferences

### Search Index-Owned Data

The following should be indexed for local search:

- note titles
- note bodies
- note paths
- recent training text
- assessment summaries

### Cloud-Owned Data

The following remain cloud-backed when available:

- online assessment execution
- online TTS and generated training media
- optional sync payloads
- account profile
- entitlements source of truth

The renderer should consume these through service boundaries, not directly through ad hoc fetch patterns.

## Product Surface

### Default Entry

The app starts at a `unified desktop home`.

This home should not be a blank launcher. It should be a dashboard that reflects local activity and current work.

### Dashboard Sections

The desktop home should include:

1. `Continue Working`
- last opened note
- last training session
- last assessment record
- quick resume entry points

2. `Today Overview`
- recent training count
- assessment trend snapshots
- recently edited notes
- unfinished work markers

3. `Core Entrypoints`
- notes
- training
- assessment
- recent files or recent projects

4. `Local Status`
- current vault
- offline or online state
- sync state
- membership state
- local storage footprint

### Workspaces

The app contains three primary workspaces:

- `Notes Workspace`
- `Training Workspace`
- `Assessment Workspace`

These are not separate products. They are coordinated modes inside the same desktop app.

## Workspace Definitions

### Notes Workspace

The notes workspace is the long-lived knowledge center.

Recommended layout:

- left file tree
- center editor and tabs
- right context and helper panels
- top command bar
- bottom status area

Core capabilities:

- local vault
- markdown editing
- tabs
- recent files
- local search
- filesystem watching
- wordbook and sentencebook insertion
- session restore

### Training Workspace

The training workspace is the execution center.

Core capabilities:

- local or imported text input
- training preparation
- playback
- local recording
- local history
- ability to originate from note content

### Assessment Workspace

The assessment workspace is the feedback center.

Core capabilities:

- reference text
- audio upload or local recording
- result history
- result review
- ability to write useful output back into notes or training context

### Cross-Workspace Flows

The app must support:

- starting training from notes
- saving training artifacts into notes
- writing assessment feedback back into notes
- resuming any unfinished task from the dashboard

## Offline Boundary

The approved offline boundary is:

### Must Work Offline

- desktop home
- notes
- local vault operations
- local search
- recording
- training history
- assessment history viewing
- session restore
- settings

### May Degrade Offline

- online assessment
- TTS or generated media
- sync
- remote template refresh
- membership refresh

### Offline UX Rule

When cloud functions are unavailable:

- local UI remains usable
- network-backed actions are disabled or downgraded clearly
- existing local data remains accessible
- users are not blocked from entering the app

## Login And Membership

### First-Launch Behavior

The app should follow `use first, log in later`.

This means:

- no login wall on first launch
- local notes and local training are available before login
- online enhancement actions may request login when needed

### Membership Behavior

Membership should remain meaningful, but it should not block local ownership.

Recommended rule:

- local capabilities are not membership-gated
- cloud enhancement capabilities are membership-aware
- entitlement state is cached locally with timestamp metadata
- temporary offline grace is allowed for previously valid entitlements

### Membership Cache

Local membership cache should store:

- last known user identity
- entitlement state
- last successful validation time
- effective expiry or grace metadata

This allows predictable offline behavior without redefining the cloud source of truth.

## Technical Direction For Existing Code

### Current State

The current project already contains:

- Electron shell pieces
- Next.js route surfaces
- notes abstractions
- workspace and assessment components
- local storage based behavior in multiple places

### Required Direction

The project should evolve away from:

- route-first app transitions
- browser-owned persistence as primary state
- UI code directly composing persistence policies

And toward:

- desktop app runtime ownership
- service-driven business logic
- local database plus filesystem ownership
- explicit online versus offline boundaries

## Error Handling

### Desktop Failures

The shell must surface:

- missing vault
- unreadable files
- recorder failures
- local database failures
- search index failures
- update check failures

### Cloud Failures

Cloud failures should not destroy local workflows.

Rules:

- show user-readable status
- keep workspace state intact
- degrade the cloud feature only
- preserve local data ownership

## Risks

### Risk: Web-first assumptions remain hidden in the app runtime

Mitigation:

- replace route-centric transitions with app-runtime workspace transitions
- move persistence policies out of UI components

### Risk: Local data and cloud data ownership become mixed

Mitigation:

- make ownership explicit by storage type
- define service boundaries before large refactors

### Risk: Notes and assessment continue to depend on browser persistence

Mitigation:

- migrate browser-owned state into SQLite or filesystem metadata in phases

### Risk: Membership logic reintroduces login-first behavior

Mitigation:

- treat membership as enhancement gating, not local access gating

### Risk: Scope becomes too large to execute safely in one pass

Mitigation:

- implement by milestones
- complete M1 and M2 before attempting full cloud reattachment

## M2 Supplement: Runtime State SQLite Migration

- Date: 2026-03-26
- Scope: Approved as the first M2 slice
- Status: Approved in chat, added as a design supplement

### Why This Slice Comes First

The first M2 slice should move only desktop runtime state into SQLite. This is the smallest meaningful cut that proves the local data layer can become authoritative without destabilizing notes, training, or assessment workflows.

This slice intentionally excludes:

- training history
- assessment history
- notes content storage
- membership cache

Those follow the same architecture later, but they should not be mixed into the first migration.

### Chosen Ownership Model

The user approved the recommended model:

- SQLite is owned exclusively by the Electron main process
- renderer code may not connect to SQLite directly
- preload exposes a minimal desktop bridge
- React consumes runtime-state operations through that bridge

This model keeps desktop storage boundaries explicit and prepares the codebase for future expansion to history, settings, and recovery data without turning renderer code into a database client.

### M2 Scope

The approved runtime-state slice includes:

- `lastWorkspace`
- `lastVisitedAt`
- desktop home resume state
- Electron `lastRoute`
- Electron `windowBounds`

These become part of one runtime-state store instead of being split across renderer localStorage and Electron JSON config.

### Data Model

The first SQLite table should be small and purpose-built:

- `id`
- `last_workspace`
- `last_route`
- `last_visited_at`
- `window_x`
- `window_y`
- `window_width`
- `window_height`
- `updated_at`
- `legacy_runtime_migrated_at`

Only one logical record is needed for this slice. The table exists to hold desktop runtime state, not general user content.

### Module Boundaries

The M2 runtime-state stack should be:

1. `SQLite Repository`
- main-process only
- schema initialization
- load and save runtime-state rows

2. `Desktop Runtime Service`
- default-value handling
- merge and validation rules
- legacy migration handling

3. `Electron Bridge`
- preload methods only for runtime-state operations
- renderer never sees raw SQL or file paths

4. `Renderer Runtime Client`
- requests runtime state from the bridge
- writes workspace changes through the bridge
- falls back safely only when the desktop bridge is absent

### Migration Strategy

SQLite becomes the only formal source of truth for runtime state.

Approved migration behavior:

1. On startup, renderer asks the bridge for runtime state.
2. If SQLite already has runtime state, renderer uses it immediately.
3. If runtime-state migration has not happened yet, renderer may send legacy localStorage values one time through the bridge.
4. Main process merges the legacy values into SQLite and marks migration complete.
5. After that point, renderer should stop treating localStorage as authoritative runtime state.

This avoids long-term dual-write complexity while still preserving existing M1 state during upgrade.

### Failure And Fallback Rules

Approved fallback behavior:

- if SQLite initialization fails, the app still opens with safe default runtime state
- if runtime-state reads fail, renderer receives defaults instead of a hard failure
- if writes fail, current UI flow continues and the failure is logged locally
- if legacy import fails, the app falls back to defaults and does not loop forever on migration attempts

The desktop app must remain usable even when the local database layer is temporarily unhealthy.

### Testing Strategy

The approved M2 test strategy is:

1. repository and service unit tests
- schema initialization
- default-state reads
- runtime-state writes
- legacy migration behavior
- safe fallback on read or write failure

2. bridge and renderer integration tests
- renderer gets runtime state through the desktop bridge
- workspace changes write through the bridge
- renderer state survives with localStorage cleared after migration

3. end-to-end tests
- home resume entry comes from SQLite-backed state
- desktop restart restores runtime state
- window bounds persistence survives restart
- legacy localStorage can be migrated once and then ignored

### Acceptance Criteria

This M2 slice is complete when:

1. renderer no longer uses localStorage as the primary desktop runtime-state source
2. desktop home resume behavior comes from SQLite-backed runtime state
3. Electron persists `lastRoute` and `windowBounds` in SQLite
4. desktop runtime-state restore still works when browser localStorage is empty

## M2 Supplement: Local Training History And Assessment History

- Date: 2026-03-26
- Scope: Approved as the second M2 slice
- Status: Approved in chat, added as a design supplement

### Why This Slice Comes Next

The second M2 slice should move desktop training history and pronunciation-assessment history into a main-process-owned local data layer. This is the first slice that creates meaningful offline differentiation for the desktop app because users can reopen prepared training sessions and keep assessment history without depending on browser storage.

This slice intentionally does not migrate:

- notes content storage
- voice recordings storage backend
- wordbook and sentencebook storage
- cloud sync

Those remain separate migrations so this slice can stay focused on offline training recovery and assessment history continuity.

### Chosen Ownership Model

The user approved the recommended model:

- Electron main owns the local training-history and assessment-history repository
- renderer talks to that repository only through preload bridge methods
- prepared training audio stays in local files
- SQLite stores structured metadata, timestamps, and recovery indexes

This keeps large binary assets out of SQLite while making recent sessions, playback reconstruction, and assessment history deterministic.

### M2 Scope

The approved second M2 slice includes:

- local training-session history for desktop mode
- offline reopening of prepared desktop training sessions
- local indexing of prepared training audio assets
- migration of pronunciation-assessment history out of browser localStorage
- SQLite-backed recent training sessions and assessment lists for the desktop renderer

### Data Model

This slice introduces two groups of records.

Training history tables:

- `training_sessions`
- `training_sentences`
- `training_word_tokens`
- `training_audio_assets`

Assessment history tables:

- `assessment_records`
- `assessment_word_items`

The session tables hold metadata, sentence timing, and token timing. The audio-assets table maps sessions to local file paths. The assessment tables hold full scoring summaries and word-level details.

### Module Boundaries

The M2 second-batch stack should be:

1. `Local History Repository`
- main-process SQLite repository
- schema initialization
- training-session persistence
- assessment persistence
- one-time legacy assessment import
- local audio-asset file indexing

2. `Desktop History Services`
- training-history service for recent lists, playback reconstruction, and deletion
- assessment-history service for listing, saving, and migrating records

3. `Electron Bridge`
- preload methods for `trainingHistory` and `assessmentHistory`
- renderer never receives raw database access

4. `Renderer Adapters`
- desktop workspace prefers bridge-backed recent history and bridge-backed playback recovery
- desktop assessment shell prefers bridge-backed assessment history and uses localStorage only as one-time migration input

### Offline Recovery Rules

Approved offline recovery behavior:

1. Desktop recent training history reads from the local repository, not `/api/sessions`.
2. Reopening a prepared desktop session reconstructs playback from SQLite sentence and token data plus a local audio asset URL.
3. Only sessions with prepared local audio are guaranteed offline playback.
4. If a local audio asset is missing, the session record may remain visible, but playback should degrade for that session only.
5. Desktop assessment history always reads from the local repository after migration.

### Migration Strategy

Training history migration is forward-looking:

- newly prepared desktop sessions are written into the local repository
- this slice does not attempt a risky backfill of all remote historical sessions
- local recent-session UI should treat the local repository as authoritative in desktop mode

Assessment-history migration is one-time legacy import:

- if desktop assessment history has not been migrated yet, renderer may send parsed legacy assessment records from browser localStorage once
- main process imports those records into SQLite and marks migration complete
- localStorage stops being the authoritative source after that point

### Failure And Fallback Rules

Approved fallback behavior:

- if local history SQLite is unavailable, desktop workspace and assessment UI still open with safe empty states
- if prepared audio cannot be saved locally, current online playback can still work, but offline recovery is not guaranteed for that session
- if a local audio asset later goes missing, only that session should degrade
- if legacy assessment import fails, the app continues with an empty local assessment history instead of blocking the assessment workspace

### Testing Strategy

The approved second-batch test strategy is:

1. repository unit tests
- training-session persistence
- playback reconstruction
- audio-asset indexing
- session deletion
- assessment save and list
- one-time legacy assessment import

2. renderer integration tests
- desktop workspace prefers local recent history
- desktop workspace can reopen a bridge-backed local playback record
- desktop assessment shell reads history from the bridge
- desktop assessment shell survives localStorage clearing after migration

3. end-to-end tests
- desktop recent training sessions remain available after reload
- desktop training playback can reopen from local history without re-fetching the playback API
- desktop assessment history remains visible after reload

### Acceptance Criteria

This M2 second-batch slice is complete when:

1. desktop workspace recent history is driven by the main-process local repository
2. prepared desktop training sessions can be reopened offline from local history
3. prepared training audio is indexed as a local asset rather than assumed to stay remotely reachable
4. desktop assessment history is driven by SQLite instead of browser localStorage
5. legacy browser assessment history can be imported once and then ignored
6. clearing browser localStorage does not erase desktop training or assessment history

## M3 Supplement: Home Resume Hub And Offline Resume Flows

- Date: 2026-03-26
- Scope: Approved as the first M3 slice
- Status: Approved in chat, added as a design supplement

### Why This Slice Comes First

The first M3 slice should turn the desktop home into a real resume hub instead of a launcher. M2 already established local runtime state, local training history, and local assessment history. The next value step is to make that local data visible and actionable the moment the app opens.

This slice intentionally does not add:

- trend charts
- cloud-backed dashboard widgets
- sync status expansion
- new analytics tables

Those can come later. This slice is focused on restoring work, not decorating the home screen.

### Chosen Product Shape

The approved product shape is:

- desktop home shows a primary `continue working` action
- desktop home shows recent training, recent assessments, and recent notes
- clicking a home item restores the specific local object instead of only opening a page
- each workspace writes its active restore target back into desktop runtime state

This means home becomes the resume hub, while each workspace remains responsible for restoring its own content.

### Recovery Model

The approved recovery model contains two layers:

1. `Primary resume target`
- stored in desktop runtime state
- identifies the most recent meaningful work object
- used by the main hero card on desktop home

2. `Recent local lists`
- recent training sessions from local history
- recent assessments from local history
- recent notes from the local vault

The home screen uses both. The primary target powers the top-level resume action. The recent lists provide alternative quick-entry paths.

### Runtime-State Additions

Desktop runtime state should be extended with:

- `primaryResumeType`
- `primaryResumeId`

Approved values for `primaryResumeType`:

- `training`
- `assessment`
- `note`
- `null`

This state is owned by the Electron main-process SQLite runtime store, not browser localStorage.

### Resume Protocol

Approved restore links:

- `/workspace?resumeSessionId=...`
- `/assessment?resumeAssessmentId=...`
- `/notes?resumeNoteId=...`

The protocol is:

1. desktop home reads local lists plus runtime state
2. desktop home builds resume links
3. the destination workspace restores the specific local object
4. the destination workspace updates runtime state to make itself the new primary target

This keeps home simple and avoids duplicating workspace restore logic inside the dashboard.

### Workspace Responsibilities

The approved responsibilities are:

#### Training workspace

- restore local playback from `resumeSessionId`
- mark a loaded session as the active resume target

#### Assessment workspace

- expand the matching local record from `resumeAssessmentId`
- mark an expanded record as the active resume target

#### Notes workspace

- open the matching local note from `resumeNoteId`
- mark the selected note as the active resume target

### Home Data Sources

The first M3 slice should use existing local data sources:

- desktop runtime state for the primary target
- local training-history repository for recent training
- local assessment-history repository for recent assessments
- notes storage for recent notes

This slice does not require a separate dedicated home database table.

### Offline Boundary

The approved offline boundary for this slice is:

- home resume UI must work offline
- recent training list must work offline
- recent assessment list must work offline
- recent notes list must work offline
- restoring a prepared training session must work offline when the local audio asset exists
- restoring an assessment is history-only, not re-running cloud scoring
- restoring a note must work from the local vault

If a specific local asset is missing, only that restore action should degrade.

### Failure And Fallback Rules

Approved fallback behavior:

- if runtime state lacks a primary target, home falls back to the last workspace action
- if a recent training record exists but local playback is incomplete, home still opens training workspace with a degraded resume path
- if a resume note id no longer exists, notes workspace falls back to its normal first-page selection
- if a resume assessment id no longer exists, assessment workspace still opens normally

### Testing Strategy

The approved M3 first-batch test strategy is:

1. runtime-state unit tests
- normalize and persist primary resume target
- preserve legacy migration behavior

2. component tests
- desktop home renders recent local cards and primary resume links
- workspace restores local playback from `resumeSessionId`
- assessment expands a record from `resumeAssessmentId`
- notes opens a page from `resumeNoteId`

3. end-to-end tests
- desktop home shows local recent training, assessment, and note links
- clicking a home training resume action restores local playback
- clicking a home assessment resume action opens the assessment record
- clicking a home note resume action opens the requested note

### Acceptance Criteria

This M3 first-batch slice is complete when:

1. desktop home shows local recent training, recent assessments, and recent notes
2. desktop home shows a primary continue-working action based on desktop runtime state
3. `resumeSessionId` restores a prepared local training session
4. `resumeAssessmentId` opens the matching local assessment record
5. `resumeNoteId` opens the matching local note
6. the three workspaces write their active restore target back into desktop runtime state

## Review Notes

- This workspace is not inside a Git repository, so the normal commit step from the brainstorming workflow could not be performed.
- Subagent-based spec review was not used because this session does not have explicit user permission for delegated subagent work.
- The design was reviewed inline against the confirmed product decisions in chat.

## M3 Supplement: Unified Desktop Surface And Product-Like Workspace Structure

- Date: 2026-03-26
- Scope: Approved in chat as the next visual and structural slice
- Status: Approved in chat, added as a design supplement

### Why This Slice Matters

The current desktop app can run locally, but its visual structure still feels like a web product placed inside a window. The next step is not adding more features. It is changing the surface grammar so the product reads as a coherent desktop application.

The user explicitly wants:

- one unified working surface
- clear region boundaries without stacked floating cards
- independent regions inside the same overall frame
- a product feel instead of a cheap webpage feel

This slice focuses on structure, hierarchy, and interaction framing rather than new business capability.

### Approved Structural Direction

The approved direction is:

- `A: unified workbench surface`
- `left-side product navigation`
- `light tonal separation between regions`

That means:

- the application window should feel like one continuous working surface
- regions should be separated mostly by layout, thin dividers, and subtle background shifts
- the product should stop relying on nested rounded cards as its primary organizational device

### Global Layout Rules

The desktop app should move toward this shell:

1. `Left product navigation`
- primary entry points live on the left
- includes:
  - home
  - training
  - notes
  - assessment
- it should look like a real product navigation column, not an icon-only tool rail

2. `Main workspace column`
- contains the active workspace title and local actions
- should remain visually connected to the rest of the shell

3. `Optional assistant/context column`
- used only when the current workspace needs extra context
- examples:
  - notes side context
  - training helpers
  - assessment detail panes

The entire shell should read as one system with internal zones rather than separate floating cards.

### Visual Rules

The approved visual rules are:

1. `Buttons must simplify`
- button text is centered both horizontally and vertically
- primary actions use simple solid or semi-solid fills
- secondary actions use restrained outlines or low-contrast fills
- avoid exaggerated capsule treatment and inflated "marketing button" styling

2. `Do not stack cards inside cards`
- one region should have one main container meaning
- inner separation should come from spacing, dividers, or tonal shifts
- avoid repeated border-radius plus border plus shadow combinations

3. `Borders and depth should stay restrained`
- reserve stronger elevation for the outer product shell only
- internal regions should mostly avoid floating shadows
- use smaller radius values consistently

4. `Lists must behave like product rows`
- especially in notes file trees, training recent lists, and assessment history
- each row should have:
  - a content area
  - a metadata area when needed
  - an aligned action area
- destructive actions like note deletion should align to the row grid instead of floating visually

### Workspace Application

#### Notes workspace

The notes workspace should become the clearest example of the new shell:

- left: product navigation plus note tree
- center: tabs plus editor
- right: optional context panels

The file tree should feel editor-like, not card-based. Row alignment, active state, and delete actions should share one visual grid.

#### Training workspace

The training workspace should use the same structural language:

- left: product navigation and local support entry points
- center: source input and article context
- right: playback, reading stage, and helper controls

Recent sessions and templates should feel embedded into the desktop workbench rather than detached floating panels.

#### Assessment workspace

The assessment workspace should also follow the same shell:

- left: product navigation and history/navigation affordances
- center: assessment composer and result list
- optional right/detail emphasis inside the same continuous surface

Assessment history should read as a dense professional panel set, not oversized stacked web cards.

### Implementation Priority

The approved rollout order is:

1. global shell and left product navigation
2. notes workspace
3. training workspace
4. assessment workspace

This ordering is deliberate. The notes workspace is the fastest place to prove that the product now feels like a real desktop application. Once that language is right, training and assessment should conform to the same structure.

### Acceptance Criteria

This slice is complete when:

1. the global desktop shell uses left-side product navigation instead of top-level page chips
2. the app reads as one integrated surface with region separation driven by layout and tone
3. button styling is simplified and centered
4. notes file-tree rows and destructive actions align cleanly
5. training and assessment no longer rely on detached floating-card structure as their primary visual grammar
