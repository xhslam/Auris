# Auris VMark-Equivalent MCP Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a local-only, VMark-equivalent MCP collaboration experience for the selected Auris notes vault, including four MCP tools, revision-safe document and selection edits, default review, and installer/status UI for Claude Desktop, Claude Code, Codex CLI, and Gemini CLI.

**Architecture:** Keep MCP stdio in the Node sidecar and use the existing Electron loopback WebSocket bridge as its private, authenticated transport.  Extend the renderer-side Notes workbench facade—not direct sidecar filesystem access—to own the selected vault and tab actions.  Persist the service policy in desktop config, expose it narrowly through trusted IPC, and implement configuration-file editing in the Electron main process.

**Tech Stack:** Electron 41, Next.js/React 19, TypeScript, Node ESM/CJS, `@modelcontextprotocol/sdk`, `ws`, Zod, Vitest, React Testing Library.

---

## File map

| File | Responsibility |
| --- | --- |
| `electron/auris-mcp-config.cjs` | Pure defaults, validation, status types, and client configuration read/merge/write adapters. |
| `electron/auris-mcp-client-config.cjs` | Provider-specific config paths and JSON/TOML MCP-entry installation, repair, removal, and inspection. |
| `electron/notes-mcp-bridge.cjs` | Loopback authentication, bounds, stats, lifecycle, and forwarding of the private protocol. |
| `electron/main.cjs` | Persist MCP policy, own discovery lifecycle and trusted IPC handlers. |
| `electron/preload.cjs` | Narrow `notesMcp` renderer API only. |
| `electron/auris-notes-mcp-server.mjs` | Stdout-clean MCP sidecar and the four grouped tools. |
| `src/features/notes/workbench/notes-mcp-contract.ts` | Shared action schemas, safe vault-relative path validation, SHA-256 revision/error helpers. |
| `src/features/notes/workbench/notes-mcp-request-handler.ts` | Keep legacy private operations plus selection-oriented MCP handlers. |
| `src/features/notes/workbench/notes-mcp-workspace-handler.ts` | `session`, `workspace`, and `document` actions bound to live workbench state. |
| `src/features/notes/workbench/notes-mcp-review-store.ts` | Small pending-agent-edit state machine, acceptance/rejection invariants, and immutable records. |
| `src/features/notes/workbench/notes-workbench.facade.ts` | Supplies live workspace context and action callbacks to the MCP handler. |
| `src/components/notes-v2/notes-mcp-review-dialog.tsx` | Review UI that previews and accepts/rejects default agent mutations. |
| `src/components/settings/mcp-integration-panel.tsx` | VMark-like service controls, health summary, provider rows, and restart notice. |
| `src/components/settings/settings-shell.tsx` | Makes MCP Integration a real settings category. |
| `src/platform/desktop/desktop-bridge.ts` | Browser-facing types for the narrow MCP settings and request APIs. |
| `docs/notes/mcp-agent-setup.md` | Manual setup, client behavior, safe agent workflow, and troubleshooting. |

## Task 1: Establish a testable MCP contract

**Files:**
- Create: `src/features/notes/workbench/notes-mcp-contract.ts`
- Create: `tests/unit/notes/notes-mcp-contract.test.ts`

- [ ] **Step 1: Write failing contract tests**

  Cover strict tool action parsing, vault-relative Markdown paths, rejection of
  absolute paths and `..`, SHA-256 revision determinism, and serialized stable
  error envelopes.

- [ ] **Step 2: Verify RED**

  Run: `npx vitest run tests/unit/notes/notes-mcp-contract.test.ts`

  Expected: import failure because the contract module does not exist.

- [ ] **Step 3: Implement the pure contract**

  Export Zod schemas for `auris_session`, `auris_workspace`,
  `auris_document`, and `auris_selection`; use POSIX path segmentation rather
  than host filesystem resolution; use Node/Web Crypto SHA-256 compatible
  deterministic helpers; return only vault-relative path values.

- [ ] **Step 4: Verify GREEN**

  Run: `npx vitest run tests/unit/notes/notes-mcp-contract.test.ts`

  Expected: all path, schema, revision, and envelope tests pass.

## Task 2: Harden the bridge lifecycle and service policy

**Files:**
- Create: `electron/auris-mcp-config.cjs`
- Modify: `electron/notes-mcp-bridge.cjs`
- Modify: `electron/main.cjs`
- Modify: `electron/preload.cjs`
- Modify: `src/platform/desktop/desktop-bridge.ts`
- Test: `tests/unit/electron/notes-mcp-bridge.test.ts`
- Create: `tests/unit/electron/auris-mcp-config.test.ts`

- [ ] **Step 1: Write failing policy and discovery tests**

  Assert a default-disabled service policy with `autoApproveEdits: false`, a
  versioned atomically published JSON discovery record, `0600` permissions,
  startup only when enabled, safe instance-owned deletion, listener stats,
  and disabled-service rejection.

- [ ] **Step 2: Verify RED**

  Run: `npx vitest run tests/unit/electron/auris-mcp-config.test.ts tests/unit/electron/notes-mcp-bridge.test.ts`

  Expected: failures reveal the current unconditional startup and legacy
  `port:token` discovery representation.

- [ ] **Step 3: Implement minimal policy and bridge changes**

  Add `mcp: { enabled, startOnLaunch, autoApproveEdits }` to desktop config
  with defensive migration.  Use `port: 0`, a launch `instance_id`, bounded
  1 MiB WebSocket payloads, at most 32 pending requests, 10-second timeout,
  connection count, and stable bridge errors.  Publish JSON only after
  listening; remove only a matching discovery file.  Make `start`, `stop`,
  `getStatus`, and policy updates explicit.

- [ ] **Step 4: Expose only trusted UI operations**

  Add Electron handlers and preload/TypeScript methods for `getStatus`,
  `updatePolicy`, `testConnection`, and provider config operations.  Do not
  expose port, token, discovery path, arbitrary filesystem APIs, or raw bridge
  request dispatch to the renderer.

- [ ] **Step 5: Verify GREEN**

  Run: `npx vitest run tests/unit/electron/auris-mcp-config.test.ts tests/unit/electron/notes-mcp-bridge.test.ts`

  Expected: lifecycle, authentication, cleanup, bounds, policy, and
  no-token-leak tests pass.

## Task 3: Build client configuration installation safely

**Files:**
- Create: `electron/auris-mcp-client-config.cjs`
- Create: `tests/unit/electron/auris-mcp-client-config.test.ts`
- Modify: `electron/main.cjs`

- [ ] **Step 1: Write failing provider adapter tests**

  Test Claude Desktop JSON, Claude Code JSON, Codex TOML, and Gemini JSON
  configuration locations via injected home/platform paths.  For each, test
  inspection states (`not_installed`, `valid`, `path_mismatch`, `missing`),
  merge without deleting unrelated servers, repair, removal, malformed
  configuration, and atomic-write failure.

- [ ] **Step 2: Verify RED**

  Run: `npx vitest run tests/unit/electron/auris-mcp-client-config.test.ts`

  Expected: module-not-found failure.

- [ ] **Step 3: Implement provider adapters**

  Produce a self-contained config entry which invokes the packaged sidecar
  when available and `node /absolute/.../auris-notes-mcp-server.mjs` in a
  development checkout.  Preserve non-Auris server entries exactly, use
  same-directory temporary files plus rename, and surface parse/permission
  errors without logging sensitive discovery content.

- [ ] **Step 4: Connect adapters to trusted IPC**

  Main-process handlers validate a provider enum, derive the sidecar command,
  and call inspect/install/repair/remove.  They return display-safe status
  only.

- [ ] **Step 5: Verify GREEN**

  Run: `npx vitest run tests/unit/electron/auris-mcp-client-config.test.ts`

  Expected: all provider and preservation tests pass.

## Task 4: Implement live session, workspace, and document actions

**Files:**
- Create: `src/features/notes/workbench/notes-mcp-workspace-handler.ts`
- Modify: `src/features/notes/workbench/notes-workbench.facade.ts`
- Modify: `src/features/notes/workbench/notes-mcp-request-handler.ts`
- Test: `tests/unit/notes/notes-mcp-request-handler.test.ts`
- Create: `tests/unit/notes/notes-mcp-workspace-handler.test.ts`

- [ ] **Step 1: Write failing behavior tests**

  Supply fake live documents, vault client, editor bridge, workspace store,
  and callbacks.  Cover one-call `session.get_state`; `workspace.new/open/
  save/close/switch_tab`; `document.read/write`; dirty-close refusal; missing
  tab/path failures; revision mismatch; and proof that only the injected vault
  client is used.

- [ ] **Step 2: Verify RED**

  Run: `npx vitest run tests/unit/notes/notes-mcp-workspace-handler.test.ts tests/unit/notes/notes-mcp-request-handler.test.ts`

  Expected: new handler cannot resolve.

- [ ] **Step 3: Implement the live controller**

  Build a small dependency-injected context in the facade with live refs for
  documents, workspace, dirty paths, selected editor, save/refresh callbacks,
  and vault client.  `new` creates a validated vault-relative Markdown file;
  `open` verifies it exists; `save` flushes known local save work; `close`
  returns `DIRTY` unless `force` is explicit; and `switch_tab` delegates to
  `openWorkspacePath`.  `document.read` returns canonical live source;
  `write` never bypasses the workbench state/update path.

- [ ] **Step 4: Keep existing internal compatibility**

  Preserve `document.getSource`, `editor.focus`, `editor.revealLine`, and
  legacy `selection.*` bridge methods.  Route new private method names through
  the same renderer subscription without creating a second endpoint.

- [ ] **Step 5: Verify GREEN**

  Run: `npx vitest run tests/unit/notes/notes-mcp-workspace-handler.test.ts tests/unit/notes/notes-mcp-request-handler.test.ts`

  Expected: workspace and document behavior is covered, including adversarial
  path and stale-write probes.

## Task 5: Add pending review and native selection mutations

**Files:**
- Create: `src/features/notes/workbench/notes-mcp-review-store.ts`
- Create: `src/components/notes-v2/notes-mcp-review-dialog.tsx`
- Modify: `src/features/notes/workbench/notes-mcp-workspace-handler.ts`
- Modify: `src/features/notes/workbench/notes-workbench.facade.ts`
- Modify: `src/components/notes-v2/notes-workbench.tsx`
- Create: `tests/unit/notes/notes-mcp-review-store.test.ts`
- Create: `tests/component/notes/notes-mcp-review-dialog.test.tsx`

- [ ] **Step 1: Write failing review-state tests**

  Verify immutable pending records, one-request/one-resolution behavior,
  stale checks when accepting, explicit rejection, default policy creation,
  and auto-approve direct application.  Add component tests for preview
  content and accessible accept/reject controls.

- [ ] **Step 2: Verify RED**

  Run: `npx vitest run tests/unit/notes/notes-mcp-review-store.test.ts tests/component/notes/notes-mcp-review-dialog.test.tsx`

  Expected: imports fail before the store and dialog exist.

- [ ] **Step 3: Implement pending-change state**

  Store only a bounded local review record—operation, target, expected and
  proposed source/selection data, revision, and timestamps.  A default
  mutation returns `PENDING_REVIEW` with a request identifier and does not
  alter editor/vault state.  On approval, re-check revision then apply through
  the same `handleDocumentChange` or editor selection bridge; on rejection,
  resolve without mutation.  Auto-approve takes the direct path and preserves
  undo behavior.

- [ ] **Step 4: Mount the review dialog**

  Render it from Notes workbench only when a pending record exists.  Show a
  legible before/after preview, title/path, auto-approve explanation, and
  accept/reject controls.  Do not expose review data to unrelated routes.

- [ ] **Step 5: Verify GREEN**

  Run: `npx vitest run tests/unit/notes/notes-mcp-review-store.test.ts tests/component/notes/notes-mcp-review-dialog.test.tsx`

  Expected: review, acceptance, rejection, stale-on-accept, and auto-approve
  tests pass.

## Task 6: Replace the sidecar’s narrow tool with four standard MCP tools

**Files:**
- Modify: `electron/auris-notes-mcp-server.mjs`
- Modify: `tests/unit/electron/auris-notes-mcp-server.test.ts`
- Create: `tests/integration/auris-mcp-stdio.test.ts`

- [ ] **Step 1: Write failing MCP registration and mapping tests**

  Use `InMemoryTransport` to assert exactly `auris_session`,
  `auris_workspace`, `auris_document`, and `auris_selection`, their Zod input
  schemas, success mapping, stable error preservation, and no legacy
  `auris_notes` tool in the public list.  Add a spawned stdio test proving
  initialization/list-tools/call-tool framing works and stdout contains no
  diagnostics/token.

- [ ] **Step 2: Verify RED**

  Run: `npx vitest run tests/unit/electron/auris-notes-mcp-server.test.ts tests/integration/auris-mcp-stdio.test.ts`

  Expected: tests fail against the single `auris_notes` tool.

- [ ] **Step 3: Implement tool registration and modern discovery parsing**

  Validate versioned discovery JSON and authenticate before sending a private
  request.  Map each composite tool action to an explicit `notes.mcp.*`
  bridge method.  Keep stdout exclusively for `StdioServerTransport` and
  write all diagnostics to stderr.  The health check returns tool metadata and
  performs no mutation.

- [ ] **Step 4: Verify GREEN**

  Run: `npx vitest run tests/unit/electron/auris-notes-mcp-server.test.ts tests/integration/auris-mcp-stdio.test.ts && node electron/auris-notes-mcp-server.mjs --health-check`

  Expected: tests pass and health output lists four tools.

## Task 7: Build the VMark-style settings integration

**Files:**
- Create: `src/components/settings/mcp-integration-panel.tsx`
- Modify: `src/components/settings/settings-shell.tsx`
- Modify: `src/app/globals.css` or the existing settings stylesheet owning
  `desktop-settings-shell`
- Create: `tests/component/settings/mcp-integration-panel.test.tsx`

- [ ] **Step 1: Write failing component tests**

  Test disabled/running/error display, service and auto-approve switches,
  test-connection feedback, tool/client counts, each provider status/action,
  restart notice, and disabled controls while a request is pending.

- [ ] **Step 2: Verify RED**

  Run: `npx vitest run tests/component/settings/mcp-integration-panel.test.tsx`

  Expected: component import failure.

- [ ] **Step 3: Implement settings behavior and visual system**

  Add an MCP Integration navigation item and use the same quiet, pale,
  low-contrast settings language as Auris—not VMark's blue/gray styling.
  Read status through the desktop bridge, make policy/provider operations
  explicit user clicks, refresh after completion, and provide a copyable
  manual configuration fallback.  The browser fallback states clearly that
  desktop MCP management is unavailable.

- [ ] **Step 4: Verify GREEN**

  Run: `npx vitest run tests/component/settings/mcp-integration-panel.test.tsx`

  Expected: provider lifecycle and accessibility tests pass.

## Task 8: Document, typecheck, and verify the full system

**Files:**
- Modify: `docs/notes/mcp-agent-setup.md`
- Modify: `auris/README.md`
- Modify: `tests/e2e/app-smoke.spec.ts` only if a stable desktop MCP path can
  be exercised without third-party credentials.

- [ ] **Step 1: Extend the setup guide**

  Replace the one-tool setup with the four-tool workflow, defaults, review and
  auto-approve semantics, installer/manual config paths, restart instructions,
  safe agent prompt sequence, and diagnostics for disabled service, unavailable
  vault, stale revision, dirty tab, and malformed client config.

- [ ] **Step 2: Run focused verification**

  Run: `npx vitest run tests/unit/notes/notes-mcp-contract.test.ts tests/unit/notes/notes-mcp-workspace-handler.test.ts tests/unit/notes/notes-mcp-review-store.test.ts tests/unit/electron/auris-mcp-config.test.ts tests/unit/electron/auris-mcp-client-config.test.ts tests/unit/electron/notes-mcp-bridge.test.ts tests/unit/electron/auris-notes-mcp-server.test.ts tests/component/notes/notes-mcp-review-dialog.test.tsx tests/component/settings/mcp-integration-panel.test.tsx tests/integration/auris-mcp-stdio.test.ts`

  Expected: all new/changed MCP tests pass.

- [ ] **Step 3: Run quality gates**

  Run: `npx tsc --noEmit && npm run lint && npm run test && npm run build && git diff --check`

  Expected: TypeScript, lint, unit suite, production build, and whitespace
  checks all pass.  If unrelated pre-existing failures remain, isolate and
  report them separately with their exact output.

- [ ] **Step 4: Run manual adversarial desktop smoke**

  1. Start `npm run desktop:dev`, select a vault, and enable MCP in Settings.
  2. Install Codex CLI configuration from the provider row and verify the
     unrelated config entry remains intact.
  3. Restart the client and call session, workspace, document, and selection
     operations through the actual MCP stdio server.
  4. Confirm default write shows review, rejection leaves text untouched,
     approval changes text, and auto-approve is immediate and undoable.
  5. Locally edit before a second agent write; confirm `STALE` and no mutation.
  6. Attempt absolute/traversal paths and an unauthenticated WebSocket request;
     confirm they fail without forwarding.
  7. Disable MCP and confirm the discovery file and active connections close.

- [ ] **Step 5: Review and commit focused changes**

  Run: `git diff --check && git diff --stat && git status --short`

  Review the complete feature diff, then create focused conventional commits
  without staging unrelated user changes.
