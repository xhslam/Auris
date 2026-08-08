# Phase 6 handoff — VMark-compatible Browser, Nia, and workflows

Pinned provenance baseline: [`xiaolai/vmark@7c409688dc510d87183bdc46308e1ee645c2579f`](https://github.com/xiaolai/vmark/commit/7c409688dc510d87183bdc46308e1ee645c2579f).  The final reviewed comparison is [`e1eea49065282031a725d0c9387a0ce281cf5578`](https://github.com/xiaolai/vmark/commit/e1eea49065282031a725d0c9387a0ce281cf5578).

## Delivered boundary

Phase 5 completed Nia/legacy Genie definitions, bounded REST and CLI providers, Keychain-backed provider secrets, Nia YAML workflows, Browser Markdown workflows, recording, review-gated self-heal, MCP routing, Notes revision-safe apply, and Browser/Nia UI. Phase 6 completed global multi-window status, explicit window controls, concurrency/resource budgets, accessibility, documentation, VMark provenance coverage, and a real packaged-app release loop.

The release remains Electron-only. Browser authority terminates in Electron main; Nia cannot bypass browser leases, approvals, origin policy, workflow ownership, or Notes revision checks.

## Release environment

| Item | Verified value |
|---|---|
| Date | 2026-07-22 |
| Host | macOS 26.5.2 (25F84), arm64 |
| Node / npm | 24.15.0 / 11.12.1 |
| Electron | 41.2.0 |
| Branch | `codex/vmark-phase-5` |
| Packaged application | `release/mac-arm64/Auris.app` |

## Gate evidence

| Gate | Result |
|---|---|
| Browser/Nia/workflow/VMark unit + component matrix | **97 files, 931 tests passed** |
| `npm run test:integration` | **11 files, 34 tests passed** |
| Electron/browser/Nia smoke matrix | **12 commands passed** |
| Browser accessibility + lifecycle Playwright | **4 tests passed**, one worker, isolated port 3221 |
| `npm run desktop:build:verify` | passed: Next production build, 137-package audited Electron closure, unpacked macOS app, workspace-external packaged runtime/MCP smoke |
| Packaged MCP loop | Notes and Browser state read; Nia workflow completed; Browser workflow reached confirmation and cancelled; all six tools listed |
| `npm run lint` | passed with 0 errors and 3 existing unused-parameter warnings in `nia-cli-provider.test.ts` |
| `npm run security:secrets` | passed |
| `git diff --check` | passed |

The focused Vitest command was:

```sh
npx vitest run tests/unit/browser tests/unit/electron/browser tests/unit/electron/nia tests/unit/electron/workflows tests/unit/nia tests/unit/workflows tests/unit/vmark tests/unit/electron/auris-notes-mcp-server.test.ts tests/unit/electron/notes-mcp-bridge.test.ts tests/unit/electron/desktop-packaging.test.ts tests/unit/electron/electron-runtime-deps.test.ts tests/unit/electron/find-open-port.test.ts tests/unit/notes/browser-vault-client.test.ts tests/component/browser-window tests/component/desktop/browser-status-center.test.tsx tests/component/nia tests/component/notes/notes-nia-apply.test.tsx tests/component/settings/auris-settings-browser-grants.test.tsx tests/component/settings/auris-settings-browser-security.test.tsx
```

The sequential smoke commands were:

```sh
npm run browser:smoke
npm run browser:isolation
npm run browser:partition-isolation
npm run browser:human-reclaim
npm run browser:session
npm run browser:dialog-feasibility
npm run browser:ux-policy
npm run browser:crash-recovery
npm run browser:security
npm run browser:multiwindow
npm run browser:resource-budget
npm run nia:workflow-smoke
```

The packaged smoke copies the generated app under a canonicalized temporary path outside the workspace before launching it. It clears `NODE_PATH`, uses the packaged Electron binary as Node, imports contracts and workflow runtimes from `app.asar`, starts the packaged MCP sidecar, and connects to the packaged desktop bridge. This prevents a workspace `node_modules` fallback from hiding a missing release dependency.

## VMark comparison

Running the following command twice produced byte-identical reports:

```sh
npm run vmark:diff -- --upstream e1eea49065282031a725d0c9387a0ce281cf5578
```

| Report | SHA-256 |
|---|---|
| `docs/vmark-sync/latest.md` | `37b9efd65d3b0e93ef95797b6da9e62becffa8816d7e696a235c75eecfe4f615` |
| `docs/vmark-sync/latest.json` | `33fc780f14a72de08741d1b6073c484f1b6680b33eaab171786366cb30da484f` |

The comparison reports 316 changed, 341 added, and 3 deleted upstream paths; 12 manifest mappings have zero missing Auris targets and zero stale mappings. Manual review found no unresolved Browser, Nia, workflow, multi-window, or status-center change. The remaining 639 unmapped upstream paths are outside this port boundary, primarily VMark project infrastructure and coherence-layer work.

## Known repository-wide baseline outside this phase

`npm run test` is not globally green on the checked-in baseline: **262 of 269 files** and **1997 of 2003 tests** pass. The seven failing files are unrelated to Browser/Nia and were already present before this phase:

- missing `src/features/billing/billing-service` and `src/platform/notes/mobile-notes-storage` implementations;
- mobile notification/file-export tests expecting native adapters while the current implementation selects web;
- stale Notes save-label and mixed-rendering assertions;
- a stale desktop video import-button assertion.

A serial full Playwright audit likewise reaches legacy `app-smoke` expectations for absent `/login`, `/community`, `/courses`, billing, old home, and old Notes surfaces. The Phase 6 Browser/Nia accessibility and lifecycle specs pass independently (4/4) on an isolated server.

## Operator notes

- Use `npm run desktop:build:verify` for a release-blocking macOS package check. The command fails closed if the standalone server, Electron entry, runtime closure, packaged sidecar, or packaged workflow loop is incomplete.
- Agent shells must unset `ELECTRON_RUN_AS_NODE` for GUI Electron smokes; the package probe sets it only for explicit Node-mode children.
- Enable Browser automation explicitly in Settings. Named profile/cookie/localStorage replay gates retain their independent production defaults.
- Treat `docs/vmark-sync/latest.*` as a read-only comparison artifact. Updating `lastComparedCommit` remains a reviewed manifest change.
