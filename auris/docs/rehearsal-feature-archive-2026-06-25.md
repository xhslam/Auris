# Rehearsal Feature Archive

Archived on 2026-06-25 before removing the standalone `/rehearsal` page and the routed `/workspace` rehearsal screen from Auris.

## Scope

This document records two removed related surfaces:

- The standalone `/rehearsal` expression-transfer page implemented by `RehearsalModeShell`.
- The `/workspace` screen that presents itself as `Workspace / Rehearsal`, including the right-side top bar actions shown in the 2026-06-25 screenshots.

## Standalone `/rehearsal` Page

The removed standalone page was a prototype for IELTS-style expression transfer training.

Original implementation:

- `src/app/rehearsal/page.tsx`
- `src/components/rehearsal/rehearsal-mode-shell.tsx`
- `src/components/rehearsal/rehearsal-mode.css`
- `tests/component/rehearsal/rehearsal-mode-shell.test.tsx`

User-facing frame:

- Desktop shell title: `Expression Transfer`
- Desktop shell subtitle: `Rehearsal`
- Main heading: `复述模式 / 表达迁移训练`
- Scenario: `Describe a person who inspired you`
- Primary action: `开始单题样例`, anchors to the practice section.
- Secondary action: `回到跟读训练`, linked back to `/workspace`.

Core training idea:

- The page did not reward verbatim memorization.
- It framed training as a gradual path away from the source text.
- The user first preserved meaning, then preserved structure, then rebuilt the material in their own words.

Prompt fading levels:

- `原文可见`: full English source paragraph stayed visible.
- `关键词提示`: only keywords remained, such as `meaning kept`, `confident, generous, learn from setbacks`, `when I changed schools`, and `turned pressure into a small plan`.
- `中文/思路提示`: only a Chinese outline remained:
  - 人物是谁：一位在压力里仍然稳定的人
  - 发生了什么：换学校时帮我把问题拆小
  - 为什么受启发：我学会先说清楚，再追求说漂亮

Feedback dimensions:

- `意思保留`: check whether the core story remained.
- `结构保留`: check whether opening, experience, and impact were still ordered clearly.
- `表达迁移`: check whether the user replaced words and sentence patterns with their own expression.

Known limitation:

- The page only contained a text/recording placeholder for user rehearsal.
- It did not connect to real recording, transcription, scoring, or persistence.

## `/workspace` Rehearsal Screen

The screenshot surface was the main `/workspace` route, implemented by `WorkspaceShell`.

Original implementation:

- `src/app/workspace/page.tsx`
- `src/components/workspace/workspace-shell.tsx`
- `src/components/workspace/workspace-top-bar.tsx`
- `src/components/player/reader-stage.tsx`
- `src/components/player/playback-dock.tsx`
- `src/components/workspace/note-picker-dialog.tsx`
- `src/components/workspace/library-dialog.tsx`
- `src/components/workspace/learning-memory-panel.tsx`
- `src/components/workspace/training-settings-panel.tsx`

Main visible areas:

- Top title area: `Workspace` eyebrow and `Rehearsal` heading.
- Reader stage: waits for prepared training audio, then shows sentence and word-level timed reading.
- Playback dock: bottom playback control area with play, replay sentence, progress, timing, playback status, reference voice, repeat settings, and privacy/smart notification state.
- Hidden audio elements: one for generated training audio and one optional reference audio.

Core workflow:

- Restore or create a training session.
- Load prepared playback with sentence and word timestamps.
- Highlight the active word and active sentence according to current audio time.
- Replay from a selected word or sentence.
- Save words into the wordbook.
- Save sentences into the sentencebook.
- Save pronunciation assessment records.
- Use current material, saved words, saved sentences, and old memory to generate learning context.

## Right Top Bar Actions

Original implementation: `src/components/workspace/workspace-top-bar.tsx`.

The top-right action group contained:

- `最近`
  - Opens a popover with `RecentRecordsPanel`.
  - Shows recent local training sessions.
  - Supports selecting a session, prefetching a session, deleting a recent record, and marking the active session.
  - Closes automatically after choosing an item or when clicking outside the popover.

- `从笔记选文`
  - Opens `NotePickerDialog`.
  - Shows a count badge from `notesCount`.
  - Converts selected note content into a training session using the current training settings.
  - Calls `loadPlayback(context.sessionId, context)` after preparing playback.

- `笔记`
  - Direct link to `/notes`.
  - Used as a fast escape hatch from training into the note workspace.

- `词本`
  - Opens `LibraryDialog` in `wordbook` mode.
  - Shows the number of saved words.
  - Supports reviewing, deleting, and exporting saved word records.

- `句本`
  - Opens `LibraryDialog` in `sentencebook` mode.
  - Shows the number of saved sentences.
  - Supports reviewing, deleting, and exporting saved sentence records.

- `记忆`
  - Opens `LearningMemoryPanel`.
  - Shows a badge only when `memoryCount > 0`.
  - Displays recalled learning-memory items related to the current material.
  - Supports copying AI context, sending context to the AI Dock, and creating a learning note in the Markdown vault.

- `设置`
  - Opens `TrainingSettingsPanel`.
  - Lets the user adjust repeat count, repeat interval, reference voice, privacy mode, smart notifications, and related training preferences.
  - Saves settings to browser local storage through `writeTrainingSettings`.

## Related Runtime Data

The workspace rehearsal flow used these client-side/runtime stores and adapters:

- `useWorkspaceSessionRuntime`: recent sessions, playback hydration, deletion, prefetch, and resume.
- `useWorkspaceLibraryRuntime`: wordbook, sentencebook, note counts, exports, and deletion.
- `useWorkspaceReferenceAudio`: optional reference voice playback.
- `useAudioPlayback`: audio playback state, repeat behavior, seeking, replay, progress, duration, and playback rate.
- `useActiveWord`: maps playback time to the currently active word token.
- `useWorkspaceLearningMemory`: recalls related learning memories and creates AI/Markdown context.
- `training-settings-store`: reads and writes local training preferences.

## Removal Notes

The standalone `/rehearsal` page, routed `/workspace` rehearsal page, top-bar controls, workspace runtime hooks, route-level tests, and the old `meeting-drill` rehearsal implementation/API were removed. The remaining `src/components/workspace/word-definition-popover.tsx` file is not the rehearsal page; it is still used by the reader/player word lookup surface.
