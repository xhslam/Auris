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
sources to Auris targets. `manifest.schema.json` defines schema version 1.
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
