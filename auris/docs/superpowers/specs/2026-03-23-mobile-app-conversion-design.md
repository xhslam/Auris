# Mobile App Conversion Design

- Date: 2026-03-23
- Project: `english-shadowing-web`
- Status: Approved in chat, proceeding to implementation planning

## Summary

Convert the existing English shadowing website into a shippable iPhone + Android app without removing any existing user-facing capability. The app should preserve the current Next.js product experience, continue using the existing server-backed flows for auth and cloud features, and add mobile-native bridges for capabilities that do not map cleanly from the browser to iOS and Android.

The recommended approach is a hybrid architecture based on `Capacitor`: keep the current Next.js app as the primary product surface, host it inside native iOS and Android shells, and introduce a platform abstraction layer so browser-only APIs can keep working on the web while mobile-specific implementations are provided for app builds.

The long-term commercial path should support App Store and Google Play monetization through native in-app subscription billing, with server-side entitlement verification and synchronization.

## Goals

- Ship an iPhone app and an Android app from the current codebase.
- Preserve all current major product capabilities:
  - login and session-aware routing
  - workspace creation and playback
  - cloud-backed audio generation and training preparation
  - local voice recording and playback
  - pronunciation assessment flows
  - wordbook and sentencebook
  - notes authoring and storage
  - training settings, notifications, exports, and local persistence
- Minimize product regression risk by reusing the existing Next.js UI and business logic where possible.
- Introduce mobile-compatible replacements for browser-only APIs.
- Establish a billing-ready architecture for paid subscriptions on iOS and Android.
- Add automated coverage for new mobile abstraction behavior and verify core user flows after the conversion.

## Non-Goals

- Do not rewrite the whole product into separate Swift and Kotlin apps.
- Do not rebuild the entire frontend in React Native.
- Do not replace the current server-backed auth, session, or audio-generation architecture with an offline-only model.
- Do not redesign the product UI from scratch as part of the mobile conversion, except where mobile layout or native capability constraints require adaptation.
- Do not implement the full production subscription catalog and pricing strategy in the same pass unless required to support the app integration skeleton.

## Recommended Approach

### Chosen Architecture: Capacitor + Existing Next.js App + Native Bridges

- Keep the current Next.js application as the primary UI and business layer.
- Add a Capacitor project with iOS and Android targets inside the workspace.
- Build the web app into a static/runtime bundle that Capacitor can load for mobile app builds.
- Introduce a platform services layer so features can depend on interfaces rather than directly calling browser-only APIs.
- Keep the current server APIs and Supabase-backed flows as the source of truth for authenticated and cloud-backed features.
- Add native bridges or Capacitor plugins for:
  - audio recording
  - local notifications
  - filesystem access and document export
  - share sheet integration
  - app lifecycle awareness
  - in-app purchases and subscription state refresh

### Why This Approach

- It preserves the most existing product behavior.
- It reduces the chance of losing current functionality during a rewrite.
- It is the fastest path to a billing-capable mobile product.
- It keeps one primary frontend codebase instead of forking the product into separate implementations.
- It allows incremental hardening of native capabilities while keeping web behavior intact.

## Alternative Approaches Considered

### Option 1: Full Native Rewrite

Pros:
- best native fit
- strongest OS integration
- easier access to advanced platform APIs

Cons:
- highest cost and longest schedule
- highest regression risk
- duplicates business logic and testing burden

### Option 2: React Native / Expo Frontend Rewrite

Pros:
- more native-feeling component stack than a web container
- better long-term native UI flexibility than a pure web shell

Cons:
- still requires a major frontend rewrite
- existing Next.js pages, styles, and browser-first tests cannot be reused directly
- substantial risk of functional drift

### Option 3: Capacitor Hybrid App

Pros:
- highest code reuse
- lowest feature-loss risk
- fastest route to iOS + Android availability
- strong fit for existing server-backed product

Cons:
- requires careful replacement of browser-only APIs
- some mobile-native UX constraints must be handled explicitly

Recommendation:
- Proceed with Option 3.

## Product Surface Inventory

The current product includes these mobile-relevant capability groups:

- `workspace`
  - training source input
  - article preview
  - playback preparation
  - word-level synced reading
  - playback controls
  - voice comparison
  - sentencebook and wordbook actions
  - training settings
  - recent sessions and templates
- `recording`
  - microphone capture
  - local audio persistence
  - local audio playback
- `assessment`
  - reference text entry
  - audio upload or recording
  - server-backed pronunciation assessment
  - local assessment history
- `notes`
  - markdown authoring
  - page library
  - sentencebook/wordbook snippet insertion
  - persistent local storage
  - directory-oriented file behavior on web
- `auth`
  - login/register/demo-session flows
  - route protection and profile loading
- `device/local features`
  - local notifications
  - downloads/exports
  - local settings
  - local storage-backed collections

## Architecture Design

### High-Level Layers

#### 1. UI and Route Layer

- Keep the current Next.js route structure:
  - `/login`
  - `/register`
  - `/workspace`
  - `/assessment`
  - `/notes`
- Preserve the current page/component composition and styling as the default experience.
- Add only the mobile-specific layout changes needed to make workflows comfortable on smaller screens or app containers.

#### 2. Platform Services Layer

Introduce a small, explicit abstraction layer for capabilities that currently depend directly on browser APIs. The layer should expose stable app-facing contracts while selecting implementations per platform.

Expected service families:

- `platform/audio-recording`
- `platform/notifications`
- `platform/filesystem`
- `platform/share`
- `platform/storage`
- `platform/billing`
- `platform/app-runtime`

Web builds should continue using current browser implementations where valid. Mobile builds should switch to Capacitor or native-backed implementations behind the same contract.

#### 3. Existing Business Logic Layer

- Keep current feature modules in `src/features/**` where possible.
- Refactor only the feature modules that hard-code browser-only primitives.
- Prefer dependency injection or platform adapters over scattering `Capacitor.isNativePlatform()` checks across UI components.

#### 4. Native Shell Layer

- Add `ios/` and `android/` targets via Capacitor.
- Use app configuration, permissions, build settings, icons, and native capabilities in those targets.
- Keep native code narrow and capability-focused instead of shifting product logic into native controllers.

#### 5. Server and Entitlements Layer

- Keep existing server routes for auth, sessions, templates, audio, and assessment.
- Add a server-side subscription verification path for App Store and Google Play purchase receipts/tokens.
- Let the server compute entitlements and return feature access to the app.

## Platform Capability Mapping

### Recording

Current state:
- workspace and assessment flows rely on browser microphone APIs and `MediaRecorder` / custom WAV recording.

Mobile design:
- replace direct browser recording assumptions with a platform recorder service
- web implementation:
  - preserve current browser recorder logic
- mobile implementation:
  - use Capacitor/native recording plugin and normalize output to the same app-level contract
- keep saved recording metadata shape aligned with the current app needs:
  - `id`
  - `title`
  - `durationMs`
  - `createdAt`
  - `mimeType`
  - binary payload reference

### Playback

Current state:
- playback relies on HTML audio elements and current hooks for timing and rate control

Mobile design:
- preserve HTML audio path where it behaves correctly inside Capacitor webviews
- add app runtime hooks for:
  - background/foreground interruptions
  - audio session state
  - playback resume expectations
- keep user-facing controls unchanged unless a platform issue requires a fallback

### Notes Storage

Current state:
- notes use browser persistence and `File System Access API` semantics

Mobile design:
- replace directory-picker dependence with an app document library abstraction
- keep the notes UI and note model intact
- mobile behavior:
  - notes stored in app-private filesystem or database-backed storage
  - explicit import/export/share actions replace persistent directory handle behavior
- web behavior:
  - preserve existing directory-based experience where supported

### Local Collections and Settings

Current state:
- settings, recordings, sentencebook, wordbook, and note indexes rely on local browser storage or IndexedDB

Mobile design:
- normalize these behind storage adapters
- web:
  - retain `localStorage` / IndexedDB-backed implementations
- mobile:
  - prefer Capacitor Preferences for tiny key-value settings
  - prefer SQLite or filesystem-backed structured storage for larger datasets and binary content

### Notifications

Current state:
- workspace uses browser notifications

Mobile design:
- replace direct browser notification calls with a notification service
- web:
  - preserve existing browser notification request and display behavior
- mobile:
  - use local notifications plugin
  - align scheduling and permission prompts with iOS/Android requirements

### Export and Share

Current state:
- browser downloads use Blob + anchor download flow

Mobile design:
- move export behavior behind a platform file/share service
- web:
  - retain download behavior
- mobile:
  - write export payload to a temporary file
  - invoke system share sheet or save-to-files flow

### Billing and Entitlements

Current state:
- no native app purchase layer yet

Mobile design:
- add native billing service abstraction
- iOS:
  - Apple in-app purchases / subscriptions
- Android:
  - Google Play Billing subscriptions
- server:
  - verify receipts/tokens
  - map purchases to app user identity
  - return entitlement status to the app
- app:
  - refresh entitlement state on app start, login, and purchase completion

## Data and State Design

### Preserve Existing Domain Models Where Possible

- `SessionPlayback`
- `TemplateRecord`
- `LocalRecordingRecord`
- `SavedSentenceRecord`
- `SavedWordRecord`
- pronunciation assessment record types
- note page and summary models
- training settings

### Add Platform-Normalized Persistence Contracts

The app should not force every feature to know how storage works on every platform. Instead, define storage contracts with equivalent semantics across web and mobile.

Examples:

- `NotesStorage`
- `LocalRecordingStorage`
- `PronunciationAssessmentStorage`
- `SentencebookStorage`
- `WordbookStorage`
- `TrainingSettingsStorage`

If an existing type already behaves like an interface, keep it and add mobile implementations.

## UX and Layout Design

### Mobile App Behavior

- keep route-level flows recognizable to current users
- optimize layout for smaller viewports and touch interaction
- preserve all current tools and actions, even if surfaced differently
- avoid hiding or removing desktop features just because the viewport is smaller

### Required Mobile UI Adjustments

- improve toolbar density for phone-width layouts
- ensure playback dock remains usable in the app shell
- verify dialogs and overlays work within mobile safe areas
- ensure notes editing, recorder actions, wordbook/sentencebook, and assessment forms fit mobile ergonomics
- add app-aware affordances where native replacements exist:
  - import/export
  - share
  - permissions status
  - subscription state

### Permission UX

- microphone permission must be requested before recording flows begin
- notification permission should be prompted contextually
- file/share actions should communicate where content is stored on mobile
- billing failures should surface clear user-friendly messages

## Error Handling

- Keep explicit error handling at the platform boundary.
- Convert plugin/native failures into clear app-level messages.
- Never silently downgrade functionality.
- If a mobile feature depends on unavailable permissions:
  - show actionable guidance
  - preserve the rest of the screen
  - allow retry after permission changes
- Ensure network/server failures remain distinguishable from native capability failures.

## Security and Commercialization

### Authentication

- preserve current auth model and route protection
- ensure app sessions map cleanly between web and native app runtime
- keep secrets in environment/native config, never hardcoded in the app bundle

### Billing

- digital subscription unlocking must use platform-native billing on iOS and Android
- do not rely on web checkout inside the app for unlocking digital features
- receipt/token verification must happen server-side
- entitlements should be bound to the authenticated user account

### Local Data

- keep locally stored recordings, notes, and settings inside app-private storage where possible
- sanitize exports and avoid leaking credentials in files or logs

## Testing Strategy

### Unit Tests

Add focused tests around new platform abstractions and adapters:

- platform selection behavior
- web adapter behavior remains compatible with current browser code
- mobile adapter contracts normalize plugin responses correctly
- export/share fallback logic
- notification service contract
- billing service state mapping

### Component / Integration Tests

Update or add tests to confirm key product flows still render and behave when platform services are injected:

- workspace playback preparation path
- voice recording panel with web and mocked mobile adapters
- assessment composer recording/upload path
- notes storage behavior through abstracted storage
- export actions for sentencebook and wordbook

### Build / Packaging Verification

- web app build still passes
- Capacitor sync/build steps succeed
- iOS project generation succeeds
- Android project generation succeeds

### Manual Verification Checklist

- login works
- workspace loads
- source text can be prepared into a session
- audio playback works
- own-voice recording works
- pronunciation assessment works with uploaded/recorded audio
- wordbook and sentencebook actions work
- notes can be created, edited, and persisted
- exports/share actions work on both web and mobile paths
- notifications work where enabled
- subscription state can be refreshed and displayed

## Risks

### Risk: Browser-only APIs are deeply coupled to UI components

Mitigation:
- introduce adapters first
- migrate feature by feature behind stable contracts

### Risk: Notes behavior depends on directory semantics that do not exist on mobile

Mitigation:
- preserve note model and editor
- redefine only the storage contract and import/export UX on mobile

### Risk: Audio recording/playback behavior differs across webviews and devices

Mitigation:
- keep a dedicated platform recorder service
- verify on both iOS and Android hardware or simulators

### Risk: Payment integration adds server requirements not present today

Mitigation:
- stage billing as a bounded platform service plus entitlement endpoint
- keep purchase validation server-side from the start

### Risk: Mobile app packaging of Next.js introduces runtime assumptions that break in native shells

Mitigation:
- validate build mode early
- choose a supported Capacitor + Next.js integration pattern before broad refactors

## Implementation Notes

- The conversion should be executed in phases:
  - platform abstraction
  - native shell setup
  - storage/recording/notification adaptation
  - billing scaffolding
  - test hardening and verification
- Keep web behavior working throughout the migration.
- Favor focused files and clear interface boundaries over adding platform conditionals directly inside feature UIs.
- The current project folder is not inside a Git repository, so the usual spec commit step is not available unless Git is initialized later.

## Review Constraint

- Subagent-based spec review was not run because this session does not have explicit user permission to delegate work to subagents.
