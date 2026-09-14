# Notes Mixed Line Editing Design

- Date: 2026-04-20
- Project: `english-shadowing-web`
- Status: Approved in chat as approach B, written to file

## Summary

This design replaces the current `notes-v2` center-pane `reading/source` mode split with a single mixed editor.

The new notes experience should behave like this:

- the notes center area no longer asks the user to choose between `reading` and `source`
- the active editing line shows raw Markdown source
- surrounding non-active lines remain rendered as readable content
- the notes workbench continues to preserve autosave, command palette, outline, backlinks, learning insertion, desktop integrations, and line-based editor bridge behavior

The user explicitly chose `B`: remove the distinction rather than merely keeping a hidden fallback toggle.

## Product Decisions Confirmed In Chat

The user confirmed the following:

- they do not want to keep a separate source-vs-rendered mode for notes
- they want to edit inline, with only the currently edited line shown as source
- the rest of the note should stay in rendered form while editing
- the change should be implemented without losing surrounding notes functionality

## Goals

- Remove the cognitive split between `reading` and `source` in the notes center pane.
- Make note editing feel closer to inline block editing tools while keeping Markdown as the storage format.
- Preserve line-oriented editing so the outline panel, bridge APIs, and command insertions remain reliable.
- Reuse the existing reading renderer logic so rendered output stays visually consistent.
- Keep the implementation bounded and testable.

## Non-Goals

- Do not replace Markdown as the source of truth.
- Do not rebuild the notes editor around a completely different editing library.
- Do not redesign the left rail, right rail, tabs, or desktop app shell.
- Do not remove properties, backlinks, learning snippets, command palette, or desktop terminal integrations.
- Do not introduce collaborative editing or block databases in this phase.

## Hard Invariants

### 1. Markdown Remains Canonical

The saved document must remain plain Markdown source.

Rendered lines are a view concern only. The persistence layer, autosave path, rename/link maintenance, search, and parsing continue to operate on `rawSource`.

### 2. Single Center Editing Surface

The notes center pane should always be one mixed editor surface.

There should no longer be a top-level runtime branch like:

- `reading`
- `source`

for the primary note area.

### 3. Current Editing Scope Must Stay Predictable

When the caret moves, the visible source region must move with it in a way that feels stable.

At minimum:

- the active line is editable source
- selection across multiple lines keeps the touched lines in source mode
- snippet insertion and reveal-line actions still land in the real source buffer

### 4. Existing Workbench Features Must Keep Working

This change must not regress:

- autosave
- note opening, closing, and tab state
- outline navigation and `revealLine`
- backlinks and properties panels
- learning snippet insertion
- command palette note actions
- desktop vault refresh behavior

### 5. Rendered View Must Reuse Existing Markdown Semantics

The reading presentation for headings, paragraphs, lists, callouts, quotes, and spacing should stay consistent with the existing `NotesReadingPane` behavior rather than forking into a second renderer.

## Findings That Motivated This Change

### A. The Center Pane Is Currently A Hard Split

`src/components/notes-v2/notes-workbench-center.tsx` currently renders either:

- `NotesReadingPane`
- `NotesEditorPane`

based on `viewMode`

This makes reading and editing mutually exclusive at the center-pane level.

### B. The Mode Split Exists In Multiple Layers

The current `reading/source` distinction is not isolated to one component. It exists in:

- `src/components/notes-v2/notes-workbench-header.tsx`
- `src/features/notes/workbench/use-notes-sidebar-state.ts`
- `src/features/notes/workbench/notes-workbench.facade.ts`
- `src/features/notes/workbench/build-notes-command-palette.ts`
- related tests that assert mode toggling

That means the correct change is architectural cleanup, not a cosmetic hide.

### C. The Current Editor Already Has The Right Low-Level Foundation

`NotesEditorPane` already uses `CodeMirror` with:

- Markdown language support
- active-line tracking
- line wrapping
- update listeners
- bridge methods such as `insertSnippet` and `revealLine`

This is a strong base for mixed rendering. We do not need to throw it away.

### D. The Existing Reading Renderer Is Good Enough To Reuse

`NotesReadingPane` already parses and renders:

- headings
- paragraphs
- ordered/unordered lists
- task lists
- quotes
- Obsidian-style callouts

The right move is to extract and reuse this renderer logic for non-active lines instead of maintaining a separate full-page reading mode.

## Chosen Design

The approved rule is:

`single CodeMirror-backed notes editor -> active source lines -> rendered inactive lines`

This phase has four slices.

### Slice A: Remove The Top-Level Reading/Source Mode

Delete the center-pane mode split and make the notes workbench center always render the editor-based surface.

Concretely:

- remove `viewMode` state from the notes workbench path
- remove header mode-toggle buttons
- remove command palette `toggle-reading`
- stop branching the center pane between `NotesReadingPane` and `NotesEditorPane`

Primary outcome:

- the notes workbench now has one mental model instead of two

### Slice B: Extract Reusable Markdown Reading Blocks

Move the Markdown reading parser/renderer logic out of `NotesReadingPane` into a reusable rendering module.

That module should support:

- full-document rendering for tests or future reuse
- line- or segment-level rendering for the mixed editor decorations

Primary outcome:

- rendered inactive lines and any remaining standalone reading uses stay visually aligned

### Slice C: Add A Mixed Rendering Editor Extension

Extend the CodeMirror editor so it can compute which line range is actively being edited and render inactive lines as display widgets or replacement decorations.

Expected behavior:

- single caret: current line is source, surrounding lines render
- multi-line selection: selected line range stays source
- line reveal or command insertion lands in source and updates the mixed rendering correctly
- focus changes keep the editor bridge intact

Primary outcome:

- the user edits inline without giving up source fidelity

### Slice D: Keep Bridge And Sidebar Integrations Stable

The rest of the workbench should still treat the editor as a line-addressable Markdown source surface.

That means:

- `onActiveLineChange` still reports the source line
- outline clicks still call `revealLine`
- learning snippet insertion still writes real Markdown into the document
- autosave keeps reading from the CodeMirror source buffer

Primary outcome:

- the center-pane interaction changes without destabilizing the rest of the workbench

## Interaction Model

### Default State

When a note opens:

- the center pane shows one mixed editing surface
- the first active source line follows the editor selection
- all other lines render using the shared Markdown renderer

### Caret Movement

When the user moves the caret:

- the newly active line becomes raw Markdown
- previously active lines return to rendered display
- the transition should not require a full mode switch or remount

### Range Selection

When the user selects multiple lines:

- every touched line stays in source mode
- lines outside the selection continue rendered

This prevents the editor from becoming unusable for copy, delete, indentation, or snippet insertion across line ranges.

### Focus And Bridge Behavior

When code elsewhere asks the editor bridge to reveal or focus a line:

- the editor scrolls to that line
- that line becomes source-visible
- the mixed rendering layer updates without losing editor state

## File Blueprint

### Existing Files To Modify

- `src/components/notes-v2/notes-editor-pane.tsx`
- `src/components/notes-v2/notes-reading-pane.tsx`
- `src/components/notes-v2/notes-workbench-center.tsx`
- `src/components/notes-v2/notes-workbench-header.tsx`
- `src/components/notes-v2/notes-page-client.tsx`
- `src/components/notes-v2/notes-workbench.tsx`
- `src/features/notes/editor/editor-extensions.ts`
- `src/features/notes/editor/editor-state-bridge.ts`
- `src/features/notes/workbench/build-notes-command-palette.ts`
- `src/features/notes/workbench/notes-workbench.facade.ts`
- `src/features/notes/workbench/use-notes-sidebar-state.ts`
- `tests/component/notes/notes-workbench.test.tsx`
- `tests/component/notes/notes-page-client.test.tsx`
- `tests/component/notes/notes-panels.test.tsx`
- `tests/component/notes/notes-reading-pane.test.tsx`
- `tests/unit/notes/notes-workbench-command-palette.test.ts`

### New Files To Create

- `src/features/notes/rendering/notes-reading-blocks.tsx`
- `src/features/notes/editor/editor-mixed-rendering.ts`
- `tests/unit/notes/editor-mixed-rendering.test.tsx`

## Risks And Mitigations

### Risk 1: CodeMirror Decoration Complexity

Replacing inactive lines with rendered widgets can destabilize cursor math if done too aggressively.

Mitigation:

- keep the actual source document untouched
- drive rendering from decorations only
- start with line-granularity rather than arbitrary inline token replacement
- cover selection and reveal-line cases with targeted tests first

### Risk 2: Renderer Drift

If inactive-line rendering and standalone reading rendering diverge, the note will feel inconsistent.

Mitigation:

- extract shared reading block logic
- keep `NotesReadingPane` as a thin consumer of the shared renderer during transition

### Risk 3: Multi-Line Editing Regressions

A single-line-only approach could break indentation, delete ranges, or snippet insertion.

Mitigation:

- treat the active editable scope as a line range, not only a single cursor line
- test multi-line selection and snippet insertion explicitly

### Risk 4: Hidden State Leftovers

If `viewMode` remains in persistence, header actions, or command palette code, the workbench will keep carrying dead behavior.

Mitigation:

- remove the mode from the state flow end-to-end
- replace old tests that assert mode toggling with tests that assert single-surface behavior

## Validation Strategy

Before calling this complete, verify:

- the notes center pane no longer exposes reading/source switching
- the command palette no longer includes the toggle-reading command
- active and selected lines remain source-visible while surrounding lines render
- snippet insertion still changes real Markdown source
- outline and bridge navigation still land on the expected line
- `npm run test`
- `npm run lint`
- `npm run build`
