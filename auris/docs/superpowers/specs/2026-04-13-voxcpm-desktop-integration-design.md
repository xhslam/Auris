# VoxCPM Desktop Integration Design

- Date: 2026-04-13
- Project: `english-shadowing-web`
- Status: Approved in chat, written to file

## Summary

Integrate `VoxCPM` into the desktop application as a local-first high-quality speech engine for training audio generation, while preserving the current cloud-backed playback preparation flow as the compatibility fallback.

The chosen product shape is:

- desktop-first rollout
- default `local-first` speech generation
- automatic fallback to current cloud/OpenAI speech generation when local runtime is unavailable
- Electron-managed local `VoxCPM` sidecar instead of renderer-owned model execution
- provider-neutral voice-profile model instead of hard-coded `male/female` voice ids
- cache and runtime layout designed for future macOS and Linux support

The chosen safety boundary is:

- `VoxCPM` enhances the desktop product but does not gate core training availability
- the renderer never talks to Python or GPU runtime directly
- the Electron main process owns runtime detection, sidecar lifecycle, health checks, fallback decisions, and local cache orchestration
- session playback, word-level timing, assessment, and existing storage flows remain structurally intact

## Product Decisions Confirmed In Chat

The user approved the following decisions:

- the design should target `desktop first`
- the structure should `leave room for future macOS/Linux support`
- rollout should optimize for `final productization`, not only a developer sandbox
- if local `VoxCPM` is unavailable, the app should `allow fallback` instead of hard-failing
- the default strategy should be `prefer local first`
- the recommended approach should be `embedded local sidecar`

## Goals

- Add a local high-quality speech engine to the desktop app without breaking the current training workflow.
- Keep the current session-preparation architecture recognizable by integrating through the existing `SpeechProvider` abstraction.
- Make the desktop app the first environment to benefit from local speech generation.
- Preserve a safe fallback path to the current OpenAI-based speech preparation flow.
- Introduce a voice-profile model that can represent both current cloud voices and future local `VoxCPM` presets.
- Create a runtime architecture that can later support macOS and Linux with minimal business-layer changes.
- Add deterministic local cache and runtime state handling for repeated training generation.

## Non-Goals

- Do not replace the current web and mobile speech path in the same slice.
- Do not move pronunciation assessment into the local speech engine.
- Do not require `VoxCPM` to become the source of truth for word-level timestamp alignment in the first rollout.
- Do not ship unrestricted user-facing voice cloning as a default training mode.
- Do not run `VoxCPM` directly inside the renderer process or inside a generic Next.js route as an embedded inference engine.
- Do not make desktop app startup depend on immediate full model loading.

## Current State

The desktop application already contains the main structural pieces needed for this integration:

- a `SpeechProvider` contract in [speech-provider.ts](C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\features\audio\speech-provider.ts)
- an OpenAI-backed implementation in [openai-speech-provider.ts](C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\features\audio\openai-speech-provider.ts)
- playback preparation orchestration in [prepare-session.ts](C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\features\sessions\prepare-session.ts)
- desktop bridge and preload ownership in [desktop-bridge.ts](C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\platform\desktop\desktop-bridge.ts) and [preload.cjs](C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\electron\preload.cjs)
- Electron main-process lifecycle and local-data ownership in [main.cjs](C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\electron\main.cjs)
- local audio/session persistence in [audio-storage.ts](C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\features\storage\audio-storage.ts), [local-persistence.ts](C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\server\repositories\local-persistence.ts), and [local-history-db.cjs](C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\electron\local-history-db.cjs)

This means the project does not need a parallel speech system. It needs a new desktop-oriented provider and runtime boundary.

## Recommended Architecture

### Chosen Architecture

Use `Electron-managed local sidecar + provider abstraction + automatic fallback`.

The desktop speech stack should be organized into four layers:

1. `Renderer / Next UI`
2. `Speech Provider Business Layer`
3. `Electron Main Runtime Orchestrator`
4. `VoxCPM Sidecar`

### 1. Renderer / Next UI

Responsibilities:

- training settings UI
- current engine status display
- non-blocking fallback messaging
- session-prepare user actions

This layer must not manage Python processes, model loading, or GPU runtime health.

### 2. Speech Provider Business Layer

Responsibilities:

- choose the active speech provider based on environment and settings
- normalize speech-generation results to the existing `PreparedSpeechResult`
- keep training orchestration stable for the rest of the app

This layer continues to expose:

- `audioBuffer`
- `contentType`
- `durationMs`
- `transcriptWords`

The training pipeline should continue to treat the provider result as a normalized contract instead of caring whether audio came from OpenAI or `VoxCPM`.

### 3. Electron Main Runtime Orchestrator

Responsibilities:

- runtime detection
- sidecar lifecycle management
- startup and shutdown
- health checks
- crash recovery
- fallback decisions
- capability reporting
- cache ownership

This layer is the only desktop-owned authority for local speech runtime state.

### 4. VoxCPM Sidecar

Responsibilities:

- load the local `VoxCPM` runtime
- serve a narrow local API such as `health`, `capabilities`, and `generate`
- normalize audio output for the Electron main process
- keep model-specific concerns isolated from the product runtime

This sidecar is a local inference service, not a product-facing application surface.

## Process Boundary

The chosen process boundary is:

- renderer calls app business logic
- business logic resolves the active speech provider
- desktop mode calls into the Electron-owned local voice-engine bridge
- Electron main checks whether the sidecar is healthy
- if healthy, Electron requests local `VoxCPM` generation
- if unavailable or unhealthy, Electron or provider resolver falls back to the cloud/OpenAI path
- training playback preparation continues through the current token mapping and session persistence flow

This preserves the current session architecture while changing only the source of generated training audio.

## Provider Model

### Speech Engine Preference

Desktop settings should support an explicit engine preference:

- `auto_local_first`
- `local_only`
- `cloud_only`

Recommended default:

- desktop uses `auto_local_first`
- web and mobile continue using cloud-first behavior until explicitly expanded later

### Provider Resolution Rules

Desktop resolution order:

1. `VoxCPM`
2. current OpenAI speech provider
3. current Windows TTS fallback

Resolution rules:

- if the user selects `auto_local_first`, desktop first attempts local `VoxCPM`
- if local runtime is unavailable, desktop automatically degrades to OpenAI
- if OpenAI is unavailable, the current Windows TTS fallback remains the last-resort compatibility path
- if the user selects `local_only`, failure should be explicit and should not silently fall back to cloud
- if the user selects `cloud_only`, the app should skip local runtime startup and health checks for generation requests

## Voice Profile Model

The current `male/female` model is too narrow for a local high-quality engine. The design should replace that with `voice profiles`.

Recommended voice-profile shape:

- `id`
- `provider`
- `mode`
- `label`
- `locale`
- `stylePrompt`
- `referenceRecordingId`
- `providerVoiceId`
- `fallbackProfileId`

Recommended meanings:

- `provider`: `openai | voxcpm`
- `mode`: `preset | designed | reference_clone`

Examples of valid desktop voice profiles:

- standard English female teacher
- standard English male teacher
- slow and clear coach voice
- podcast-style conversational coach
- optional user-selected reference clone profile in future phases

### Why Voice Profiles

Voice profiles let the product:

- represent multiple providers without rewriting the UI each time
- keep session records provider-neutral
- preserve a stable user mental model around "teacher voice" instead of model internals
- add future local and cloud voices without reworking settings storage again

## IPC Design

The local voice engine should be exposed through a dedicated Electron bridge namespace instead of leaking provider-specific logic into general training APIs.

Recommended IPC surface:

- `shadowing:voice-engine:get-status`
- `shadowing:voice-engine:get-capabilities`
- `shadowing:voice-engine:start`
- `shadowing:voice-engine:stop`
- `shadowing:voice-engine:generate`

### `get-status`

Returns:

- current runtime state
- active provider
- platform
- reason code
- model version
- capability summary

### `get-capabilities`

Returns whether the local runtime currently supports:

- text-only generation
- preset voice profiles
- style prompting
- reference-based generation
- transcript-assisted higher-fidelity generation
- supported locales

### `start`

Used to:

- warm the sidecar
- allow manual recovery from settings or diagnostics UI
- separate "runtime startup" from "first user action latency" where possible

### `stop`

Used to:

- support diagnostics
- free resources manually during a desktop session
- recover cleanly from sidecar faults

### `generate`

Recommended request shape:

- `sessionId`
- `text`
- `voiceProfileId`
- `locale`
- `stylePrompt`
- `referenceAudioPath`

The request shape should remain product-oriented, not model-oriented.

## Sidecar Lifecycle

The Electron main process should own a strict sidecar state machine.

Recommended runtime states:

- `not_configured`
- `starting`
- `ready`
- `busy`
- `degraded`
- `failed`

### Startup Rules

- app startup should not require full model load
- desktop app should perform only light runtime detection at startup
- entering training workflows or opening relevant settings should trigger sidecar warmup
- generation requests should perform a final fast health check before dispatch

### Recovery Rules

- sidecar crashes should trigger limited automatic restart attempts
- repeated failures in one app session should enter `degraded`
- `degraded` state should use cloud fallback by default unless the user selected `local_only`
- the settings or diagnostics UI should provide a manual retry action

### Timeout Rules

Different failure types should be handled differently:

- startup timeout: runtime may degrade to cloud
- health-check timeout: runtime may degrade to cloud
- generation timeout: current session falls back, but runtime may remain recoverable
- repeated crash loop: mark runtime `failed` or `degraded` for the rest of the session unless retried manually

## Automatic Fallback Strategy

The user approved the rule:

- allow fallback
- default to local-first

The fallback order is:

1. `Desktop VoxCPM`
2. `OpenAI speech provider`
3. `Windows TTS fallback`

### Fallback Triggers

Triggers that may degrade to cloud:

- local runtime missing
- sidecar startup timeout
- sidecar health-check failure
- local generation timeout
- incompatible local runtime
- local model resource missing or invalid

Triggers that should not permanently degrade the engine:

- invalid reference audio for one request
- one malformed voice profile
- one user-specific generation request failure when the sidecar remains healthy

These should be treated as request-level faults, not whole-engine faults.

## Timestamp Alignment Strategy

The first rollout should not require `VoxCPM` to become the authoritative word-alignment engine.

The recommended first-phase flow is:

- `VoxCPM` generates audio
- the existing transcription/alignment path continues to produce `transcriptWords`
- the current `mapWordTimestamps` flow remains in charge of sentence and token mapping

This keeps the current shadowing-stage behavior stable while allowing the speech source to improve.

## Desktop-Specific Product Strategy

Desktop is the first target because it is the strongest fit for local speech generation:

- local GPU access is realistic
- local filesystem access already exists
- local recording and history already exist
- privacy expectations are stronger
- generated-audio caching has clearer value

The first desktop value should be:

- more natural teacher audio
- more stable rhythm and pauses for shadowing
- richer teacher voice presets

The first desktop value should not be:

- unrestricted deep voice cloning
- replacing pronunciation assessment
- a cross-platform release in the same implementation slice

## Cache And Local Resource Management

The design should add a dedicated voice-engine runtime directory under Electron-owned local app data.

Recommended layout:

- `voice-engine/sidecar/`
- `voice-engine/models/`
- `voice-engine/cache/generated/`
- `voice-engine/cache/reference/`
- `voice-engine/logs/`

### Directory Responsibilities

`sidecar/`

- sidecar launch artifacts
- runtime metadata

`models/`

- local model files
- version markers
- compatibility metadata

`cache/generated/`

- reusable generation outputs
- audio generated from repeated text/profile requests

`cache/reference/`

- normalized copies of reference recordings
- intermediate audio prepared for the local engine

`logs/`

- sidecar diagnostics
- crash and startup logs

### Cache Ownership Rule

Voice-engine cache is not the same as session-owned audio storage.

The separation should be:

- voice-engine cache stores reusable generation artifacts
- business session storage stores finalized training session audio and metadata

Session output should continue to flow through the existing [audio-storage.ts](C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\features\storage\audio-storage.ts) pipeline so existing session semantics stay intact.

### Cache Key Design

Recommended generated-audio cache key inputs:

- normalized text
- voice profile id
- locale
- style prompt hash
- reference audio fingerprint
- sidecar version
- model id

This prevents stale or incompatible audio reuse after model or profile changes.

### Cache Cleanup

Recommended cleanup rules:

- session-owned training audio follows current business retention behavior
- sidecar generated cache uses LRU or total-size limits
- sidecar logs rotate by date or size
- reference-cache artifacts only persist while referenced by active profiles or recent requests

## Installation And Productization Strategy

The architecture should separate:

1. `desktop app base runtime`
2. `local high-quality speech runtime`

This means the desktop app remains usable without a valid local `VoxCPM` environment.

### Required Productization Contracts

The design should reserve explicit modules for:

- runtime detection
- installer contract
- platform adapter
- version compatibility checks

### Runtime Detector

Responsibilities:

- determine whether the local runtime is correctly installed
- verify model presence
- verify minimal platform compatibility
- report reason codes without leaking low-level implementation details to the renderer

### Installer Contract

Responsibilities:

- define what "installed and ready" means
- give the future desktop product one place to own repair and upgrade logic

### Platform Adapter

Responsibilities:

- start sidecar with platform-specific launch logic
- normalize paths
- normalize runtime checks across Windows, macOS, and Linux

This isolates future platform expansion from the business speech-provider layer.

## Error Handling

Errors should be grouped into four classes:

### 1. User-Recoverable Errors

Examples:

- invalid reference audio
- unsupported voice profile
- invalid locale or settings

Behavior:

- return user-readable error
- keep runtime state healthy
- allow the user to correct settings

### 2. Environment-Recoverable Errors

Examples:

- sidecar not started
- missing model resource
- runtime misconfiguration
- startup timeout

Behavior:

- Electron may try repair or restart logic
- app may fall back if allowed
- user may be shown high-level guidance

### 3. Session-Level Failures

Examples:

- one generation request timeout
- one alignment failure

Behavior:

- fail the current session or degrade this request
- do not assume the whole engine is permanently broken

### 4. System-Level Failures

Examples:

- repeated sidecar crash
- incompatible runtime
- corrupted model package

Behavior:

- enter `degraded` or `failed`
- surface compatibility mode in settings
- avoid infinite restart loops

## User-Facing Feedback Rules

The product should tell the user when the desktop speech path is:

- `local high quality`
- `cloud compatibility mode`
- `local unavailable, using fallback`

Rules:

- do not block the user with technical stack traces
- do not silently swap engines without visible state
- do not use modal failure interruptions unless the selected mode is `local_only`

## Cross-Platform Readiness

The first implementation targets desktop rollout now, but the structure must support later expansion.

Recommended portability rule:

- business-layer provider logic must not contain Windows-only runtime assumptions
- platform-specific runtime startup and detection belong inside platform adapters
- the voice-engine bridge contract should remain stable across operating systems

This means future macOS and Linux support should mainly require:

- launch-command differences
- filesystem-path differences
- runtime detection differences
- packaging differences

The session, provider, and caching model should not need redesign.

## Verification Strategy

### Architecture Verification

The first implementation slice should prove:

- provider resolution works
- desktop bridge can report voice-engine status
- Electron can manage a sidecar lifecycle
- automatic fallback works without breaking training flows

### Functional Verification

The local beta should verify:

- desktop training can generate session audio from local `VoxCPM`
- session persistence and playback still work
- alignment and token mapping still work
- local runtime failure falls back to the cloud path when allowed

### Quality Verification

The quality phase should verify:

- shadowing audio sounds more natural than the current baseline
- cache reduces repeated wait time
- engine-state UI stays accurate

### Packaging Verification

The packaging phase should verify:

- install and repair pathways
- sidecar version compatibility checks
- desktop startup remains healthy with or without local `VoxCPM`
- Windows-first rollout can later generalize without architectural rework

## Rollout Phases

### Phase 1: Architecture Slice

Scope:

- provider abstraction updates
- desktop bridge contract
- sidecar state machine
- fallback handling
- no requirement for full final packaging

### Phase 2: Desktop Local Beta

Scope:

- Windows desktop local `VoxCPM`
- English text generation
- small set of teacher voice presets
- cloud fallback retained

### Phase 3: Quality Beta

Scope:

- richer voice profiles
- better cache behavior
- latency and stability tuning
- stronger diagnostics

### Phase 4: Packaging And Platform Expansion

Scope:

- more productized installation path
- model/runtime update flow
- macOS and Linux adapters

## Risks

### Risk: Local runtime complexity overwhelms app startup and supportability

Mitigation:

- do not require full model load on startup
- keep startup detection lightweight
- isolate sidecar ownership in Electron main

### Risk: Renderer and business layers become polluted with runtime-specific logic

Mitigation:

- keep provider resolution centralized
- use a dedicated voice-engine bridge
- avoid provider-specific conditionals in page components

### Risk: Local generation improves voice quality but destabilizes word-level training alignment

Mitigation:

- retain current alignment path in the first rollout
- treat generation and alignment as separate concerns

### Risk: Product drifts toward unrestricted clone-centric UX

Mitigation:

- keep first release focused on teacher-quality shadowing audio
- delay advanced clone modes until the core training value is validated

### Risk: Cross-platform support becomes expensive later because Windows assumptions leak early

Mitigation:

- isolate runtime startup and detection behind platform adapters
- keep IPC and provider contracts platform-neutral

## Acceptance Criteria

This design is considered successfully implemented when:

1. desktop can report local voice-engine state through the desktop bridge
2. desktop training audio generation defaults to local-first behavior
3. desktop automatically falls back to the current cloud speech path when local runtime is unavailable and user preference allows it
4. the current session preparation, storage, playback, and assessment flows remain intact
5. voice selection is represented by a provider-neutral voice-profile model rather than only `male/female`
6. local runtime cache and finalized session audio storage are separated clearly
7. the structure already isolates platform-specific runtime details from the business speech-provider layer

## Review Notes

- This design was reviewed inline against the user-approved decisions in chat.
- A delegated subagent-based spec review loop was not used because this session does not have explicit user permission for subagent delegation.
- The repository contains a large amount of existing untracked user work, so this design file was written without creating a git commit automatically.
