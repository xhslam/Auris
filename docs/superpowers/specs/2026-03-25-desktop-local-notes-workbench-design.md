# Desktop Local Notes Workbench Design

- Date: 2026-03-25
- Project: `english-shadowing-web`
- Status: Approved in chat, awaiting file review before implementation planning

## Summary

Convert the current product into a desktop-capable local project without rewriting the core training experience. The desktop app should use `Electron` as the native shell, preserve all existing core capabilities, and upgrade only the `notes` area into an Obsidian-like local workbench centered on a local `vault`, desktop-grade file access, and user-installable plugins.

This change must not redefine the product as a note-taking app. The primary product remains the existing training system. The notes area becomes a training-assistant workbench that feels like Obsidian while still integrating with the existing `wordbook`, `sentencebook`, and markdown workflows.

## Goals

- Ship a desktop-local version of the current product using `Electron`.
- Preserve all existing core product capabilities without removing or downgrading any of them.
- Keep `workspace`, `assessment`, `auth`, playback, recording, training settings, sentencebook, and wordbook behavior functionally stable.
- Upgrade `notes` into an Obsidian-like local workbench.
- Make the notes workbench default to a local `vault` directory.
- Support user-installed plugins in an Obsidian-like way.
- Keep notes clearly positioned as a training-assistant subsystem, not the primary product.
- Add automated tests for new desktop abstractions and updated notes behavior.
- Perform manual self-verification and a post-implementation review before calling the work complete.

## Non-Goals

- Do not rewrite the entire product as a native desktop app.
- Do not redesign the core training flows around note-taking.
- Do not turn the product into a generic standalone note product.
- Do not move the source of truth for core training/account/cloud features away from the current system.
- Do not force the entire application into an offline-first model.
- Do not let plugins directly reshape core training flows in the first phase.

## Product Positioning

### Primary Product

The primary product remains the current training system. The following continue to define the main product value:

- `workspace`
- `assessment`
- `auth`
- playback and shadowing flows
- voice recording
- cloud-backed training preparation
- sentencebook
- wordbook
- exports, notifications, and related training helpers

### Notes Positioning

`notes` becomes a `training-assistant local workbench`.

That means:

- notes support study capture, reflection, organization, and markdown authoring
- notes integrate with sentencebook and wordbook
- notes gain local vault behavior, tabs, commands, and plugins
- notes do not become the new center of the entire product

This boundary is critical and must be protected during implementation.

## Recommended Architecture

### Chosen Architecture

Use `Electron + Next.js` with a clear boundary between product UI/business logic and desktop-native capabilities.

The application should be split into four layers:

#### 1. Existing Business Layer

Keep the current route and feature structure as the product core:

- `src/app/**`
- `src/components/**`
- `src/features/**`

This layer continues to drive core training behavior.

#### 2. Desktop Platform Layer

Add a desktop layer for:

- main process window management
- local filesystem access
- vault management
- desktop commands
- plugin loading
- desktop menu integration
- secure IPC/preload bridging

This layer exists to provide native capabilities that the browser cannot provide reliably.

#### 3. Notes Workbench Layer

Apply the Obsidian-like redesign only to `/notes`.

This layer includes:

- local vault browser
- file tree
- tabbed note editing
- command palette
- right-side context panels
- plugin-provided note enhancements

#### 4. Plugin Extension Layer

Add an extension system that allows user-installed plugins to extend the notes workbench and selected desktop capabilities without taking over the core training system.

## App Surface and Scope

### App-Level Navigation

The desktop app remains one product with multiple sections:

- `workspace`
- `notes`
- `assessment`
- existing auth/account flows where needed

At the app shell level, desktop navigation may become more native-feeling, but the underlying product sections remain recognizable.

### Notes Workbench Layout

The notes area should feel Obsidian-like while staying connected to the current product:

- far-left app rail for high-level product sections
- left notes sidebar for local vault and note tree
- center editor area with tabs and markdown editing/preview
- right context panel for wordbook, sentencebook, and plugin panels

This is intentionally scoped to `notes`. The workspace and assessment product surfaces should not be force-fitted into this layout unless a later, separate design explicitly approves it.

## Local Vault Design

### Vault as Default Notes Workspace

Desktop notes should default to a user-selected local `vault` directory.

The vault stores:

- markdown note files
- folders and nested note structure
- note-related assets
- notes workbench metadata
- plugin installation/config metadata

Markdown notes must remain real `.md` files on disk.

### Vault Metadata

Vault metadata should stay local and should not be confused with cloud-backed domain state.

Examples of vault-local state:

- active vault path
- open tabs
- sidebar expansion state
- note workbench layout state
- command history
- note UI preferences
- plugin enabled/disabled state
- plugin settings

### Notes Data Behavior

Desktop notes should preserve the current strengths of the existing notes feature:

- local markdown editing
- autosave
- page listing
- delete/create note actions
- sentencebook insertion
- wordbook insertion

These capabilities should be reimplemented on top of desktop-native filesystem access where appropriate, not dropped.

## State Ownership Boundary

This boundary must be explicit before implementation.

### Cloud/System of Record

The following remain primarily owned by the current application/business/backend layer:

- authenticated user identity
- cloud sessions
- training preparation data
- playback/session domain records
- pronunciation assessment data where server-backed
- entitlement/account status
- existing cloud APIs and their current business rules

### Local/Desktop-Owned State

The following should become local-first desktop state:

- active vault selection
- notes file tree state
- note tabs
- command palette history
- plugin installation and activation state
- workbench layout state
- plugin settings
- vault metadata

### Shared/Bridged Domain Integrations

The following remain feature-domain data, but the notes workbench should consume them locally in a desktop-friendly way:

- sentencebook records
- wordbook records
- note insertions derived from those collections

The implementation should preserve their current business meaning while adapting their presentation and insertion workflow inside the desktop notes workbench.

## Desktop Bridge Design

The desktop bridge must not be an ad hoc set of scattered IPC calls.

Instead, define stable capability interfaces such as:

- `files`
- `vault`
- `window`
- `commands`
- `plugins`

Optional later expansion may include:

- `menu`
- `shell`
- `clipboard`
- `dialog`

### Requirements for the Desktop Bridge

- renderer code should depend on explicit interfaces rather than direct raw IPC calls
- desktop failures should surface as structured app-level errors
- new desktop capabilities should extend the bridge instead of adding one-off hacks
- the bridge should remain compatible with the existing multi-platform abstractions where possible

This keeps the renderer stable and makes the desktop layer safer to maintain.

## Notes Storage Evolution

### Current Direction

The current notes implementation already uses a `NotesStorage` abstraction and supports browser/mobile variants.

### Required Evolution

Expand this abstraction into a multi-runtime model:

- web
- mobile
- desktop

The desktop variant should use `Electron IPC + Node filesystem access` instead of browser directory-picker APIs.

This allows:

- reuse of current note-facing abstractions
- minimal disruption to notes UI logic
- cleaner parity across `web / mobile / desktop`

## Plugin System Design

### Product Goal

Plugins should work in a way similar to Obsidian:

- users install plugins themselves
- plugins live in a plugin directory inside local app/vault metadata
- users can enable or disable plugins
- plugins can contribute commands, panels, and note actions

### First-Phase Plugin Scope

Plugins should primarily extend the notes workbench and desktop workflow, not the core training product.

Supported first-phase plugin contribution types:

- commands
- note-side panels
- note editor actions
- vault automations
- note content enhancements

### Plugin Safety Constraint

The plugin system must be additive.

Core built-in capabilities such as:

- autosave
- note create/delete
- markdown editing
- sentencebook insertion
- wordbook insertion

must continue to work even if no plugins are installed or if a plugin fails.

### Plugin Failure Behavior

If a plugin fails:

- the failure should be visible to the user
- the plugin should be disable-able
- notes baseline functionality must still work
- core training functionality must remain unaffected

## Existing Feature Preservation

The following existing capabilities must be preserved:

- login/register/demo flows
- session-aware routing
- workspace creation/preparation
- audio playback
- voice recording
- pronunciation assessment
- sentencebook
- wordbook
- notes authoring
- local persistence
- exports
- notifications
- billing/entitlement architecture already added to the project

Desktopization must not remove or regress any of these behaviors.

## UI/UX Direction

### Notes Workbench

The notes experience should look and behave like a local desktop workbench:

- vault-first
- file-tree oriented
- tabbed notes
- command palette
- contextual side panels
- desktop-native affordances for folder selection and local state

### Core Product Areas

The rest of the app should remain familiar.

This means:

- preserve current workflows
- preserve current user mental model
- avoid turning every page into an Obsidian clone
- keep notes enhancement scoped to notes

## Error Handling

Desktop-native failures must be handled at the platform boundary and surfaced clearly.

Key failure categories:

- missing vault path
- permissions errors
- file read/write failures
- plugin manifest/load failures
- command registration failures
- bridge/version mismatches

Implementation expectations:

- provide user-readable messages
- preserve the rest of the screen where possible
- avoid silent failure
- isolate plugin failures from baseline notes behavior
- isolate notes/desktop failures from core training flows

## Testing Strategy

### Unit Tests

Add tests for:

- desktop bridge capability modules
- vault service behavior
- notes desktop storage adapter behavior
- plugin manifest parsing
- plugin enable/disable state handling
- command registration logic

### Component Tests

Add or update tests for:

- notes file tree behavior
- tab behavior
- note selection
- autosave in desktop-backed notes flows
- wordbook insertion in the new notes shell
- sentencebook insertion in the new notes shell
- plugin-provided panel rendering boundaries

### Integration / E2E Tests

Verify:

- notes workbench desktop flows
- vault open/create/select flow
- note create/edit/delete flow
- plugin activation/deactivation flow
- no regression in `workspace`
- no regression in `assessment`
- no regression in auth flows

### Manual Self-Verification

Before declaring success, manually verify at least:

- desktop app launches
- vault can be selected
- note tree renders correctly
- notes autosave locally
- tabs behave correctly
- sentencebook insertion still works
- wordbook insertion still works
- plugin install/enable/disable works
- plugin failure does not break the notes baseline
- workspace core training flow still works
- assessment flow still works

## Review Gate

After implementation:

- run automated verification
- run manual self-checks
- perform an explicit review pass focused on:
  - functional regressions
  - cloud/local state boundary violations
  - plugin isolation failures
  - unsafe desktop bridge coupling

Work should not be considered complete until this review pass is done.

## Risks

### Risk: notes gradually take over the product

Mitigation:

- keep notes explicitly defined as a training-assistant workbench
- keep core training areas structurally separate

### Risk: cloud and local ownership become mixed

Mitigation:

- define cloud-owned vs local-owned state early
- enforce this split in adapters and service boundaries

### Risk: renderer starts depending on raw IPC

Mitigation:

- create stable desktop capability interfaces
- prohibit scattered direct IPC calls in feature code

### Risk: plugin system destabilizes the main product

Mitigation:

- keep plugin scope focused on notes/desktop extension points in phase one
- isolate plugin failures from core product behavior

### Risk: desktop rewrite pressure expands scope

Mitigation:

- reuse current modules with desktop adapters
- avoid rewriting business logic unless strictly necessary

## Implementation Notes

- Implementation should proceed as a desktop-capability upgrade, not a product rewrite.
- Reuse current abstractions whenever possible, especially around notes storage and existing feature modules.
- Favor new desktop adapters and services over broad rewrites.
- Keep file sizes and module boundaries focused.
- The current project folder is not inside a Git repository, so the usual commit step is not available unless Git is initialized later.

## Review Constraint

- Subagent-based spec review was not run because this session does not have explicit user permission to delegate work to subagents.
