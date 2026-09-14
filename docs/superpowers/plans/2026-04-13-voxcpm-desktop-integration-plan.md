# VoxCPM Desktop Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first shippable desktop architecture slice for VoxCPM integration by introducing a desktop voice-engine bridge, local-first provider resolution with fallback, and a provider-neutral voice-profile model that fits the existing training flow.

**Architecture:** Keep the current session-preparation pipeline intact and swap only the speech-source boundary. The desktop app gains a dedicated voice-engine bridge and a VoxCPM-aware provider resolver, while the UI and training settings move from `male/female` toward voice profiles and engine preference without breaking current compatibility paths.

**Tech Stack:** Next.js 16, React 19, TypeScript, Electron, Vitest

---

### Task 1: Add the Voice-Profile And Engine-Preference Domain Model

**Files:**
- Create: `src/features/audio/voice-profile-options.ts`
- Modify: `src/features/settings/training-settings-store.ts`
- Modify: `src/features/audio/voice-options.ts`
- Test: `tests/unit/audio/voice-profile-options.test.ts`

- [ ] **Step 1: Write the failing test**

Write tests for:
- default voice profile resolution
- compatibility mapping from legacy `male/female`
- engine-preference sanitization in training settings

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/audio/voice-profile-options.test.ts`
Expected: FAIL because the new module and settings shape do not exist yet

- [ ] **Step 3: Write minimal implementation**

Implement:
- a small voice-profile catalog for OpenAI and VoxCPM-compatible presets
- legacy mapping helpers
- updated training-settings shape with:
  - `speechEnginePreference`
  - `voiceProfileId`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/audio/voice-profile-options.test.ts`
Expected: PASS

### Task 2: Add Desktop Voice-Engine Bridge Types And Validation

**Files:**
- Modify: `src/platform/desktop/desktop-bridge.ts`
- Modify: `src/platform/desktop/desktop-runtime.ts`
- Modify: `electron/preload.cjs`
- Test: `tests/unit/platform/desktop-runtime.test.ts`

- [ ] **Step 1: Write the failing test**

Extend the desktop-runtime test to require:
- a valid `voiceEngine` bridge object
- `getStatus`, `getCapabilities`, `start`, `stop`, and `generate`

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/platform/desktop-runtime.test.ts`
Expected: FAIL because the type guard does not accept the new bridge contract

- [ ] **Step 3: Write minimal implementation**

Add:
- voice-engine bridge types
- preload methods
- runtime type-guard support

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/platform/desktop-runtime.test.ts`
Expected: PASS

### Task 3: Add Electron Voice-Engine Runtime Skeleton And IPC

**Files:**
- Create: `electron/voice-engine-runtime.cjs`
- Modify: `electron/main.cjs`
- Test: `tests/unit/electron/voice-engine-runtime.test.ts`

- [ ] **Step 1: Write the failing test**

Write tests for:
- default runtime status when no local runtime is configured
- capability reporting
- transition to degraded fallback state

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/electron/voice-engine-runtime.test.ts`
Expected: FAIL because the runtime module and IPC behavior do not exist yet

- [ ] **Step 3: Write minimal implementation**

Implement:
- a sidecar-runtime skeleton with explicit status objects
- environment-based local runtime detection
- minimal capability model
- IPC handlers in `electron/main.cjs`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/electron/voice-engine-runtime.test.ts`
Expected: PASS

### Task 4: Add Provider Resolution And Desktop VoxCPM Speech Provider

**Files:**
- Create: `src/features/audio/voxcpm-speech-provider.ts`
- Create: `src/features/audio/resolve-speech-provider.ts`
- Modify: `src/features/audio/speech-provider.ts`
- Modify: `src/features/audio/openai-speech-provider.ts`
- Modify: `src/features/sessions/prepare-session.ts`
- Test: `tests/unit/audio/resolve-speech-provider.test.ts`
- Test: `tests/unit/sessions/prepare-session.test.ts`

- [ ] **Step 1: Write the failing tests**

Write tests for:
- desktop local-first resolution uses the desktop voice engine when available
- desktop local-first resolution falls back to OpenAI when the voice engine is unavailable
- `local_only` fails cleanly
- `prepareSessionPlayback` stores the selected voice profile id in the session

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/audio/resolve-speech-provider.test.ts tests/unit/sessions/prepare-session.test.ts`
Expected: FAIL because the resolver and desktop provider do not exist yet

- [ ] **Step 3: Write minimal implementation**

Implement:
- desktop voice-engine provider
- provider resolver
- `prepareSessionPlayback` input expansion for engine preference and voice profile id
- backward compatibility for legacy voice ids

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/audio/resolve-speech-provider.test.ts tests/unit/sessions/prepare-session.test.ts`
Expected: PASS

### Task 5: Update Session Prepare API And Workspace UI To Use Voice Profiles

**Files:**
- Modify: `src/app/api/sessions/[sessionId]/prepare/route.ts`
- Modify: `src/components/workspace/source-panel.tsx`
- Modify: `src/components/workspace/training-settings-panel.tsx`
- Modify: `src/components/workspace/workspace-shell.tsx`
- Test: `tests/component/workspace/source-panel-customize.test.tsx`

- [ ] **Step 1: Write the failing test**

Update component tests to expect:
- voice-profile selection instead of only `male/female`
- engine preference controls or summary text
- `/prepare` request body includes `voiceProfileId` and `speechEnginePreference`

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/component/workspace/source-panel-customize.test.tsx`
Expected: FAIL because the UI and request payload still use only `voiceId`

- [ ] **Step 3: Write minimal implementation**

Implement:
- updated training settings UI
- request payload expansion
- compatibility rendering for OpenAI and VoxCPM presets

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/component/workspace/source-panel-customize.test.tsx`
Expected: PASS

### Task 6: Run Focused Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-04-13-voxcpm-desktop-integration-plan.md`

- [ ] **Step 1: Run the targeted unit and component suite**

Run:
`npx vitest run tests/unit/audio/voice-profile-options.test.ts tests/unit/platform/desktop-runtime.test.ts tests/unit/electron/voice-engine-runtime.test.ts tests/unit/audio/resolve-speech-provider.test.ts tests/unit/sessions/prepare-session.test.ts tests/component/workspace/source-panel-customize.test.tsx`

Expected:
- all targeted tests pass

- [ ] **Step 2: Run a broader regression slice for touched workflows**

Run:
`npx vitest run tests/unit/storage/audio-storage.test.ts tests/unit/platform/desktop-runtime.test.ts tests/unit/sessions/prepare-session.test.ts tests/component/workspace/source-panel.test.tsx tests/component/workspace/source-panel-customize.test.tsx`

Expected:
- no regressions in audio preparation, desktop runtime, or workspace source flows

- [ ] **Step 3: Record any remaining gaps**

Document:
- that this slice ships the desktop voice-engine architecture, not the final fully packaged VoxCPM runtime
- any unverified sidecar packaging concerns

## Review Notes

- This plan intentionally implements the first architecture slice from the approved spec, not the full end-state packaging system.
- Subagent-based plan review was not used because this session does not have explicit user permission for delegated subagent work.
