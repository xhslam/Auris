# Note embedded browser engineering trajectory

## Interpretation and decomposition

Add VMark's default-enabled embedded-browser experience to the Auris desktop Note workspace, while reusing Auris's existing hardened Electron browser stack instead of copying VMark's Tauri/Rust platform layer. The work was split into native-view hosting and bounds IPC, trusted main-renderer bridge exposure, Note workspace chrome/entry, and regression coverage.

Reference inspected: VMark `v0.9.41` at commit `2899b0ec652c`, especially its browser tab discriminator, active surface mounting, native-view bounds reporting, and default-on browser setting.

## Implementation path

- Reused Auris `WebContentsView` pages, partitions, navigation policy, crash handling, Human/AiSandbox/AiShared modes, and approval flow. This retains the security model already exercised by Auris.
- Added an `embedded` host kind to the browser window manager. It binds a browser registry window to the trusted main Electron window without owning or closing that window.
- Added strict `setViewport` IPC. The Note renderer reports `getBoundingClientRect()` bounds through `ResizeObserver`, window resize, and layout-version changes; hidden workspaces report a zero-sized invisible viewport.
- Kept the final embedded page alive when leaving Browser so reopening Note Browser is instant. Standalone browser-window persistence and lifecycle remain independent.
- Added a Note bottom-corner entry and `notes.browser` command-palette command. The embedded chrome reuses Auris's tabs/address controls and opens VMark's DuckDuckGo default in Human mode.
- In Browser mode, hide the Note-only workspace rail, properties pane, and terminal pane so the browser fills everything after the persistent app sidebar. Reserve only the exact 26px bottom-control strip because Electron's native page layer cannot render underneath HTML controls.
- Removed the app update indicator's dedicated grid column. Its 30px button now floats at the top-right, allowing browser and other page surfaces to extend behind it to the right edge.
- Turned that floating control into a persistent update-center entry. It deep-links to `Settings → About → Updates`, also switches an already-mounted Settings page, starts a manual check immediately in packaged builds, and routes stalled work through recovery before retrying.
- Added an explicit updater `supported` capability. Development Electron builds stay idle and show a truthful development-mode panel plus releases link; packaged builds retain the GitHub provider check/download/install state machine.

## Files and roles

- `electron/browser/browser-window-manager.cjs`: embedded host lifecycle, controller ownership, last-tab protection, standalone/embedded separation.
- `electron/browser/browser-surface-manager.cjs`: exact per-window viewport layout/visibility and page-title events.
- `electron/browser/browser-ipc.cjs`, `electron/preload.cjs`, `src/features/browser/browser-bridge.ts`: bounded main-renderer browser bridge and strict viewport contract.
- `electron/main.cjs`: attach the embedded browser registry host after browser subsystem startup and on macOS main-window recreation.
- `src/components/notes-v2/notes-embedded-browser.tsx` and `.css`: embedded browser chrome, default page, native-stage measurement, Note return behavior.
- `notes-workbench.tsx`, `notes-workbench-bottom-left.tsx`, `use-notes-command-infrastructure.ts`: Note surface switch and entry points.
- `src/app/globals.css`: make the update indicator a floating 30px control instead of a full-height grid rail.
- `electron/updates/app-updater.cjs`, `electron/main.cjs`: prevent unsupported development checks from hanging, expose updater capability, and report Auris's manifest version instead of Electron's runtime version in development.
- `app-update-indicator.tsx`, `app-update-panel.tsx`, `auris-settings.tsx`, update store/hooks/bridge types: persistent clickable entry, About deep link, one-click check/recovery, development-mode fallback, and styled releases action.
- Update tests: unsupported-controller behavior, idle/development indicator behavior, deep-link navigation, and automatic check dispatch.
- Browser/Note/preload tests: manager, surface, IPC parsing, preload exposure, viewport cleanup, last-page behavior, and workbench switching.

## Checks and results

- Focused and adjacent browser/Note suites: 359 tests passed across 23 files.
- Earlier full browser sweep: 644 passed; its allowlist expectation was updated for `setViewport`. One unrelated pre-existing approval test still expects `PAYLOAD_MISMATCH` but implementation returns `OWNER_MISMATCH`.
- `npm run build`: passed, including production TypeScript and `/notes` route generation.
- `npm run quality:desktop-ipc`: passed (`103` invokes, `105` handlers).
- Targeted ESLint and `node --check` for changed sources: passed.
- Desktop dev launch: passed; startup log recorded `browser-embedded:attached browser-window-1` and no uncaught startup error.
- Focused updater/settings/frame regression: 55 tests passed across 5 files.
- A fresh production `npm run build`, desktop IPC contract check, targeted ESLint, CommonJS syntax checks, and `git diff --check` all passed after wiring the update entry.

Full-repository `tsc --noEmit` and ESLint remain red on existing unrelated test-fixture typing and root CommonJS lint violations. Production build TypeScript passes.

## Problems and resolution

- A first test command used pnpm in this npm/`package-lock.json` repository, which moved dependencies into pnpm's ignored area. The process was stopped, dependencies were restored with npm, and Electron's skipped install script was repaired with `npm rebuild electron` before desktop verification.
- The initial layout-effect design hid the native view on every layout-version change. It was split into a mount/unmount observer and a separate re-measure effect so terminal/sidebar changes update bounds without a hide/show flicker.
- Closing a main window exposed an Electron teardown ordering bug: reading `hostWindow.webContents` inside `closed` can throw after destruction. The sender identity is now captured when the embedded host attaches and reused during cleanup.
- `electron-updater` logs a development-build skip but can leave its check promise unsettled. The watchdog then mislabeled a normal development session as stalled and rendered the red `!`. Capability gating now stops before entering `checking`, so no in-flight operation or false stall exists.
- The development-mode early return originally omitted the update panel's colocated CSS, producing a native-looking releases button. The style element is now included in both full and fallback renders.

## Remaining risks and follow-up

- Embedded tabs survive Note/Browser switching during the app session but are not restored as embedded tabs after an app restart. Persisting embedded sessions needs a host-kind-aware repository schema to avoid restoring them as standalone windows.
- Desktop startup was exercised on macOS. Windows/Linux use the same Electron `WebContentsView` path but still need packaged smoke coverage.
- The feature is always available in the desktop Note UI, matching VMark's default-on direction; there is not yet a user-visible Auris enable/disable setting.
- In-place macOS updating still requires a real Developer ID signature. The current ad-hoc local build deliberately falls back to the GitHub releases page; Windows and properly signed packaged builds use the download/install path.
