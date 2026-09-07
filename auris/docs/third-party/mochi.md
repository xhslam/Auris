# Mochi provenance

Auris's Nia desktop companion uses selected behavior derived from the open-source
[Mochi repository](https://github.com/xiaolai/mochi) at the pinned commit
`faa334001541fc74093288821df5cfbff96f6797`. Upstream changes after that commit
are not incorporated automatically.

Mochi is distributed under the MIT License. The pinned repository's license
identifies the copyright holder as `HANDO K.K.` and permits use, modification,
and distribution subject to preservation of the license and copyright notice.
See the upstream [`LICENSE`](https://github.com/xiaolai/mochi/blob/faa334001541fc74093288821df5cfbff96f6797/LICENSE)
for the complete terms.

## Derived Auris modules

- `electron/nia/companion/codex-credential.cjs` derives its Codex auth-file
  location, `tokens.access_token` parsing, JWT-expiry classification, Realtime
  client-secret request, and SDP exchange request shape from Mochi's
  `src/main/voice/credential.ts`, `src/main/codex/auth.ts`, and
  `src/shared/realtime-wire.json` at the pinned commit. Auris adapts the code to
  CommonJS, injected dependencies, explicit deadlines, discriminated public
  errors, and opaque main-process-only credential/session handles.
- `electron/nia/companion/shell-path.cjs` derives its interactive login shell PATH
  probing (`-ilc 'printf %s "$PATH"'`), timeout bounding, banner filtering,
  and safe non-shadowing PATH widening from Mochi's `src/main/shell-path.ts`
  and `src/main/shell-path.test.ts` at commit `80bf695`.
- `electron/nia/companion/companion-answers.cjs` and
  `src/features/nia/nia-companion-answers.ts` derive the single-source-of-truth
  request/response contract table and typed host-command dispatcher pattern
  from Mochi's `src/shared/answers.ts` and `src/main/ipc/answer.ts` at commit
  `4c1d6f0`, eliminating type drift between main process and renderer.
- `src/features/nia/nia-realtime-protocol.ts` derives its turn-taking and hearing
  configuration (`semantic_vad`, `interrupt_response` trade-off for multi-speaker
  rooms, and `eagerness` wait thresholds: auto, low, medium, high) from Mochi's
  `src/shared/turn-taking.ts` and `src/renderer/settings/pane/hearing.ts` at commit
  `7490218`.

`electron/nia/companion/diagnostics-store.cjs` is an Auris-specific passive,
redacted diagnostics facility and is not copied from Mochi. The corresponding
unit tests verify Auris's adaptation rather than copying Mochi test source.

When another Auris module begins to copy or substantially derive Mochi behavior
or code, add its exact path and upstream source here in the same change.
