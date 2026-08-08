# Auris VMark Port Phase 1: Provenance and Compatibility Spine Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze the VMark baseline, make upstream comparison repeatable, and establish shared browser contracts plus architecture-independent algorithms without changing live desktop behavior.

**Architecture:** A versioned manifest records many-to-many source mappings. A read-only Node report validates the manifest and compares an explicit upstream Git commit. Pure TypeScript contracts and algorithms become the single vocabulary used by later Electron, renderer, MCP, Nia, and workflow phases.

**Tech Stack:** Node.js CommonJS, Git CLI, TypeScript, Zod, Vitest, JSON/Markdown.

---

## Inputs and boundaries

- Approved spec: `docs/superpowers/specs/2026-07-17-auris-vmark-browser-nia-multiwindow-design.md`
- Baseline: `xiaolai/vmark@7c409688dc510d87183bdc46308e1ee645c2579f`
- Work only in `auris/` plus this plan's repository documentation.
- Do not fetch into or copy an upstream checkout under `auris/`; use a cache under the OS temp/cache directory.
- Do not rename `electron/auris-notes-mcp-server.mjs` or break existing MCP tool schemas.

## Task 1: Add source attribution and a validated port manifest

**Files:**

- Create: `auris/docs/vmark-port/UPSTREAM-LICENSE.txt`
- Create: `auris/docs/vmark-port/README.md`
- Create: `auris/docs/vmark-port/manifest.schema.json`
- Create: `auris/docs/vmark-port/manifest.json`
- Create: `auris/tests/unit/vmark/vmark-manifest.test.ts`

- [ ] Copy the exact ISC notice from the pinned upstream `LICENSE` into `UPSTREAM-LICENSE.txt`; record repository URL and commit in `README.md` without claiming VMark endorsement.
- [ ] Write a failing schema test that loads both JSON files and asserts schema version, pinned repository/commit, unique `mappingId`, nonempty `upstreamPaths[]`, valid `aurisPaths[]`, known disposition, and unique `(mappingId, path)` members.
- [ ] Run `cd auris && npm run test -- tests/unit/vmark/vmark-manifest.test.ts`; expect failure because the schema/manifest is incomplete.
- [ ] Implement schema version `1` with this entry shape:

```json
{
  "mappingId": "browser.url-policy",
  "upstreamPaths": ["src/lib/browser/url.ts"],
  "aurisPaths": ["src/features/browser/url-policy.ts"],
  "disposition": "adapted",
  "intentionalDifferences": ["Electron main performs final authorization"],
  "lastComparedCommit": "7c409688dc510d87183bdc46308e1ee645c2579f",
  "tests": ["tests/unit/browser/url-policy.test.ts"]
}
```

- [ ] Seed entries for all approved Phase 1–6 mapping families, allowing target files that do not exist yet but marking their phase in `intentionalDifferences`; do not invent `copied` dispositions for rewrites.
- [ ] Rerun the narrow test and confirm it passes.
- [ ] Commit only the five files: `git commit -m "docs: add VMark port provenance manifest"`.

## Task 2: Build the deterministic upstream comparison command

**Files:**

- Create: `auris/scripts/vmark-sync-report.cjs`
- Create: `auris/tests/unit/vmark/vmark-sync-report.test.ts`
- Modify: `auris/package.json`
- Create on execution: `auris/docs/vmark-sync/latest.json`
- Create on execution: `auris/docs/vmark-sync/latest.md`

- [ ] Write failing tests around an injected temporary Git fixture, not the network. Cover explicit commit resolution, changed/added/deleted/renamed paths, missing Auris targets, stale mapping commits, duplicate paths, stable key order, and no timestamp in canonical JSON.
- [ ] Add an adversarial test proving `--upstream` rejects shell fragments and accepts only a full 40-character hexadecimal commit or the explicit `origin/main` selector.
- [ ] Run `npm run test -- tests/unit/vmark/vmark-sync-report.test.ts`; expect module-not-found failure.
- [ ] Implement exported pure helpers `parseArgs`, `validateManifest`, `collectGitDiff`, and `renderReports`; keep the executable wrapper behind `if (require.main === module)`.
- [ ] Resolve the upstream cache with `os.homedir()` plus an Auris-specific cache directory or `os.tmpdir()`; invoke Git with `spawnSync(command, argv, { shell: false })` and fixed argv.
- [ ] Ensure report generation never edits source paths, and exits nonzero on invalid manifest, unresolved commit, missing Git, or comparison failure.
- [ ] Add `"vmark:diff": "node scripts/vmark-sync-report.cjs"` to `package.json`.
- [ ] Rerun the narrow tests and then run:

```bash
npm run vmark:diff -- --upstream 7c409688dc510d87183bdc46308e1ee645c2579f
git diff --exit-code -- docs/vmark-sync/latest.json docs/vmark-sync/latest.md || true
npm run vmark:diff -- --upstream 7c409688dc510d87183bdc46308e1ee645c2579f
git diff --exit-code -- docs/vmark-sync/latest.json docs/vmark-sync/latest.md
```

- [ ] Confirm the second generation is byte-stable; inspect both reports and record consciously accepted/deferred differences in the manifest.
- [ ] Commit exact files: `git commit -m "build: add deterministic VMark sync report"`.

## Task 3: Define browser IDs, tool actions, authority operations, envelopes, and typed errors

**Files:**

- Create: `auris/src/features/browser/contracts.ts`
- Create: `auris/electron/shared/browser-contract.cjs`
- Create: `auris/electron/shared/browser-contract.d.cts`
- Create: `auris/src/features/browser/schemas.ts`
- Create: `auris/src/features/browser/errors.ts`
- Create: `auris/tests/unit/browser/contracts.test.ts`
- Create: `auris/tests/unit/browser/errors.test.ts`
- Create: `auris/tests/unit/browser/browser-contract-cross-runtime.test.ts`

- [ ] Write failing table tests for the exact Browser tool-action vocabulary: `get_state`, `open`, `acquire_control`, `release_control`, `close`, `focus`, `navigate`, `wait`, `wait_for`, `read`, `screenshot`, `query`, `console`, `act`, `style`, `execute_js`, `session_save`, `session_load`.
- [ ] Separately test the exact closed authority-operation vocabulary from the approved spec: `read`, `attach`, `click`, `type`, `scroll`, `key`, `style`, `navigate`, `publish`, `upload`, `eval`, `session`. Unknown/case-shifted/whitespace-modified values fail at schema and authority boundaries.
- [ ] Add exhaustive main-owned action-to-operation mapping tests: observations map to `read`; control attachment maps to `attach`; `act` variants map to their matching operation; navigation maps to `navigate`; `style` maps to `style`; `execute_js` maps to `eval`; session actions map to `session`; evidence publication maps to `publish`; `upload` has no autonomous MCP action. Callers cannot choose a weaker operation token.
- [ ] Add failing schema cases for missing IDs, ambiguous optional target fields, negative generations/epochs, unknown action variants, oversized text/selector/key payloads, malformed URLs, and extra keys.
- [ ] Add a failing exhaustive wire-error table for every required category: `BROWSER_DISABLED`, `WINDOW_NOT_FOUND`, `TAB_NOT_FOUND`, `AMBIGUOUS_TARGET`, `STALE_NAVIGATION`, `CONTROL_STALE`, `OWNER_MISMATCH`, `NO_COMMITTED_ORIGIN`, `ORIGIN_NOT_GRANTED`, `ATTACHMENT_REQUIRED`, `LEASE_LOST`, `POLICY_STALE`, `NAVIGATION_BLOCKED`, `OPERATION_NOT_ALLOWED`, `APPROVAL_REQUIRED`, `APPROVAL_EXPIRED`, `PAYLOAD_MISMATCH`, `PROFILE_ORIGIN_CONFINED`, `TIMEOUT`, `CANCELLED`, `CONNECTION_CLOSED`, `PAGE_CRASHED`, `SESSION_NOT_FOUND`, `CAPABILITY_NOT_VERIFIED`, `WORKFLOW_INVALID`, `WORKFLOW_UNTRUSTED`, `NIA_PROVIDER_UNAVAILABLE`, and `NIA_PROVIDER_RESPONSE_INVALID`. Internal aliases such as `LEASE_REQUIRED` may exist only behind the wire mapper and must never replace the frozen public table.
- [ ] Run both tests and confirm failures before implementation.
- [ ] Implement the one canonical runtime vocabulary, strict Zod schemas, normalizers, and safe wire-error mapper in packaged `electron/shared/browser-contract.cjs`. Electron CJS requires this exact module; MCP ESM imports the same CJS default export; TypeScript files are typed thin re-exports through `browser-contract.d.cts`, not independently redefined validators.
- [ ] Add a cross-runtime test that loads the canonical module through `require`, dynamic ESM `import()`, and the TypeScript re-export, then round-trips every action/authority operation/envelope/error fixture and proves equal acceptance, rejection, and serialized output.
- [ ] Implement branded string types at compile time and strict shared schemas at runtime. Define the command envelope independent of any renderer state:

```ts
type BrowserCommandEnvelope = {
  windowId: string;
  tabId: string;
  navigationGeneration: number;
  controlEpoch: number;
  owner: { kind: "mcp" | "workflow" | "nia"; id: string };
  leaseToken: string;
  action: BrowserToolAction;
  authorityOperation: BrowserAuthorityOperation;
  target?: BrowserTargetDescriptor;
  payloadHash?: string;
};
```

- [ ] Make `authorityOperation` an internal/main-normalized field for external requests: the sidecar supplies the tool action, and main derives/rechecks the authority token immediately before guard evaluation.
- [ ] Make `src/features/browser/schemas.ts` and `contracts.ts` renderer-facing adapters only. Add a test that any local duplicate action/error array or Zod definition is forbidden; `browser-tool-contract.mjs` in Phase 3 must import the shared module rather than recreate it.
- [ ] Make public error data safe by construction: no lease tokens, credentials, raw payloads, or page bodies; implement a separate debug cause that is never serialized to MCP.
- [ ] Add user-copy mapping tests for calm actionable Chinese messages for every public category, while keeping redacted internal debug details separate.
- [ ] Rerun the narrow tests and `npm run lint -- src/features/browser tests/unit/browser`.
- [ ] Commit exact files: `git commit -m "feat: define browser authority contracts"`.

## Task 4: Port pure URL, origin, and target policy algorithms

**Files:**

- Create: `auris/src/features/browser/url-policy.ts`
- Create: `auris/src/features/browser/target-descriptor.ts`
- Create: `auris/tests/unit/browser/url-policy.test.ts`
- Create: `auris/tests/unit/browser/target-descriptor.test.ts`
- Modify: `auris/docs/vmark-port/manifest.json`

- [ ] Translate the upstream URL/origin cases into failing table tests, preserving attribution in test comments where cases are copied.
- [ ] Add Auris-specific adversarial cases for credentials in URLs, Unicode/punycode hosts, fragments, default ports, `javascript:`, `data:`, `file:`, `blob:`, external protocols, loopback aliases, and redirect destinations.
- [ ] Write failing canonicalization tests for structured target descriptors and SHA-256 payload hashes; prove object key order cannot change the hash and payload substitution does.
- [ ] Run the two test files and verify failure.
- [ ] Implement pure parsing/canonicalization only. Return decisions and redacted display URLs; do not execute navigation or authorization here.
- [ ] Update matching manifest entries with actual Auris paths/tests and the pinned `lastComparedCommit`.
- [ ] Rerun tests and lint; inspect snapshots for accidental query-secret leakage.
- [ ] Commit exact files: `git commit -m "feat: port browser URL and target policies"`.

## Task 5: Port stable refs and clean-reader algorithms

**Files:**

- Create: `auris/src/features/browser/page-observation.ts`
- Create: `auris/src/features/browser/stable-refs.ts`
- Create: `auris/src/features/browser/clean-reader.ts`
- Create: `auris/tests/unit/browser/stable-refs.test.ts`
- Create: `auris/tests/unit/browser/clean-reader.test.ts`
- Create: `auris/tests/fixtures/browser/observation-document.html`
- Modify: `auris/docs/vmark-port/manifest.json`

- [ ] Write failing DOM tests for bounded ARIA projection, deterministic refs, hidden/disabled elements, duplicate labels, shadow/iframe boundaries, oversized documents, and navigation-generation invalidation.
- [ ] Write failing clean-reader tests for headings, links, code, tables, repeated navigation chrome, script/style removal, hostile markup, and output truncation metadata.
- [ ] Run the narrow tests; confirm missing implementation failure.
- [ ] Implement pure DOM functions that accept explicit budgets. Keep the result serializable and mark refs with their generation; never embed executable page code as interpolated strings.
- [ ] Add a fixture containing password fields and secret-looking text. Assert that an explicit page read may include visible page text, while logs/metadata do not duplicate it.
- [ ] Update the manifest mappings and rerun tests/lint.
- [ ] Commit exact files: `git commit -m "feat: port bounded browser observation algorithms"`.

## Task 6: Add compatibility contract fixtures for later phases

**Files:**

- Create: `auris/tests/contracts/browser-command-cases.ts`
- Create: `auris/tests/contracts/browser-error-cases.ts`
- Create: `auris/tests/unit/browser/compatibility-fixtures.test.ts`
- Create: `auris/vitest.integration.config.ts`
- Create: `auris/tests/integration/integration-harness.test.ts`
- Modify: `auris/package.json`
- Modify: `auris/docs/vmark-port/manifest.json`

- [ ] Create failing tests that round-trip every command/result/error fixture through the strict schemas and reject unknown fields.
- [ ] Add fixtures for approval retry, ambiguous target metadata, open/acquire envelopes, and evidence bundles without implementing runtime behavior.
- [ ] Export immutable fixtures for reuse by MCP and main-process tests; freeze nested structures to prevent test mutation.
- [ ] Run the fixture test twice in random order to prove no shared mutable state.
- [ ] Add an integration harness test that requires Node environment and imports the shared contract fixtures. First run `npm run test -- tests/integration/integration-harness.test.ts` and record the expected `No test files found` failure from the current unit/component-only config.
- [ ] Create `vitest.integration.config.ts` with Node environment and `include: ["tests/integration/**/*.test.{ts,tsx}"]`; add `"test:integration": "vitest run --config vitest.integration.config.ts"` to `package.json`.
- [ ] Run `npm run test:integration -- tests/integration/integration-harness.test.ts` and confirm the test executes and passes; later phases must use `test:integration`, never the unit/component `test` script, for this directory.
- [ ] Update manifest tests paths and commit: `git commit -m "test: freeze browser compatibility fixtures"`.

## Task 6b: Assemble the packaged Electron/MCP runtime dependency closure

**Files:**

- Create: `auris/electron/runtime-dependencies.json`
- Create: `auris/scripts/assemble-electron-runtime-deps.cjs`
- Create: `auris/tests/unit/electron/electron-runtime-deps.test.ts`
- Modify: `auris/electron-builder.yml`
- Modify: `auris/package.json`
- Modify: `auris/.gitignore`

- [ ] Write failing temp-fixture tests for resolving and copying the complete production dependency closure of the audited roots `@modelcontextprotocol/sdk`, `ws`, `zod`, and `yaml`; cover scoped packages, optional/platform packages, duplicate versions, missing dependency, symlink/path escape, stable manifest, and exact cleanup limited to generated `electron/node_modules`.
- [ ] Add a failing real dry-run test proving the current packaged roots include every transitive runtime dependency needed by the stdio sidecar and the four planned `electron/shared/*.cjs` contracts (browser wire, Nia definition, Nia YAML workflow, browser Markdown workflow); no arbitrary dev dependency may enter the allowlisted closure.
- [ ] Run the narrow test and confirm failure.
- [ ] Implement `assemble-electron-runtime-deps.cjs` from the installed lock/package metadata with `shell: false` and explicit validated paths. Copy the resolved closure to generated `electron/node_modules`, write a stable inventory, and ignore that generated directory in Git.
- [ ] Add `desktop:runtime-deps` and invoke it before both existing desktop assemble/build paths. Add an explicit `electron/node_modules/**/*` include to `electron-builder.yml` so Electron/Node resolution from `electron/*.mjs|cjs` works in the packaged app.
- [ ] Run the assembler, then launch a child process from the staged `electron/` directory that imports `@modelcontextprotocol/sdk`, `ws`, `zod`, `yaml`, and the currently delivered `electron/shared/browser-contract.cjs`; expect all imports to succeed without the workspace root `node_modules` on `NODE_PATH`. Phase 5 extends the same smoke to the three workflow/Nia contracts when those files exist.
- [ ] Commit source/config/test files only, never generated `electron/node_modules`: `git commit -m "build: package Electron MCP runtime dependencies"`.

## Task 7: Phase gate and handoff

**Files:**

- Modify only if discrepancies are found: `auris/docs/vmark-port/manifest.json`
- Modify generated reports only through the command: `auris/docs/vmark-sync/latest.json`, `auris/docs/vmark-sync/latest.md`

- [ ] Run `npm run vmark:diff -- --upstream 7c409688dc510d87183bdc46308e1ee645c2579f` and review, not merely generate, both outputs.
- [ ] Run `npm run test -- tests/unit/vmark tests/unit/browser tests/unit/electron/auris-notes-mcp-server.test.ts tests/unit/electron/notes-mcp-bridge.test.ts`.
- [ ] Run `npm run test:integration -- tests/integration/integration-harness.test.ts` and confirm the integration config discovers the file.
- [ ] Run `npm run lint` and `npm run security:secrets`.
- [ ] Run `npm run build`; record any environment-only failure with the exact command and output.
- [ ] Run `git diff --check` and confirm `git status --short` contains no accidentally staged unrelated files.
- [ ] If report metadata changed after review, commit only manifest/reports: `git commit -m "docs: record phase one VMark comparison"`.
- [ ] Handoff Phase 2 with the exact manifest baseline, test evidence, and any intentionally deferred upstream differences.
