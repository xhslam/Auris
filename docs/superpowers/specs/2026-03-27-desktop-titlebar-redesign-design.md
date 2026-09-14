# Desktop Titlebar Redesign

## Goal

Replace the placeholder-symbol desktop header with a real desktop-style titlebar that feels intentional, readable, and consistent across the app.

## Problem

The current desktop header still shows symbolic placeholder buttons like `=`, `*`, `?`, and `/`. They read like unfinished scaffolding instead of a real product titlebar.

## Design

The new header should behave like a lightweight desktop titlebar:

- Left side keeps a single sidebar control.
- Center keeps the page subtitle and title.
- Right side keeps only two explicit actions: search and help.
- Workspace status chips move out of the titlebar into a secondary status strip below it.

## Interaction Rules

- The sidebar control toggles the existing collapsed sidebar state.
- Search and help remain simple top-level actions with clear labels.
- The titlebar never renders placeholder symbol-only buttons.

## Visual Direction

- Rounded, light desktop surface.
- Compact labeled controls instead of icon-only placeholders.
- Clear separation between titlebar controls and workspace status.

## Testing

- Add a component test that asserts labeled actions render.
- Assert the old placeholder symbols are no longer visible.
- Verify the workspace status still renders in the new secondary strip.
