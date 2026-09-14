# Workspace Obsidian Dual Sidebar Design

- Date: 2026-03-22
- Project: `english-shadowing-web`
- Status: Approved in chat, awaiting file review before implementation

## Summary

Move the workspace recents/templates entry into a persistent, Obsidian-inspired left sidebar rail. The rail stays visible even when collapsed and shows two compact buttons at the top: `最近记录` and `模板`. Each button opens its own independent sidebar panel, with content styled and structured like an Obsidian file explorer instead of the current card-based panel.

## Goals

- Keep a full-height left rail visible at all times on desktop.
- Expose two distinct sidebar entry points instead of one combined panel.
- Make the expanded content feel like Obsidian:
  - dense list layout
  - tree/file-explorer affordances
  - lighter chrome, less card styling
- Preserve current behavior:
  - recent session resume
  - recent session delete
  - template load into source area
- Keep the main reading area visually focused when the sidebar is collapsed.

## Non-Goals

- Do not move notes, wordbook, sentencebook, or other tools into the left rail in this change.
- Do not redesign the whole workspace shell.
- Do not introduce a full multi-pane Obsidian clone; only adapt the recents/templates surfaces.

## User Experience

### Collapsed State

- A full-height vertical rail remains pinned on the left side of the workspace.
- The rail uses the same dark workspace palette, but with a slimmer, quieter appearance than the current floating sidebar control.
- Two compact buttons sit at the top of the rail:
  - `最近记录`
  - `模板`
- No content panel is visible by default.

### Expanded State

- Clicking one of the two rail buttons opens a panel to the right of the rail.
- Only one panel may be open at a time.
- Clicking the active button again closes the panel.
- Clicking outside the panel or pressing `Esc` closes it.

### Recent Records Panel

- Structured like a compact file list instead of large stacked cards.
- Each row behaves like a file item:
  - leading icon/marker area
  - primary title
  - smaller muted metadata line
- Delete becomes a subtle row action that appears on hover/focus rather than a large standalone button.
- Clicking the row resumes the selected recent session and closes the panel.

### Templates Panel

- Structured like a tree view.
- Templates are grouped into collapsible sections by difficulty:
  - `简单`
  - `中等`
  - `进阶`
- Group headers behave like folders.
- Template items behave like files.
- Clicking a template row loads it into the source area and closes the panel.

## Interaction Model

### Rail Buttons

- The two rail buttons are independent entry points.
- State shape should support:
  - `null`
  - `"recent"`
  - `"templates"`
- Switching from one open panel to the other should replace the panel in place without requiring an intermediate close.

### Accessibility

- Rail buttons use `aria-expanded` and `aria-controls`.
- Expanded panel remains keyboard reachable.
- `Esc` closes the current panel.
- Hover-only actions must still be available on keyboard focus.

## Component Design

### `workspace-shell.tsx`

Responsible for:

- holding the active sidebar panel state
- passing recent data to the recent panel
- passing template data to the template panel
- closing the panel after row actions that return focus to the main workspace

Recommended state:

```ts
type ActiveSidebarPanel = "recent" | "templates" | null;
```

### `workspace-sidebar.tsx`

Responsible for:

- rendering the full-height rail
- rendering the two top rail buttons
- rendering the active panel shell
- closing on backdrop click and `Escape`

This component should not own data-fetching logic.

### `recent-templates-panel.tsx`

Refactor away from the current card stack.

Preferred structure:

- `RecentRecordsTree`
- `TemplateTree`

These can be exported separately or split into focused internal subcomponents, but the final render shape should support a true explorer-style layout rather than a combined card feed.

## Visual Design

### Rail

- full-height rounded slot
- narrow width
- quiet background and border
- two compact square or rounded-square buttons aligned near the top
- default look should resemble a docked sidebar gutter, not a floating pill

### Panel

- narrower than the current recents panel
- lighter visual chrome
- minimal shadow
- clearer vertical rhythm
- thin custom scrollbar

### Tree Rows

- single-line dominant title
- optional smaller metadata beneath
- hover highlight similar to file selection
- selected state with stronger background tint
- small disclosure indicators for template groups

## Responsive Behavior

- Desktop keeps the persistent full-height rail.
- Smaller screens can still collapse to a drawer-like behavior, but the desktop Obsidian layout is the priority.
- The main content area must not be permanently compressed more than necessary when the panel is closed.

## Testing

Add or update tests to verify:

- the full-height rail is present by default
- both rail buttons render in collapsed state
- clicking `最近记录` opens the recent panel only
- clicking `模板` opens the template panel only
- clicking the same button again closes the panel
- `Esc` and backdrop click close the active panel
- recent session row actions still work
- template row actions still work
- delete action still works from the recent panel

## Risks

### Risk: current combined panel assumptions leak into the new structure

Mitigation:
- split rendering into explicit recent/template sections rather than styling the old combined list harder

### Risk: hover-only action affordances become inaccessible

Mitigation:
- ensure row action buttons appear on focus and remain keyboard reachable

### Risk: rail + panel spacing collides with the reading area

Mitigation:
- keep the rail narrow and review desktop padding after the panel width is finalized

## Implementation Notes

- Reuse current recent/template data and callbacks.
- Keep this scoped to the recents/templates sidebar only.
- Match the existing workspace dark theme instead of introducing a new light Obsidian palette.
- The current workspace folder is not inside a Git repository, so a commit may not be possible unless Git is initialized later.

## Review Constraint

- Subagent-based spec review was not run because this session does not have explicit user permission to delegate work to subagents.
