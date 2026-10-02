# VMark port provenance

Auris uses behavior and source structure from the ISC-licensed
[`xiaolai/vmark`](https://github.com/xiaolai/vmark) project as a reference for
its browser, automation, Nia, workflow, and multi-window work.

The baseline is pinned to commit
[`7c409688dc510d87183bdc46308e1ee645c2579f`](https://github.com/xiaolai/vmark/commit/7c409688dc510d87183bdc46308e1ee645c2579f).
The exact upstream ISC notice at that revision is preserved in
`UPSTREAM-LICENSE.txt`.

This attribution describes source provenance only. Auris is not affiliated
with, sponsored by, or endorsed by the VMark project or its author.

## Manifest

`manifest.json` records stable, many-to-many mappings from the pinned VMark
sources to Auris targets and explicit review decisions for broader product
domains. `manifest.schema.json` defines schema version 2.
All completed mapping targets exist in this tree. Each mapping records both the
pinned provenance baseline and the latest manually reviewed comparison commit;
the generated report does not update source files or the baseline automatically.

Disposition meanings:

- `copied`: retained verbatim, such as the upstream license notice.
- `adapted`: source structure or implementation is recognizably retained with
  bounded changes.
- `rewritten`: behavior is mapped to a new implementation, including required
  Electron replacements for Tauri/Rust code.
- `not-applicable`: reviewed upstream material that Auris intentionally does
  not port.

The manifest is an audit aid rather than runtime authority.
`lastComparedCommit` records the current reviewed upstream comparison;
`tests` names the Auris evidence for that mapping. Tauri-only shell mechanics are
marked as platform differences only where Electron `BrowserWindow` and
`WebContentsView` provide the corresponding behavior.

Phase handoffs:

- Phase 3: `phase-3-handoff.md` (MCP research loop)
- Phase 4: `phase-4-handoff.md` (security authority + enablement gates)
- Phase 6: `phase-6-handoff.md` (Phase 5 Nia/workflows + Phase 6 multi-window/release verification)

## Upstream capability review

- VMark v0.9.90 (`662d73d46`):
  `../vmark-sync/implementation-status-2026-10-01.md`. Selective review of
  linear Markdown dependency patches, the directly adapted pure render queue,
  terminal transcript hooks/preview and macOS terminal permissions. Upstream ISC
  notice is also shipped in desktop resources. Historical mapping comparison
  commits remain unchanged until their individual domains are re-verified.
- VMark v0.9.31 (`981afc01`): `feature-gap-report-v0.9.31.md`. Functional and
  technical gap report against this baseline. Items 5-8 of its difference
  matrix (Workspace Rail, knowledge-base graph, Genies, auto-update) are the
  provenance for the corresponding Auris features. This is a tracking report,
  not a per-domain re-review: `manifest.json` `lastComparedCommit` values are
  intentionally not advanced without re-verification.
