# Auris VMark Port Phase 5: Nia and Workflows Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver VMark-compatible built-in AI under the name Nia, preserve legacy Genie imports, implement the wired Nia YAML pipeline family, and complete the previously unwired browser Markdown workflow runtime under the Phase 4 authority model.

**Architecture:** Nia is a trusted UI and orchestration client, never a browser authority. Provider execution lives behind typed main-process adapters with bounded CLI/REST behavior and Keychain-backed credentials. Nia YAML workflows run pure/action steps through a registry; browser Markdown workflows compile to explicit browser commands and must reacquire/reauthorize every attempt, replay, retry, or self-heal proposal.

**Tech Stack:** React, TypeScript, Zod, YAML 2.8, Electron IPC, Node `spawn`, REST streaming, SQLite, Vitest, component/integration/Electron tests.

---

## Preconditions

- Phases 1–4 and all authority/macOS gates pass.
- Review pinned VMark changes in provider, Genie, and workflow paths before porting.
- No Knowcraft integration in this phase.
- Keep the two workflow families visibly and structurally distinct; do not reinterpret a browser Markdown workflow as Nia YAML or vice versa.

## Task 1: Define canonical Nia and legacy Genie file contracts

**Files:**

- Create: `auris/src/features/nia/nia-schema.ts`
- Create: `auris/src/features/nia/nia-parser.ts`
- Create: `auris/electron/shared/nia-definition-contract.cjs`
- Create: `auris/electron/shared/nia-definition-contract.d.cts`
- Create: `auris/src/features/workflows/nia-workflow-schema.ts`
- Create: `auris/tests/unit/nia/nia-parser.test.ts`
- Create: `auris/tests/unit/nia/nia-definition-cross-runtime.test.ts`
- Create: `auris/tests/fixtures/nia/nia-v1.md`
- Create: `auris/tests/fixtures/nia/genie-v1.md`
- Create: `auris/tests/fixtures/nia/genie-v0.md`
- Modify: `auris/docs/vmark-port/manifest.json`

- [ ] Write failing parser tests for canonical frontmatter `nia: v1`, definition scope, optional supported model override, canonical steps `uses: nia/<name>`, legacy `genie: v1`, `uses: genie/*`, and unversioned v0 Genie definitions.
- [ ] Add rejection tests for conflicting `nia`+`genie`, unsupported versions, duplicate IDs, unknown keys, YAML aliases/bombs, overlarge documents, recursive structures, invalid step references, and path traversal.
- [ ] Run `npm run test -- tests/unit/nia/nia-parser.test.ts`; expect failure.
- [ ] Implement the canonical strict Markdown/frontmatter parse → normalize flow in packaged `electron/shared/nia-definition-contract.cjs` with declarations in `.d.cts`. Preserve source diagnostics but normalize all accepted legacy inputs to one internal Nia v1 AST with a `sourceCompatibility` marker; `nia-schema.ts`/`nia-parser.ts` are thin typed adapters, not duplicate validators.
- [ ] Add CJS/TS parity plus forged-AST tests: main accepts raw Markdown or a trusted stored file reference, reparses with the packaged contract, and ignores/rejects renderer-supplied normalized IDs, scope, model, provenance, or compatibility markers.
- [ ] Serialize/export only canonical `nia: v1` and `uses: nia/*`; never silently rewrite source files during import.
- [ ] Update manifest mappings and rerun tests.
- [ ] Commit: `git commit -m "feat: define Nia and legacy Genie compatibility"`.

## Task 2: Build canonical/legacy-aware Nia definition storage

**Files:**

- Create: `auris/src/features/nia/built-in-definitions.ts`
- Create: `auris/src/features/nia/nia-definition-registry.ts`
- Create: `auris/electron/nia/nia-definition-store.cjs`
- Create: `auris/tests/unit/nia/nia-definition-registry.test.ts`
- Create: `auris/tests/unit/electron/nia/nia-definition-store.test.ts`
- Modify: `auris/docs/vmark-port/manifest.json`

- [ ] Write failing lookup tests for built-in and installed definitions referenced by canonical `nia/<name>` and legacy `genie/<name>`, with provenance and normalized graph labels always displayed as Nia.
- [ ] Write failing install/uninstall tests for canonical Nia, Genie v1, and unversioned Genie v0 files; cover atomic writes, path traversal, invalid definitions, duplicate install, built-in protection, and uninstall by canonical identity.
- [ ] Add collision tests for canonical-vs-legacy aliases, built-in-vs-user definitions, case/Unicode-normalized names, and two legacy files normalizing to one ID. Never overwrite silently; return an actionable conflict.
- [ ] Add export tests proving installed/imported legacy definitions serialize only canonical `nia: v1`, and workflow graph labels/lookup never emit a new `genie/*` reference.
- [ ] Run both tests and confirm failure.
- [ ] Implement immutable built-in definitions plus an injected filesystem store outside source code at runtime. The CJS store reparses raw source with `electron/shared/nia-definition-contract.cjs`, preserves source provenance, and writes through temp-file+rename semantics; it never consumes renderer-normalized AST as authority.
- [ ] Update the manifest for every mapped upstream built-in/registry path, rerun tests, and commit: `git commit -m "feat: add Nia definition repository compatibility"`.

## Task 3: Add provider configuration and secret references

**Files:**

- Create: `auris/electron/nia/nia-provider-store.cjs`
- Create: `auris/src/features/nia/provider-contract.ts`
- Create: `auris/src/features/nia/provider-schema.ts`
- Create: `auris/tests/unit/electron/nia/nia-provider-store.test.ts`
- Create: `auris/tests/unit/nia/provider-schema.test.ts`
- Modify: `auris/electron/security/keychain-secret-store.cjs`

- [ ] Write failing tests for REST and CLI provider definitions, model selection, bounded defaults, enabled/disabled state, corrupt config normalization, and no plaintext keys/tokens in localStorage/settings/JSON/SQLite.
- [ ] Add selection tests enforcing exactly one active default provider, atomic provider switching, and per-definition model override only when the chosen provider reports that model as supported.
- [ ] Add secret-lifecycle tests proving REST keys are process-memory-only by default; only an explicit `rememberOnThisMac` action writes an opaque Keychain reference; turning remember off deletes the saved secret; UI/config never infers remember from a previously found key.
- [ ] Reject every user-supplied executable path/raw flag, shell string, dynamic env name, workspace cwd, unbounded timeout/output, URL credential, non-HTTPS remote REST endpoint, and unknown provider capability. CLI config selects only a fixed audited adapter ID from Task 4.
- [ ] Run tests and confirm failure.
- [ ] Implement provider metadata persistence separately from secrets. Keep the active REST key in a nonserializable in-memory store by default; reuse the Keychain-backed adapter with a Nia namespace only after explicit “remember on this Mac”.
- [ ] Model capability truthfully: streaming, tool-mode-disable support, cancellation, attachments, max input/output. Providers with unavoidable independent tool authority require explicit risk acceptance or remain unavailable.
- [ ] Rerun tests and commit: `git commit -m "feat: add secure Nia provider configuration"`.

## Task 4: Implement bounded REST and CLI provider adapters

**Files:**

- Create: `auris/electron/nia/nia-provider-runtime.cjs`
- Create: `auris/electron/nia/nia-rest-provider.cjs`
- Create: `auris/electron/nia/nia-rest-protocols.cjs`
- Create: `auris/electron/nia/nia-cli-provider.cjs`
- Create: `auris/electron/nia/nia-cli-registry.cjs`
- Create: `auris/electron/nia/nia-model-discovery.cjs`
- Create: `auris/electron/nia/nia-ipc.cjs`
- Modify: `auris/electron/browser/browser-preload.cjs`
- Modify: `auris/electron/preload.cjs`
- Modify: `auris/src/platform/desktop/desktop-bridge.ts`
- Create: `auris/src/features/nia/nia-bridge.ts`
- Create: `auris/tests/unit/electron/nia/nia-rest-provider.test.ts`
- Create: `auris/tests/unit/electron/nia/nia-rest-protocols.test.ts`
- Create: `auris/tests/unit/electron/nia/nia-cli-provider.test.ts`
- Create: `auris/tests/unit/electron/nia/nia-cli-registry.test.ts`
- Create: `auris/tests/unit/electron/nia/nia-model-discovery.test.ts`
- Create: `auris/tests/unit/electron/nia/nia-ipc.test.ts`
- Create: `auris/tests/unit/nia/nia-bridge.test.ts`
- Create: `auris/tests/integration/nia-provider-runtime.test.ts`

- [ ] Write protocol fixture tests for Anthropic Messages, OpenAI Responses/Chat as required by the pinned VMark behavior, generic OpenAI-compatible services, Google AI, and Ollama-compatible endpoints. For each, cover request translation, streaming/nonstream response parsing, typed provider errors, model override, malformed shapes, and secret-free logs.
- [ ] Write REST transport tests for fixed configured endpoint/model and HTTPS enforcement. In production, plain HTTP is allowed only for an explicitly configured Ollama-compatible provider whose resolved destination remains loopback on every redirect; all other HTTP/private destinations fail. Cover allowed headers, streaming chunks, timeout, cancellation, response-size cap, non-2xx safe error, and bounded retry.
- [ ] Write failing CLI tests proving executable plus argv are fixed from validated configuration, `shell: false`, prompt via stdin, dedicated non-workspace temp cwd, minimal env allowlist, bounded stdout/stderr, timeout, cancellation, process-tree termination, and no secret in argv.
- [ ] Add fixed-registry detection/version/generation-only-mode tests for the supported Claude, Codex, and Gemini CLI adapters. Detection searches only documented executable names/locations, never accepts a user path, and reports agentic/unavailable when tool mode cannot be disabled.
- [ ] Add safe model discovery and connection-test fixtures for all REST protocols and supported CLIs; cap model count/name length/time, never send a real prompt during discovery, and return typed availability without logging credentials.
- [ ] Add adversarial CLI fixtures that try command substitution, shell metacharacters, cwd file reads, inherited token discovery, stderr flooding, and child-process persistence.
- [ ] Run the test files and confirm failure.
- [ ] Write IPC/bridge tests for fixed channel allowlists in both narrow preloads. Accept only the registered browser-chrome renderer or the registered main Notes renderer; bind every run/subscription/cancel to the originating `webContents.id` plus owning window; reject spoofed caller IDs and cross-window cancel/subscribe attempts.
- [ ] Implement both adapters behind one async event protocol: `started`, `delta`, `completed`, `failed`, `cancelled`. Generate run IDs in main and bind them to either trusted originating renderer—not to renderer-supplied identity.
- [ ] On originating renderer navigation/destroy, cancel its provider runs, terminate subprocess/HTTP work, remove subscriptions, and discard late deltas. Prove a Notes caller cannot impersonate browser chrome and one trusted window cannot cancel another's run.
- [ ] If provider tool mode cannot be disabled, enforce the stored explicit risk decision before launch and surface it in Nia UI state.
- [ ] Rerun unit tests plus `npm run test:integration -- tests/integration/nia-provider-runtime.test.ts` and commit: `git commit -m "feat: execute bounded Nia providers"`.

## Task 5: Build the complete Nia interaction surface

**Files:**

- Create: `auris/src/features/nia/nia-context.ts`
- Create: `auris/src/features/nia/use-nia-session.ts`
- Create: `auris/src/features/nia/nia-history.ts`
- Create: `auris/src/components/nia/nia-panel.tsx`
- Create: `auris/src/components/nia/nia-composer.tsx`
- Create: `auris/src/components/nia/nia-response.tsx`
- Create: `auris/src/components/nia/nia-provider-settings.tsx`
- Create: `auris/src/components/nia/nia-apply-review.tsx`
- Modify: `auris/src/components/browser-window/browser-window-shell.tsx`
- Modify: `auris/src/components/notes-v2/notes-workbench.tsx`
- Modify: `auris/src/components/notes-v2/use-notes-workbench.ts`
- Modify: `auris/src/features/notes/workbench/notes-workbench.facade.ts`
- Create: `auris/tests/component/nia/nia-panel.test.tsx`
- Create: `auris/tests/component/nia/nia-provider-settings.test.tsx`
- Create: `auris/tests/unit/nia/nia-context.test.ts`
- Create: `auris/tests/component/notes/notes-nia-apply.test.tsx`

- [ ] Write failing component tests for prompt submit, provider/model selection, streaming, stop, retry, failure, history navigation, browser context attachment, safe Markdown rendering, copy, and explicit apply/review.
- [ ] Write context tests for explicit selection, whole document with revision, and workflow-step inputs/outputs; enforce size limits, provenance, empty/stale selection behavior, and no implicit full-document/page capture.
- [ ] Write Notes integration tests for preview, replace selection, insert at cursor, apply as revision-safe document proposal, copy, and discard. Stale document/selection revisions must stop and request review rather than editing current content.
- [ ] Add tests that browser context is a bounded evidence/reference selection, not automatic full-page capture; secret fields, lease tokens, and session data never render.
- [ ] Run component tests and confirm failure.
- [ ] Implement the shared Nia panel in browser chrome and the existing Notes workbench. Keep visual treatment consistent with Auris: warm mint, light panels, restrained status indicators, no dark console default.
- [ ] Render model output as sanitized Markdown. Browser mutations use the operation guard; Notes replace/insert/apply use the existing editor facade, explicit preview, and revision checks. Model text never directly mutates page or vault.
- [ ] Persist bounded conversation metadata/content locally only when the user enables history; store no provider secret or browser authority.
- [ ] Rerun tests and commit: `git commit -m "feat: add the Nia browser assistant UI"`.

## Task 6: Implement the Nia YAML workflow registry and runner

**Files:**

- Create: `auris/electron/shared/nia-workflow-contract.cjs`
- Create: `auris/electron/shared/nia-workflow-contract.d.cts`
- Create: `auris/src/features/workflows/nia-action-registry.ts`
- Create: `auris/src/features/workflows/nia-workflow-runner.ts`
- Create: `auris/src/features/workflows/nia-workflow-events.ts`
- Create: `auris/electron/workflows/nia-workflow-runtime.cjs`
- Create: `auris/src/features/workflows/workflow-file-router.ts`
- Create: `auris/tests/unit/workflows/nia-action-registry.test.ts`
- Create: `auris/tests/unit/workflows/nia-workflow-runner.test.ts`
- Create: `auris/tests/unit/workflows/workflow-file-router.test.ts`
- Create: `auris/tests/unit/workflows/nia-workflow-cross-runtime.test.ts`
- Create: `auris/tests/unit/electron/workflows/nia-workflow-runtime.test.ts`
- Create: `auris/tests/fixtures/workflows/nia-pipeline-v1.yaml`
- Create: `auris/tests/fixtures/workflows/genie-pipeline-v1.yaml`

- [ ] Write failing registry tests for `nia/prompt`, `nia/template`, `nia/choose`, `nia/transform`, and explicitly approved `action/*` adapters; unknown actions fail before execution.
- [ ] Add a `uses: nia/<name>` execution test proving the runner resolves the canonical/legacy-aware definition repository, supplies workflow-step context, honors an allowed model override, and emits typed output without granting browser authority.
- [ ] Write failing runner tests for declared dependencies/topological ordering, input interpolation without code evaluation, immutable typed outputs, conditional branches, per-step approvals, cancellation, provider failure, max steps/depth/runtime/output, dependency cycles, skipped dependencies, and deterministic event sequence.
- [ ] Add legacy fixtures that normalize `uses: genie/*` to the same runner while preserving compatibility diagnostics.
- [ ] Add file-router tests that select Nia YAML only for `.yaml`/`.yml` pipeline form and browser workflows only for Markdown frontmatter form; reject a YAML pipeline renamed `.md`, a browser workflow renamed `.yaml`, and ambiguous mixed-family content.
- [ ] Run tests and confirm failure.
- [ ] Implement the canonical Nia YAML parser, schema, action vocabulary, dependency scheduler, and typed event/result contract in packaged `electron/shared/nia-workflow-contract.cjs`; expose declarations through `.d.cts`. The TypeScript registry/runner are thin UI adapters over that module, not a second engine.
- [ ] Implement the main-process `nia-workflow-runtime.cjs` over the same shared engine. It receives raw YAML or a trusted stored definition reference, parses again in main, owns `runId`/cancellation, and routes every `action/*` browser/Notes effect through existing approval/review services.
- [ ] Add CJS/TS parity tests and forged-renderer tests proving a caller-supplied AST, resolved action, operation token, dependency output, or payload hash is ignored/rejected and cannot bypass main parsing or authority.
- [ ] Implement an allowlisted action registry and dependency-aware sequential scheduler. Validate every step input/output against its declared type.
- [ ] Never use `eval`, `Function`, shell interpolation, arbitrary module loading, or workflow-defined executable paths.
- [ ] Rerun tests and commit: `git commit -m "feat: run Nia YAML workflows"`.

## Task 7: Define and validate browser Markdown workflows

**Files:**

- Create: `auris/electron/shared/browser-workflow-contract.cjs`
- Create: `auris/electron/shared/browser-workflow-contract.d.cts`
- Create: `auris/src/features/workflows/browser-workflow-schema.ts`
- Create: `auris/src/features/workflows/browser-workflow-parser.ts`
- Create: `auris/src/features/workflows/browser-workflow-compiler.ts`
- Create: `auris/src/features/workflows/browser-workflow-step-policy.ts`
- Create: `auris/tests/unit/workflows/browser-workflow-parser.test.ts`
- Create: `auris/tests/unit/workflows/browser-workflow-compiler.test.ts`
- Create: `auris/tests/unit/workflows/browser-workflow-cross-runtime.test.ts`
- Create: `auris/tests/fixtures/workflows/browser-research.md`
- Create: `auris/tests/fixtures/workflows/browser-hostile.md`

- [ ] Write failing parser tests for frontmatter `site`, typed inputs, trigger, and step types `api`, `action`, `goal`, `confirm`, `extract`.
- [ ] Add rejection tests for unknown step, arbitrary JavaScript, unsafe schemes, unbounded loops/retries, undeclared secret interpolation, traversal, YAML bombs, oversized selectors/payloads, and missing confirmation around sensitive actions.
- [ ] Run tests and confirm failure.
- [ ] Implement the canonical strict parser, schema, compiler, and step vocabulary in packaged `electron/shared/browser-workflow-contract.cjs`; TypeScript schema/parser/compiler files are typed UI adapters over that one runtime module. Add CJS/TS parity tests for every valid/invalid fixture.
- [ ] Compile typed step intents plus explicit approval points. Map `action` to closed Browser commands, `extract` to `read`, `confirm` to a mandatory human pause, `goal` to a bounded Nia proposal that must be compiled/reviewed before execution, and `api` to the guarded API service in Task 8. Keep secret input as opaque slots; never put secret values into compiled/logged workflow documents.
- [ ] Mark each compiled page target with expected origin, generation/ref semantics, and operation. Compilation grants no authority.
- [ ] Rerun tests and commit: `git commit -m "feat: compile browser Markdown workflows"`.

## Task 8: Complete the browser workflow runtime with fresh authorization

**Files:**

- Create: `auris/electron/workflows/browser-workflow-runtime.cjs`
- Create: `auris/electron/workflows/browser-workflow-api-service.cjs`
- Create: `auris/electron/workflows/workflow-run-registry.cjs`
- Create: `auris/electron/workflows/workflow-ipc.cjs`
- Modify: `auris/electron/browser/browser-preload.cjs`
- Modify: `auris/electron/preload.cjs`
- Modify: `auris/src/platform/desktop/desktop-bridge.ts`
- Create: `auris/src/features/workflows/workflow-bridge.ts`
- Create: `auris/tests/unit/electron/workflows/browser-workflow-runtime.test.ts`
- Create: `auris/tests/unit/electron/workflows/browser-workflow-api-service.test.ts`
- Create: `auris/tests/unit/electron/workflows/workflow-ipc.test.ts`
- Create: `auris/tests/unit/workflows/workflow-bridge.test.ts`
- Create: `auris/tests/integration/browser-workflow-runtime.test.ts`
- Modify: `auris/electron/browser/browser-operation-guard.cjs`

- [ ] Write failing tests for stable `runId`, explicit window/tab acquisition, step events, cancellation, timeout, disconnect, lease release, window/tab close, and no authority persistence.
- [ ] Add mandatory tests that replay, retry, resume, redirect, ref refresh, and every self-heal attempt reacquire current control and reauthorize the exact origin/op/target/payload; old approval IDs/one-shots cannot replay.
- [ ] Add concurrency tests for two runs on different tabs and conflicting runs on one tab.
- [ ] Add API-step tests: HTTPS only; declared destination and method; the Phase 4 DNS/redirect policy; no ambient browser cookies or host environment; bounded request/response; opaque secret-reference injection in memory; `GET`/`HEAD` authorized as `read`; mutating methods authorized as exact destination/method/body-bound `publish`; unknown outcome pauses for human review and is never automatically replayed.
- [ ] Add first-run tests for untrusted/imported workflows: show normalized source, requested origins/operations/providers/secrets, require human review, and persist only the review decision—not execution authority.
- [ ] Add fixed-channel workflow IPC tests for both trusted renderer classes, run ownership, cross-window spoof/cancel rejection, event subscription/unsubscribe, renderer navigation/destroy cancellation, and late-event discard. Expose only validate/start/get_state/cancel/subscribe through the two existing narrow preloads.
- [ ] Add forged-AST tests proving the runtime accepts raw Markdown or a trusted stored file reference only, reparses/recompiles with `electron/shared/browser-workflow-contract.cjs` in main, derives operations/payload hashes itself, and rejects renderer-supplied compiled intents.
- [ ] Run tests and confirm failure.
- [ ] Implement the runtime as a state machine that invokes the same Browser command dispatcher as MCP. Do not call `webContents` directly from workflow code.
- [ ] Implement API steps through a bounded main-process service that reuses the navigation destination guard and operation authority; do not emulate API calls with arbitrary page JavaScript.
- [ ] Treat a cancelled/timed-out/disconnected write-like step as an unknown outcome and stop for human reconciliation before any retry.
- [ ] Persist workflow definitions and nonsensitive run summaries only; never persist lease token, attachment, grant, approval, ref, secret input, or parked callback.
- [ ] Rerun unit tests plus `npm run test:integration -- tests/integration/browser-workflow-runtime.test.ts` and commit: `git commit -m "feat: complete browser workflow execution runtime"`.

## Task 9: Implement trusted recording and reviewed self-healing

**Files:**

- Create: `auris/electron/workflows/browser-workflow-recorder.cjs`
- Create: `auris/src/features/workflows/workflow-redaction.ts`
- Create: `auris/src/features/workflows/workflow-self-heal.ts`
- Create: `auris/src/components/nia/workflow-recorder-panel.tsx`
- Create: `auris/src/components/nia/workflow-heal-review.tsx`
- Modify: `auris/src/components/nia/nia-panel.tsx`
- Create: `auris/tests/unit/electron/workflows/browser-workflow-recorder.test.ts`
- Create: `auris/tests/unit/workflows/workflow-self-heal.test.ts`
- Create: `auris/tests/component/nia/workflow-heal-review.test.tsx`
- Modify: `auris/tests/component/nia/nia-panel.test.tsx`

- [ ] Write failing recorder tests that capture trusted main/browser events rather than page-world flags. Every typed value—password, file, auth, ordinary text/search, textarea, and contenteditable—defaults to a declared opaque workflow input before its value crosses the recording boundary.
- [ ] Add tests proving typed values never enter literal workflow text, logs, screenshots, model prompts, semantic targets, or recorder events. An explicit per-step user review may opt a demonstrated non-sensitive literal into the saved workflow; page attributes and workflow defaults can never opt in on the user's behalf.
- [ ] Write self-heal tests for stale/missing target, bounded candidate proposal, human diff review, reject, accept, fresh authorization, and no silent workflow rewrite.
- [ ] Run tests and confirm failure.
- [ ] Implement recording from authoritative navigation/action outcomes plus bounded DOM descriptors. Never trust page-provided `sensitive: false` or interpolate page JavaScript.
- [ ] Implement self-heal as propose → display diff/evidence → human accept → recompile → fresh authorize → attempt. Cap candidates and attempts.
- [ ] Mount recorder state and heal review inside the shared Nia panel used by browser chrome and Notes. Test recorder start/stop, proposal event rendering, accept/reject, and subscription cleanup on panel unmount.
- [ ] Rerun tests and commit: `git commit -m "feat: add safe workflow recording and self-heal review"`.

## Task 10: Add Workflow MCP and Nia workflow UI

**Files:**

- Create: `auris/electron/mcp/workflow-tool-contract.mjs`
- Modify: `auris/electron/auris-notes-mcp-server.mjs`
- Modify: `auris/electron/notes-mcp-bridge.cjs`
- Create: `auris/electron/workflows/workflow-facade.cjs`
- Create: `auris/electron/workflows/workflow-capabilities.cjs`
- Modify: `auris/electron/workflows/workflow-ipc.cjs`
- Create: `auris/src/components/nia/workflow-library.tsx`
- Create: `auris/src/components/nia/workflow-run-view.tsx`
- Modify: `auris/src/components/nia/nia-panel.tsx`
- Modify: `auris/tests/unit/electron/auris-notes-mcp-server.test.ts`
- Create: `auris/tests/unit/electron/workflows/workflow-tool-contract.test.ts`
- Create: `auris/tests/unit/electron/workflows/workflow-facade.test.ts`
- Create: `auris/tests/unit/electron/workflows/workflow-capabilities.test.ts`
- Create: `auris/tests/component/nia/workflow-run-view.test.tsx`
- Modify: `auris/tests/component/nia/nia-panel.test.tsx`

- [ ] Write failing additive contract tests for grouped `auris_workflow` actions: list, inspect, validate, start, get_state, cancel; every request/result carries the discriminated family `nia_yaml` or `browser_markdown`; keep existing Notes/Browser tool snapshots unchanged.
- [ ] Add ownership tests so MCP can inspect/cancel only permitted runs and disconnect cancels its active runs/releases leases.
- [ ] Write facade tests that parse/validate through the appropriate packaged shared contract, route `nia_yaml` to `nia-workflow-runtime.cjs` and `browser_markdown` to `browser-workflow-runtime.cjs`, normalize events/state, and cancel either family on MCP/renderer disconnect. A Nia YAML `action/*` step that controls a page owns/releases the same run-bound lease as a browser workflow.
- [ ] Add independent capability tests: list/inspect/validate may report pure/experimental support, while `start` returns `CAPABILITY_NOT_VERIFIED` until that exact family has passed its runtime smoke. One family's verification can never enable the other.
- [ ] Run tests and confirm failure.
- [ ] Route MCP and both renderer bridges to the one main-process workflow facade with authenticated connection/caller ownership. Return approval-required/run-state events promptly; never keep the request parked for human decisions or execute a runner in renderer state.
- [ ] Build workflow library/run UI showing workflow family, compatibility source, current step, approvals, retries, cancellation, evidence, and heal proposals.
- [ ] Mount the library/run view in the shared Nia panel and drive it only through `workflow-bridge.ts`. Test start/cancel/state/event subscription from both browser and Notes hosts, owner mismatch, disconnect, and unsubscribe on panel unmount.
- [ ] Rerun tests and commit: `git commit -m "feat: expose Nia and browser workflows"`.

## Task 11: End-to-end compatibility and safety gate

**Files:**

- Create: `auris/tests/integration/nia-workflow-compatibility.test.ts`
- Create: `auris/tests/integration/browser-workflow-adversarial.test.ts`
- Create: `auris/tests/integration/workflow-facade-two-family.test.ts`
- Create: `auris/tests/electron/nia-browser-workflow-smoke.cjs`
- Modify: `auris/electron/workflows/workflow-capabilities.cjs`
- Modify: `auris/tests/unit/electron/workflows/workflow-capabilities.test.ts`
- Modify: `auris/package.json`

- [ ] Run canonical Nia, Genie v1, and Genie v0 fixtures through import and execution; assert equal normalized behavior and canonical Nia export.
- [ ] Run browser workflows through success, deny, cancel, redirect, navigation, reclaim, disconnect, retry, and self-heal paths.
- [ ] Run a real two-family facade/stdio integration: validate and start one Nia YAML run plus one browser Markdown run, exercise browser action approval from each, cancel/disconnect each owner, and prove normalized state plus lease cleanup.
- [ ] Prove a malicious CLI provider cannot access the Auris workspace/environment and a malicious workflow cannot bypass the Browser guard.
- [ ] Run `npm run test:integration -- tests/integration/nia-workflow-compatibility.test.ts tests/integration/browser-workflow-adversarial.test.ts tests/integration/workflow-facade-two-family.test.ts` and confirm all files are discovered by the integration config.
- [ ] Add `nia:workflow-smoke` and run both families with deterministic local fake REST, fixed safe CLI, and local browser fixtures; no paid/external provider is required for the gate.
- [ ] Keep both runtime flags false before the smoke. After each independent smoke passes, change only that family's main-owned capability to `runtime_verified`; add regression tests that `start` succeeds for the verified family and remains `CAPABILITY_NOT_VERIFIED` for any unverified family.
- [ ] Fix behavior until all compatibility and adversarial tests pass, then commit: `git commit -m "test: prove Nia and workflow compatibility"`.

## Task 12: Phase gate and handoff

- [ ] Run `npm run test -- tests/unit/nia tests/unit/workflows tests/unit/electron/nia tests/unit/electron/workflows tests/component/nia tests/component/notes/notes-nia-apply.test.tsx`.
- [ ] Run `npm run test:integration -- tests/integration/nia-provider-runtime.test.ts tests/integration/nia-workflow-compatibility.test.ts tests/integration/browser-workflow-runtime.test.ts tests/integration/browser-workflow-adversarial.test.ts tests/integration/workflow-facade-two-family.test.ts`.
- [ ] Run `npm run nia:workflow-smoke` and the Phase 4 browser security smoke suite on macOS.
- [ ] Run `npm run desktop:runtime-deps`, hide the workspace `node_modules`, and import all four packaged contracts from a child process rooted at `electron/`: `browser-contract.cjs`, `nia-definition-contract.cjs`, `nia-workflow-contract.cjs`, and `browser-workflow-contract.cjs`.
- [ ] Manually import one canonical Nia, one Genie v1, one unversioned Genie v0, and one browser Markdown workflow; verify names/diagnostics and canonical export.
- [ ] Manually cancel provider and workflow runs, reclaim a controlled tab, retry a denied action, and review/reject a self-heal proposal.
- [ ] Run `npm run lint`, `npm run build`, `npm run security:secrets`, and `git diff --check`.
- [ ] Refresh/review the VMark report and commit report-only changes if needed: `git commit -m "docs: record phase five VMark comparison"`.
- [ ] Handoff Phase 6 with provider capability truth, legacy import evidence, and the full workflow authorization regression results.
