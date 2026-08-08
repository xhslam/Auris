# Desktop Glass Sidebar Redesign

## Goal

Make the desktop sidebar feel like a real glassmorphism desktop rail and unify the expanded and collapsed states into one coherent navigation system.

## Problem

The current sidebar uses a light panel in the expanded state and a different visual language in the collapsed state. The icon treatment also reads like placeholder badges instead of a stable desktop navigation system.

## Design

- Keep one shared sidebar component for both states.
- Use a translucent glass surface with blur, soft inner highlights, and a calmer shadow.
- Replace first-character placeholder badges with consistent navigation glyphs.
- Keep the same icon container, active treatment, and spacing rhythm in both expanded and collapsed states.
- Collapse should become a pure icon rail, not a compressed version of the text sidebar.

## Interaction Rules

- Expanded state shows icon, label, and description.
- Collapsed state shows only the icon tile while preserving the same active state language.
- The brand mark and collapse button should use the same glass control styling as the rest of the sidebar.

## Testing

- Preserve the existing collapsed-rail behavior test.
- Verify the sidebar component still renders the Anthropic brand mark and the active home link.
- Run lint and production build after the styling update.
