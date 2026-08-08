# Persistent Sidebar Insights Design

## Goal

Replace the empty expanded state of the home page's persistent left rail with a compact, actionable insight panel. The panel must retain the existing 248px expanded width and dark ink / antique-brass Auris visual language.

## Context

`DesktopAppFrame` keeps a 76px navigation rail permanently visible on the home workspace. Hovering the rail's middle expand zone sets `data-sidebar-visible="true"`. `DesktopAppSidebar` currently responds by unmounting its navigation sections, leaving the widened sidebar empty.

The notes platform already exposes `NotesStorage.listPages()`, which returns summaries in descending `updatedAt` order. No app-level foreground-duration tracker exists.

## User-facing behavior

### Collapsed rail

- Keep the current 76px persistent icon rail, existing route icons, and middle hover trigger.
- Do not alter behavior on notes, reading, video, or other non-home routes.

### Expanded insight panel

- Keep the existing 248px width, 20ms reveal delay, and 200ms hide delay.
- Replace the unmounted navigation area with an `Auris` insight panel. Do not reintroduce the five lower navigation icons in the expanded state.
- The panel contains, in order:
  1. today's foreground usage duration;
  2. a 12-week, seven-day-per-column usage heatmap;
  3. the three most recently edited notes;
  4. a `查看全部` action;
  5. a `今日回顾 →` action.
- Make the panel independently vertically scrollable on short desktop windows.

### Navigation actions

- Each recent-note row opens `/notes?resumeNoteId=<note id>`.
- `查看全部` opens `/notes`.
- `今日回顾 →` opens `/review`.
- All panel navigation first closes the expanded sidebar, then performs the existing client-side transition.

## Usage-duration model

- Track time only while both conditions hold: the document is visible and the desktop window has focus.
- Stop or flush an active segment on `blur`, `visibilitychange`, and `pagehide`; resume on `focus` or a visible-state change when focused.
- Persist day totals in local storage under a versioned, app-private key.
- Attribute elapsed time to the local calendar day. A day-crossing active segment is split rather than written entirely to its start day.
- Flush on a short interval while active so unexpected renderer shutdowns lose only a small interval. Ignore negative clock deltas and cap a single unflushed interval to avoid counting sleep or long pauses as foreground time.
- The heatmap shows absolute daily-duration buckets: zero is neutral; progressively longer usage becomes deeper muted brass, with 90+ minutes using the strongest tone.
- This feature is local-only in the first version: it does not upload usage activity or attempt cross-device merging.

## Architecture

1. Add a focused app-activity module responsible for reading, recording, grouping, and formatting daily usage totals. Keep it framework-free and unit testable.
2. Add a client hook in the desktop frame that owns browser lifecycle listeners and exposes the current usage summary.
3. Add a display-focused `DesktopSidebarInsights` component. It receives the usage summary, recent note summaries, loading state, and callbacks; it does not read storage or navigate on its own.
4. Let `DesktopAppFrame` load recent notes from `getNotesStorage()` when the home insight panel opens and pass the three newest summaries to `DesktopAppSidebar`.
5. Let `DesktopAppSidebar` render either the existing collapsed navigation sections or the insight panel for the expanded persistent-home state. Reuse its existing close-before-navigation callback.
6. Replace the stale expanded-sidebar CSS rules with scoped panel styles. Preserve the current CSS variables: `--auris-sidebar-rail: 76px` and `--auris-sidebar-wide: 248px`.

## Error and empty states

- If no notes vault is configured or reading notes fails, render a calm empty state and keep `查看全部` available.
- If activity storage is unavailable or corrupt, treat all usage as zero and continue rendering the panel.
- While note data loads, show compact skeleton rows without changing panel width or collapsing its actions.

## Verification

- Unit tests for activity recording: visible-and-focused time accrues; blur/hidden time does not; invalid or overlong deltas are not overcounted; heatmap buckets and dates are deterministic.
- Component tests for the insights panel: it renders the supplied usage and newest notes; note, all-notes, and review actions call the matching navigation callback.
- Frame/sidebar tests: opening the home expand zone renders panel content at the existing 248px width and still omits the lower nav icons.
- Playwright coverage: hover the home middle zone, verify populated panel actions, navigate through a recent note and review action, and verify the panel remains within the viewport at a short height.

## Out of scope

- Analytics, cloud sync, account-level usage history, notifications, and changing the sidebars on non-home routes.
