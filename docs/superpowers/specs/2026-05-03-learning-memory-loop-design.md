# Learning Memory Loop Design

- Date: 2026-05-03
- Project: `english-shadowing-web`
- Status: Approved in chat as the first-version product direction

## Summary

Reshape the first version of the English product around a single learning loop:

`import English material -> shadowing practice -> mark words and save sentences -> generate or insert a learning note -> edit and link in the Markdown vault -> recall related vault material during the next import`

This is a product-level direction change, but it should not be implemented as a rewrite of the notes workbench or the AI sidebar. The existing Markdown vault workbench and global AI Dock should be preserved. The new work should add a `Learning Memory Loop` layer that connects training sessions, wordbook, sentencebook, notes, and AI context.

## Product Decision

The first version should use semi-automatic recall.

When the user imports a new English material, the system should automatically surface related memory from:

- previous Markdown notes in the vault
- saved words
- saved sentences
- prior training sessions when available

The user remains in control. The system suggests related memory, but the user chooses whether to open it, insert it into a note, or send it to the AI sidebar.

## Goals

- Make the product feel like an English training system with memory, not a one-off shadowing tool.
- Preserve the current notes workbench: vault, file tree, tabs, mixed Markdown editing, outline, search, backlinks, properties, learning insertion, and terminal panel.
- Preserve the current AI Dock: provider surface, prompt library, chat history, hover/reveal layout, and desktop bridge integration.
- Add a clear path from imported material to training artifacts to Markdown notes.
- Add semi-automatic recall when new material is imported.
- Keep the first version useful without requiring AI generation.
- Let AI enhance the loop through context-aware prompts rather than making AI the source of truth.

## Non-Goals

- Do not replace the Markdown vault with a database-only note system.
- Do not remove or simplify existing notes-v2 workbench capabilities.
- Do not move AI Dock into the notes right sidebar.
- Do not build vector search in the first version.
- Do not auto-insert recalled material into training without user approval.
- Do not redesign every app surface at once.
- Do not make the first version depend on cloud-only state.

## Preserved Surfaces

### Notes Workbench

The notes workbench remains the user's durable editing and review environment.

Preserve:

- local vault directory behavior
- real `.md` files as the source of truth
- file tree, recent files, tabs, search, outline, backlinks, properties
- mixed line Markdown editing
- word and sentence learning insertion
- desktop terminal panel
- desktop vault bridge and browser/mobile storage adapters

The new loop should extend notes through note generation, recall links, and insertion actions. It should not downgrade notes into a simple text preview.

### AI Dock

The AI Dock remains a global desktop AI side panel.

Preserve:

- provider selection
- provider embedded surface
- prompt library
- chat history capture/search/export
- dock visibility and layout sync
- desktop bridge storage

The new loop should add context handoff actions such as:

- ask AI about current material
- send recalled notes and sentences to AI
- generate review questions from current training context
- rewrite or polish the current learning note

The AI Dock should consume learning context, not own the training or notes state.

## Core User Flow

### 1. Import Material

The user imports or pastes English material in the training workspace.

Accepted first-version sources:

- pasted text
- existing template/material text
- URL/file import only if already supported by the current workspace path

The imported material becomes the current training source and triggers memory recall.

### 2. Recall Related Memory

After import, the workspace shows a related memory panel.

The panel includes:

- matching vault notes
- matching saved words
- matching saved sentences
- prior session references if session history is available

First-version matching should be deterministic and explainable:

- title match
- tag match
- exact word match
- phrase/sentence substring match
- simple token overlap against note body and saved sentence text

Each recall item should explain why it matched, for example:

- "contains saved word: rhythm"
- "same sentence fragment"
- "note title overlaps with imported material"
- "tag: shadowing"

### 3. Practice And Capture

The user practices with the existing playback and reader flow.

The user can:

- mark or save words into the wordbook
- save sentences into the sentencebook
- replay sentences
- record voice if the current workflow supports it

These actions should remain owned by the existing training, wordbook, and sentencebook modules.

### 4. Generate Or Insert Learning Note

The user can create a learning note from the current training context.

The generated Markdown should include:

```markdown
---
type: learning-session
sourceSessionId: "<session id when available>"
createdAt: "<iso timestamp>"
tags:
  - english
  - shadowing
---

# <material title>

## Source

<imported material>

## Saved Words

- <word> - <definition or source label>

## Saved Sentences

> <sentence>

## Related Memory

- [[old-note]]
- Saved sentence: <matched sentence>

## Review

- What sounded difficult?
- Which expression should be reused?
- What should be repeated next time?
```

The first version may use a deterministic template. AI generation can be offered as an enhancement, but the core flow must work without AI.

### 5. Edit, Link, And Review In Vault

After note creation, the user can open the note in the existing notes workbench.

The user can:

- edit Markdown directly
- add wiki links
- link to prior notes
- search the vault
- use backlinks and outline
- use AI Dock with the note context

The note remains a real Markdown file in the vault.

### 6. Recall On The Next Import

When the next material is imported, the recall layer indexes the current vault and saved learning artifacts again.

The workspace then surfaces old material that may be relevant before or during practice.

## Architecture

Add a new feature layer:

`src/features/learning-memory/`

This layer should coordinate existing domains without taking over their storage.

Recommended units:

- `learning-session-context.ts`
  - Builds a normalized context from current material, playback/session metadata, saved words, saved sentences, and selected note.
- `learning-note-template.ts`
  - Builds deterministic Markdown for a learning note.
- `memory-recall-index.ts`
  - Converts notes, words, sentences, and sessions into searchable recall records.
- `memory-recall-engine.ts`
  - Scores and explains related memory matches.
- `learning-memory-types.ts`
  - Owns shared types for contexts, recall records, match reasons, and note generation inputs.

UI additions should be narrow:

- workspace panel for related memory
- workspace action to generate or update a learning note
- AI Dock context actions that can receive learning-memory context
- notes insertion action only where it fits existing notes-v2 patterns

## State Ownership

### Existing Training State

Training source text, playback, current session, audio, recording, and assessment stay in existing workspace/session modules.

### Existing Wordbook And Sentencebook State

Saved words and sentences stay in the existing local storage modules and services.

### Existing Notes State

Markdown notes stay in the vault through existing notes storage and vault abstractions.

### New Learning Memory State

The new layer should mostly derive state from existing sources.

Persist only small references when needed:

- generated note path for a session
- source session id in note frontmatter
- stable tags such as `english`, `shadowing`, `learning-session`

Avoid introducing a second database of note content.

## Recall Strategy

First-version recall should be transparent and local.

Inputs:

- imported material text
- saved words
- saved sentences
- parsed note titles
- note tags
- note body text
- wiki links
- available recent sessions

Output:

- `RecallItem[]`

Each item should include:

- type: `note`, `word`, `sentence`, or `session`
- title/label
- source path or id
- preview text
- score
- reasons
- available actions

Scoring can be simple:

- exact saved word in material: high
- saved sentence substring or strong phrase overlap: high
- note title overlap: medium
- tag overlap: medium
- body token overlap: low to medium

The UI should sort by score but display reasons so the recall feels trustworthy.

## AI Dock Integration

AI should be a companion for the learning loop, not a dependency.

Add context handoff actions:

- "Ask AI with current material"
- "Ask AI with related memory"
- "Generate review questions"
- "Rewrite current learning note"
- "Make follow-up drills from saved sentences"

Implementation direction:

- Build a serializable learning context object.
- Copy or inject that context into the AI Dock prompt flow.
- Reuse the existing prompt library and history capabilities.
- Do not add raw provider-specific logic to workspace or notes modules.

If direct provider injection is not available in the first version, copying a structured prompt to clipboard and opening AI Dock is acceptable.

## Notes Integration

The notes workbench should gain memory-loop affordances without losing its current identity.

Possible first-version additions:

- open generated learning note after creation
- insert recall block into current note
- show `learning-session` frontmatter in properties
- expose related notes through backlinks/search rather than a separate custom graph

The existing learning panel can continue to insert saved words and sentences. The new recall panel should exist in the training workspace first, because recall is triggered by new imported material.

## Workspace UI Direction

The training workspace should make the loop visible.

Recommended first-version UI:

- source/import area remains on the left
- reader/playback remains central/right as currently structured
- add a compact `Related Memory` panel near the material intake or library actions
- add a `Create Learning Note` action after material is loaded or playback is prepared
- add `Send to AI` action for current context and recall results

The UI copy should reinforce the loop:

- "Related Memory"
- "Create Learning Note"
- "Insert Into Vault"
- "Use With AI"
- "Review From Last Time"

## Error Handling

Handle failures explicitly:

- vault not configured
  - show note generation disabled state and prompt the user to choose a folder
- no recall results
  - show an empty but encouraging state, not an error
- note creation failure
  - show a user-readable error and preserve the training session state
- AI Dock unavailable
  - allow copying the context prompt instead
- session id unavailable
  - generate the note without session frontmatter references

No failure in recall or note generation should block shadowing practice.

## Testing Strategy

### Unit Tests

Add coverage for:

- learning context construction
- deterministic note template generation
- recall indexing from notes, saved words, and saved sentences
- recall scoring and reason generation
- empty input and no-match behavior

### Component Tests

Add coverage for:

- related memory panel empty and populated states
- create learning note button states
- recall item actions
- AI context handoff fallback when AI Dock is unavailable

### Integration Or E2E Tests

Verify:

- import material triggers related memory results
- saving a word makes it appear in later recall
- saving a sentence makes it appear in later recall
- generating a learning note writes a Markdown file to the notes storage adapter
- opening the generated note preserves notes workbench behavior

### Regression Tests

Keep existing coverage for:

- notes-v2 workbench
- mixed Markdown editor
- command palette
- desktop AI Dock
- workspace playback and library flows

## Implementation Slices

### Slice 1: Learning Memory Domain

Create the pure domain layer for learning context, recall records, scoring, and note template generation.

This slice should have no React dependencies.

### Slice 2: Workspace Recall Panel

Add related memory display to the workspace using existing notes, wordbook, and sentencebook data.

This makes the B strategy visible without changing notes or AI yet.

### Slice 3: Learning Note Generation

Add the action that writes a generated Markdown note into the existing notes storage.

After creation, the user can open the note in `/notes`.

### Slice 4: AI Dock Context Handoff

Add structured prompt/context handoff from the workspace and/or generated note flow into the existing AI Dock.

Start with a copy-to-clipboard fallback if provider injection is not yet available.

### Slice 5: Polish And Regression Verification

Run targeted tests, lint, build, and e2e checks for the critical loop.

## Success Criteria

- A user can import or paste English material.
- The workspace shows related memory from existing notes, saved words, and saved sentences.
- The user can practice normally without recall blocking playback.
- The user can create a Markdown learning note from the current material.
- The generated note is saved as a real `.md` file in the existing notes storage.
- The user can open and edit the generated note in the existing notes workbench.
- The AI Dock remains available and can receive or copy a structured learning context.
- Existing notes and AI Dock tests continue to pass.

## Risks And Mitigations

### Risk: Scope expands into a full knowledge graph

Mitigation: use simple deterministic recall in the first version. Defer vector search and graph ranking.

### Risk: Notes workbench gets reduced to a generated-note viewer

Mitigation: keep all notes-v2 capabilities intact and treat note generation as one input into the vault.

### Risk: AI Dock becomes tightly coupled to workspace internals

Mitigation: hand off a serializable learning context object. Keep provider and history logic in AI Dock modules.

### Risk: Recall feels random

Mitigation: show match reasons and keep first-version scoring explainable.

### Risk: New state duplicates existing storage

Mitigation: derive memory from existing notes, wordbook, sentencebook, and sessions. Persist only references and Markdown frontmatter.

## Open Decisions For Implementation Planning

- Exact workspace placement for `Related Memory`.
- Whether the generated note opens automatically in `/notes` or appears as a toast/action first.
- Whether AI handoff starts as clipboard-only or integrates with the existing prompt library UI.
- Whether generated notes live in `Inbox/`, `Learning/`, or a date-based folder.

## Review Constraint

Automated spec review with a subagent was not run in this session because the current tool policy only allows subagents when the user explicitly asks for delegated agent work.
