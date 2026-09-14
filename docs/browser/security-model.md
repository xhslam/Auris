# Browser security model

Electron main is the authority boundary. Renderers display redacted state and
send narrow intents; they cannot mint leases, grants, approvals, trusted page
references, workflow identities, or provider credentials.

## Authorization chain

Every controlled operation is bound to the current connection owner,
`windowId`, `tabId`, navigation generation, control epoch, and opaque lease
token. Auris then checks the committed origin, automation mode, attachment,
standing grant or one-shot approval, operation policy, and exact payload. Page
text, DOM observations, workflow files, and renderer-provided ASTs remain
untrusted input.

An approval is one-shot, short-lived, and payload-bound. `APPROVAL_REQUIRED` is
a completed tool response: the caller asks the user, then retries the identical
operation with the returned `approvalId`. Navigation, control changes, human
input, tab/window closure, disconnect, timeout, or payload changes invalidate
the attempt. Focus never changes authority.

## Isolation and persistence

- Browser views enable sandboxing and context isolation and disable Node
  integration. Permission requests are denied by default.
- AI Sandbox is non-persistent and separate from Human/AI Shared storage.
- Human and AI Shared share a persistent partition, but AI Shared does not
  inherit automation permission or a lease.
- Named profiles and cookie/localStorage replay are feature-gated **off** in the
  production capability snapshot. Session save/load APIs exist for contract
  stability but fail closed with `CAPABILITY_NOT_VERIFIED` until a deliberate
  product flip (Settings UX + threat-model review). Session records would use
  opaque references; secrets are not exposed to renderers or MCP.
- Status snapshots redact credentials, connection IDs, lease/approval tokens,
  payload hashes, page output, provider secret references, and grant internals.
- Quit and crash cleanup release leases, approvals, runs, temporary evidence,
  and process-memory credentials. Restored tabs start without automation
  authority.

## Nia providers

REST providers accept HTTPS endpoints; loopback HTTP is allowed only for the
local Ollama protocol. API keys remain in process memory unless the user
explicitly chooses Keychain-backed “remember on this Mac.” Configuration stores
only an opaque secret reference.

CLI providers are fixed audited adapters for `claude`, `codex`, and `gemini`.
They reject user executable paths, flags, shell commands, custom environment,
and caller-controlled working directories. Prompts go through stdin in an
isolated temporary directory with bounded time and output. Claude and Gemini
use their documented generation modes with tools disabled where supported.
Codex `exec` cannot reliably disable independent tool authority; Auris reports
that risk in the UI, so use it only with an account and environment whose
authority you accept.

## Capabilities intentionally unavailable

The production snapshot currently reports `namedProfiles`, `cookieReplay`, and
`localStorageReplay` as false. Popup/print behavior and cross-window tab moving
are also outside this release. A `CAPABILITY_NOT_VERIFIED` error is a boundary,
not an instruction to bypass checks with environment flags.
