# Login Left Book and Black Stage Addendum

- Date: 2026-03-23
- Project: `english-shadowing-web`
- Status: Approved in chat and implemented in the same session

## Summary

Refine the current Apple-like login page so the half-open book silhouette lives entirely on the left side of the composition, while the login card gains its own soft-edged pure black backdrop. The page should feel more clearly split into two moods: left for reading atmosphere, right for quiet sign-in focus.

## Goals

- Keep the book silhouette fully contained in the left visual field.
- Avoid the book drifting behind the login area.
- Add a soft black stage behind the login card only.
- Preserve the current lighter, restrained dark aesthetic instead of turning the full page into flat black.

## Non-Goals

- Do not redesign auth behavior or form fields.
- Do not replace the book silhouette with illustration or photography.
- Do not introduce a hard rectangular black panel.

## Composition Changes

### Left Side

- The half-open book remains large and atmospheric.
- Its mass should be anchored to the far left edge and left half of the page.
- The reading copy should sit on a cleaner tonal pocket to the right of the book, not on top of its brightest area.

### Right Side

- The login card keeps the current glass-like shell.
- Behind it, add a large soft-edged black field with the darkest value at the center and a gradual falloff into the page background.
- The black field should read like a quiet stage, not a box.

## Visual Intent

- Left side: subtle reading environment
- Right side: pure, calm login focus
- Transition: gentle tonal fade between both zones, with no sharp seam

## Component Impact

### `src/app/globals.css`

- Reposition and constrain the book silhouette to the left half.
- Adjust story column sizing so the copy sits farther right inside the left column.
- Add a dedicated soft-edged black backdrop behind the login card.
- Remove or weaken any right-side glow that fights the black stage.

### `src/components/auth/auth-shell.tsx`

- Keep the current structure unless a tiny wrapper adjustment is needed.

## Responsive Notes

- Desktop should show the strongest split between book zone and login zone.
- Tablet should preserve the same relationship with reduced spread.
- Mobile should tone both effects down so the form remains the priority.

## Risks

- If the black stage is too hard-edged, it will feel like an overlay block.
- If the book stays too centered, the composition will still feel muddy.
- If the left story content is not rebalanced, the page can look empty on the far left and crowded near the middle.

## Notes

- This is a refinement of the already-implemented Apple-style auth redesign and book silhouette addendum.
- The current project folder is not inside a Git repository, so commit steps may not be possible in this environment.
