# Shared Auth Background Frame

- Date: 2026-03-24
- Project: `english-shadowing-web`
- Status: Approved in chat, awaiting file review before implementation

## Summary

Reuse the login page's background treatment across the main product pages without changing their internal layout structure. The login background should be extracted into a shared visual frame so `workspace`, `notes`, and `assessment` can inherit the same atmospheric backdrop while preserving their existing shells, spacing, panels, and interaction patterns.

## Goals

- Perfectly reuse the login page background language on non-auth pages.
- Keep `workspace`, `notes`, and `assessment` content layout intact.
- Avoid duplicating the login background DOM and CSS across multiple pages.
- Make future visual tuning easier by centralizing the background implementation.

## Non-Goals

- Do not make non-auth pages look like login forms.
- Do not move or redesign the business content inside `WorkspaceShell`, `NotesShell`, or `AssessmentShell`.
- Do not rework routing, auth flow, or page logic.
- Do not introduce a second competing background system.

## Chosen Approach

### Approach A: Shared background frame

Create a reusable visual wrapper that owns the login page background layers and decorative structure. Auth pages continue to use the existing auth shell composition, while non-auth shells render their current content inside the same background frame.

This was chosen because it gives the closest visual match with the lowest long-term maintenance cost.

## Rejected Alternatives

### Approach B: Copy markup into every page shell

- Fast to start
- High duplication cost
- Easy for visuals to drift over time

### Approach C: Reuse only CSS tokens and gradients

- Smallest apparent change
- Not sufficient for a true reproduction because the login background depends on layered structure, not just page-level background values

## Visual Boundary

The shared frame should include only the login page's background and atmosphere layers:

- book silhouette
- glow fields
- vignette / dark falloff
- left-stage environmental depth
- any shared positional wrappers needed to render those elements correctly

The shared frame must not include login-specific foreground content:

- auth headline
- auth subtitle
- metrics copy
- form card content

This keeps the background identical while leaving each page's content untouched.

## Composition Strategy

### Shared background layer

Extract the background visuals currently embedded in the auth shell into a standalone component that can sit behind arbitrary page content.

### Foreground content layer

Each consuming page provides its own content as children. That content remains visually and structurally independent from the background system.

### Layering rules

- Background visuals must stay non-interactive.
- Decorative layers must sit below all page content.
- Existing dialogs, sidebars, sticky bars, and fixed controls must continue to render above the background frame.

## Component Impact

### `src/components/auth/auth-shell.tsx`

- Keep the auth-specific story and card composition.
- Replace direct ownership of shared background structure with the new frame component.
- Preserve login/register page appearance after extraction.

### New shared background component

- Add a component under a shared UI or shell area, responsible only for the login background treatment.
- Accept children so other shells can render their existing content inside the frame.
- Expose a minimal API; ideally children-only unless a layout variant is actually needed.

### `src/components/workspace/workspace-shell.tsx`

- Wrap the current root shell in the shared background frame.
- Keep all existing grid, fixed sidebar, overlays, and reader layout logic intact.

### `src/components/notes/notes-shell.tsx`

- Wrap the notes shell in the shared background frame.
- Preserve notes-specific header, sidebar, editor, and library panel layout.

### `src/components/assessment/assessment-shell.tsx`

- Wrap the assessment shell in the shared background frame.
- Preserve sidebar, composer, cards, and toolbar layout.

### `src/app/globals.css`

- Move login background-related selectors to shared frame selectors where appropriate.
- Keep auth-only selectors separate from shared background selectors.
- Remove or reduce conflicting page-root background treatments if they visually stack against the shared frame.

## Styling Rules

- Preserve the current login page background look exactly, not an approximation.
- Centralize shared background geometry and decoration in one place.
- Leave page-specific surface styles, panel styles, and card styles unchanged unless they conflict with background rendering.
- Prefer additive changes over broad refactors so layout regressions stay low risk.

## Responsive Behavior

- Desktop should match the current login background presentation.
- Tablet should keep the same silhouette and glow structure with the same fallback behavior already used by the auth experience.
- Mobile should continue using the toned-down auth background behavior so decorative elements do not crowd the page content.

## Risks

### Risk: extracted background no longer matches login exactly

Mitigation:
- make the auth shell consume the same shared frame first, then extend that frame to other pages

### Risk: non-auth page layouts collide with background positioning

Mitigation:
- keep the shared frame purely decorative and avoid changing foreground layout containers

### Risk: stacked page backgrounds create muddy visuals

Mitigation:
- audit root-level and shell-level background declarations on consuming pages and remove only the conflicting outermost layer

### Risk: fixed overlays appear under the decorative frame

Mitigation:
- keep background z-index low and pointer events disabled

## Verification

- Confirm the login page still looks unchanged after extraction.
- Confirm `workspace`, `notes`, and `assessment` show the same background atmosphere as login.
- Confirm foreground layout dimensions remain stable on the three adopted pages.
- Confirm sidebars, dialogs, playback dock, and settings overlays remain interactive and visually above the background.
- Confirm mobile and tablet breakpoints still render without crowding or overlap.

## Implementation Notes

- The project folder is not currently inside a Git repository, so the spec cannot be committed from this workspace state.
- Subagent-based spec review was not run because this session does not have explicit user permission to delegate work to subagents.
