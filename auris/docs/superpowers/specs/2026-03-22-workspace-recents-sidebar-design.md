# Workspace Recents Sidebar Design

## Summary

Move the current "Recent Records and Templates" area out of the main workspace column and into a left-side collapsible sidebar that behaves more like the Obsidian file pane. The sidebar should be collapsed by default, keep a narrow always-visible icon rail on desktop, and open an overlay panel when the user needs quick access to recent sessions and starter templates.

## Goals

- Match the user's preferred "Obsidian-like" mental model.
- Keep the reading and playback area visually focused by default.
- Preserve all existing recent-session and template actions.
- Reuse the existing workspace visual language instead of introducing a new UI system.
- Keep the structure extensible for future left-rail entries such as notes, wordbook, or sentencebook.

## Non-Goals

- Redesign the recent/template content model.
- Merge notes, wordbook, and sentencebook into the new sidebar in this change.
- Rework server data loading or session/template APIs.

## User Experience

### Desktop

- A narrow left icon rail is always visible inside the workspace shell.
- The rail includes a single entry for the recents/templates sidebar in this change.
- The sidebar is collapsed by default.
- Clicking the rail button opens a left overlay panel.
- Clicking the same button again, pressing `Esc`, or clicking the overlay backdrop closes the panel.
- Opening the panel should not fully replace the reader stage; the main content remains visible.

### Mobile

- Do not keep a permanent icon rail that steals horizontal space.
- Expose the same sidebar content through a compact trigger near the top of the workspace.
- Open the content as a drawer-style overlay rather than a pushed layout.

## Interaction Details

- The open/close trigger must be keyboard accessible.
- The trigger should expose `aria-expanded` and a clear `aria-label`.
- The overlay should use a light backdrop so the temporary panel state is obvious.
- Motion should be short and subtle: a simple slide/fade is enough.

## Component Design

### `WorkspaceShell`

Responsibilities:

- Continue owning the fetched workspace data and mutation handlers.
- Add local UI state for the sidebar open/closed status.
- Pass existing `recent` and `templates` data into the new sidebar path.
- Remove the current inline placement of `RecentTemplatesPanel` from the main column.

### `WorkspaceSidebar` (new)

Responsibilities:

- Render the narrow left rail.
- Render the recents/templates panel container.
- Manage presentational layout for collapsed and expanded states.
- Accept callbacks and content data from `WorkspaceShell`.

This component should stay display-focused and avoid duplicating data-fetching logic.

### `RecentTemplatesPanel`

Responsibilities:

- Keep rendering the actual recent-session and template list content.
- Stay reusable as embedded panel content.
- Avoid assumptions that it always lives in the bottom of the main workspace column.

## Layout Strategy

Recommended approach: icon rail plus expandable panel.

Why this approach:

- It is the closest match to Obsidian's left-side navigation pattern.
- It keeps the entry discoverable even while collapsed.
- It creates a clean extension point for future sidebar tools without needing another structural refactor.

Alternatives considered:

- Floating hidden handle with overlay panel.
  - Lighter visually, but the entry is easier to miss.
- Push-layout sidebar.
  - Stable and simple, but it shrinks the main reading area too aggressively.

## Styling Direction

- Reuse the existing dark workspace palette, borders, and rounded surfaces.
- Keep the rail visually quieter than the main panel.
- Use a subtle active state for the open sidebar trigger.
- Avoid decorative motion or introducing a separate design system.

## Error Handling

- Existing recent/template empty states remain unchanged.
- If session/template hydration partially fails, the current workspace messaging remains the fallback.
- Sidebar open/close state must not interfere with the existing playback or source workflows.

## Testing Scope

- Workspace loads with the sidebar collapsed by default.
- Desktop trigger opens and closes the sidebar.
- Backdrop click closes the sidebar.
- `Esc` closes the sidebar.
- Recent session selection still loads playback.
- Recent session deletion still works.
- Template selection still injects source text.
- Mobile layout keeps the main content usable and does not permanently consume left-side width.

## Implementation Notes

- Prefer a small, focused new component rather than growing `WorkspaceShell` further.
- Keep files cohesive and avoid mixing layout chrome with session/template rendering details.
- Preserve immutability and existing state update patterns.

## Risks

- Overlay positioning could conflict with the current workspace stacking order.
- Mobile drawer behavior may need careful spacing to avoid overlapping existing controls.
- If the sidebar becomes a shared navigation pattern later, its naming and API should stay generic enough to expand.
